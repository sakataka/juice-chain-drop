import { applyJuiceAwards, calculateShipmentScore, COLS, FRUITS, getChainScoreMultiplier, getDifficultyConfig, ROWS, isFruitCell, isWaterCell, resolveBoardRules } from "../core";
import type { Board, DifficultyConfig, Fruit, FruitRecord } from "../core";
import { AI_PHASE_WEIGHTS } from "./policy";
import type { AiPolicy } from "./policy";
import { cloneBoard } from "./simulation";
import type { PlacementCandidate, SimState } from "./simulation";
import type { AiGameSnapshot, AiPhase } from "./types";

export type BoardMetrics = {
  totalHeight: number;
  maxHeight: number;
  holes: number;
  topRisk: number;
  adjacentPairs: number;
  readyTriples: number;
  waterCells: number;
  waterAdjacency: number;
};

export type ChainPotential = {
  bestTriggerChain: number;
  triggerOptions: number;
};

export type AiEvaluationContext = {
  snapshot: AiGameSnapshot;
  policy: AiPolicy;
  phase: AiPhase;
  difficulty: DifficultyConfig;
  chainPotentialCache: Map<string, ChainPotential>;
};

export function evaluatePlacement(candidate: PlacementCandidate, state: SimState, context: AiEvaluationContext): number {
  const { snapshot, phase } = context;
  const weights = AI_PHASE_WEIGHTS[phase];
  const before = getBoardMetrics(state.board);
  const metrics = getBoardMetrics(candidate.board);
  const setup = metrics.adjacentPairs + metrics.readyTriples * 4;
  const potential = needsChainPotential(phase) ? getChainPotential(candidate.board, context.difficulty, context.chainPotentialCache) : EMPTY_CHAIN_POTENTIAL;
  const stockGain = stockDeltaValue(state, candidate, snapshot) * weights.stock;
  const survival = Math.max(0, ROWS * COLS - metrics.totalHeight) * weights.survival * 0.015;
  const recordGain = Math.max(0, candidate.chain - state.bestChain);
  const waterCleared = Math.max(0, before.waterCells - metrics.waterCells);
  const clearPenalty = candidate.chain > 0 ? weights.clearPenalty : 0;
  const nonRecordClearPenalty = candidate.chain > 0 && recordGain === 0 ? weights.nonRecordClearPenalty : 0;
  const completionBonus = getCompletionBonus(candidate, waterCleared, state, context);

  return (
    candidate.score * weights.score +
    candidate.chain * weights.chain +
    getChainScoreMultiplier(candidate.chain) * weights.chain * 0.4 +
    recordGain * recordGain * weights.recordGain +
    setup * weights.chainSetup +
    potential.bestTriggerChain * weights.chainPotential +
    potential.triggerOptions * weights.triggerOptions +
    stockGain +
    waterCleared * weights.waterCleared +
    metrics.waterAdjacency * weights.waterAdjacency +
    survival +
    completionBonus +
    candidate.landingY * 3 -
    clearPenalty -
    nonRecordClearPenalty -
    metrics.totalHeight * weights.height -
    metrics.holes * weights.holes -
    metrics.topRisk * weights.topRisk -
    metrics.maxHeight * 4
  );
}

export function evaluateTerminal(board: Board, state: SimState, context: AiEvaluationContext): number {
  const weights = AI_PHASE_WEIGHTS[context.phase];
  const metrics = getBoardMetrics(board);
  const stock = totalStock(state.juiceStock);
  const shipment = context.snapshot.shipment.enabled ? calculateShipmentScore(stock, 1) * 0.16 : 0;
  const potential = needsChainPotential(context.phase) ? getChainPotential(board, context.difficulty, context.chainPotentialCache) : EMPTY_CHAIN_POTENTIAL;
  return (
    metrics.adjacentPairs * weights.chainSetup +
    metrics.readyTriples * weights.chainSetup * 4 +
    potential.bestTriggerChain * weights.chainPotential +
    potential.triggerOptions * weights.triggerOptions +
    stock * weights.stock +
    shipment * weights.score -
    metrics.totalHeight * weights.height -
    metrics.holes * weights.holes -
    metrics.topRisk * weights.topRisk -
    metrics.maxHeight * 6
  );
}

export function getChainPotential(board: Board, difficulty: DifficultyConfig, cache?: Map<string, ChainPotential>): ChainPotential {
  const key = cache ? boardKey(board) : "";
  const cached = cache?.get(key);
  if (cached) return cached;

  let bestTriggerChain = 0;
  let triggerOptions = 0;
  for (let x = 0; x < COLS; x += 1) {
    const landingY = getSingleFruitLandingY(board, x);
    if (landingY <= 0) continue;
    const possibleTriggers = getAdjacentFruits(board, x, landingY);
    for (const fruit of possibleTriggers) {
      const probe = cloneBoard(board);
      probe[landingY][x] = fruit;
      const resolved = resolveBoardRules(probe, { difficulty });
      if (resolved.chain <= 0) continue;
      triggerOptions += 1;
      bestTriggerChain = Math.max(bestTriggerChain, resolved.chain);
    }
  }

  const result = { bestTriggerChain, triggerOptions };
  cache?.set(key, result);
  return result;
}

export function getBoardMetrics(board: Board): BoardMetrics {
  let totalHeight = 0;
  let maxHeight = 0;
  let holes = 0;
  let topRisk = 0;
  let waterCells = 0;
  for (let x = 0; x < COLS; x += 1) {
    let seenCell = false;
    let height = 0;
    for (let y = 0; y < ROWS; y += 1) {
      if (board[y][x]) {
        if (isWaterCell(board[y][x])) waterCells += 1;
        seenCell = true;
        if (height === 0) height = ROWS - y;
        if (y < 3) topRisk += 3 - y;
      } else if (seenCell) {
        holes += 1;
      }
    }
    totalHeight += height;
    maxHeight = Math.max(maxHeight, height);
  }
  return {
    totalHeight,
    maxHeight,
    holes,
    topRisk,
    adjacentPairs: adjacentPotential(board),
    readyTriples: readyTripleCount(board),
    waterCells,
    waterAdjacency: waterAdjacencyValue(board),
  };
}

const EMPTY_CHAIN_POTENTIAL: ChainPotential = { bestTriggerChain: 0, triggerOptions: 0 };

function needsChainPotential(phase: AiPhase): boolean {
  return phase === "chainBuild" || phase === "chainTrigger";
}

function totalStock(stock: FruitRecord): number {
  return FRUITS.reduce((total, fruit) => total + stock[fruit], 0);
}

function stockDeltaValue(state: SimState, candidate: PlacementCandidate, snapshot: AiGameSnapshot): number {
  const next = applyJuiceAwards({
    juiceProgress: state.juiceProgress,
    juiceStock: state.juiceStock,
    awards: candidate.juiceAwards,
    featuredFruit: snapshot.featuredFruit,
    difficulty: getDifficultyConfig(snapshot.settings.difficulty),
  });
  return Math.max(0, totalStock(next.juiceStock) - totalStock(state.juiceStock));
}

function getCompletionBonus(candidate: PlacementCandidate, waterCleared: number, state: SimState, context: AiEvaluationContext): number {
  if (context.phase === "scoreRush") {
    const target = context.snapshot.challenge.targetScore;
    if (target && state.score < target && state.score + candidate.score >= target) return 5_000;
  }
  if (context.phase === "waterClear") {
    const target = context.snapshot.challenge.targetWaterClears;
    if (target && state.waterClears + waterCleared >= target) return 5_000;
  }
  return 0;
}

function getSingleFruitLandingY(board: Board, x: number): number {
  for (let y = 0; y < ROWS; y += 1) {
    if (board[y][x] !== null) return y - 1;
  }
  return ROWS - 1;
}

function getAdjacentFruits(board: Board, x: number, y: number): Set<Fruit> {
  const fruits = new Set<Fruit>();
  for (const [neighborX, neighborY] of [
    [x - 1, y],
    [x + 1, y],
    [x, y + 1],
  ]) {
    const cell = board[neighborY]?.[neighborX];
    if (isFruitCell(cell)) fruits.add(cell);
  }
  return fruits;
}

function boardKey(board: Board): string {
  return board.map((row) => row.map((cell) => cell?.[0] ?? ".").join("")).join("");
}

function adjacentPotential(board: Board): number {
  let total = 0;
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const fruit = board[y][x];
      if (!isFruitCell(fruit)) continue;
      if (board[y]?.[x + 1] === fruit) total += 1;
      if (board[y + 1]?.[x] === fruit) total += 1;
    }
  }
  return total;
}

function readyTripleCount(board: Board): number {
  let triples = 0;
  const visited = new Set<string>();
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const fruit = board[y][x];
      if (!isFruitCell(fruit)) continue;
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      const size = collectGroupSize(board, x, y, fruit, visited);
      if (size === 3) triples += 1;
    }
  }
  return triples;
}

function waterAdjacencyValue(board: Board): number {
  let total = 0;
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (!isFruitCell(board[y][x])) continue;
      if (isWaterCell(board[y]?.[x + 1])) total += 1;
      if (isWaterCell(board[y]?.[x - 1])) total += 1;
      if (isWaterCell(board[y + 1]?.[x])) total += 1;
      if (isWaterCell(board[y - 1]?.[x])) total += 1;
    }
  }
  return total;
}

function collectGroupSize(board: Board, startX: number, startY: number, fruit: Fruit, visited: Set<string>): number {
  const stack: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];
  let size = 0;
  while (stack.length > 0) {
    const cell = stack.pop();
    if (!cell) continue;
    size += visitConnected(board, cell.x, cell.y, fruit, visited, stack);
  }
  return size;
}

function visitConnected(board: Board, x: number, y: number, fruit: Fruit, visited: Set<string>, stack: Array<{ x: number; y: number }>): number {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS || board[y][x] !== fruit) return 0;
  const key = `${x},${y}`;
  if (visited.has(key)) return 0;
  visited.add(key);
  stack.push({ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 });
  return 1;
}
