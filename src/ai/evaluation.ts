import { applyJuiceAwards, calculateShipmentScore, COLS, FRUITS, getChainScoreMultiplier, getDifficultyConfig, ROWS, isFruitCell, isWaterCell } from "../core";
import type { Board, Fruit, FruitRecord } from "../core";
import type { AiPolicy } from "./policy";
import type { PlacementCandidate, ResolveSummary, SimState } from "./simulation";
import type { AiGameSnapshot } from "./types";

type BoardMetrics = {
  totalHeight: number;
  maxHeight: number;
  holes: number;
  topRisk: number;
  adjacentPairs: number;
  readyTriples: number;
  waterCells: number;
  waterAdjacency: number;
};

export function evaluatePlacement(candidate: PlacementCandidate, state: SimState, snapshot: AiGameSnapshot, policy: AiPolicy): number {
  const metrics = getBoardMetrics(candidate.board);
  const setup = metrics.adjacentPairs + metrics.readyTriples * 4;
  const stockGain = stockDeltaValue(state, candidate, snapshot, policy);
  const mode = modePlacementBonus(candidate, metrics, snapshot);
  const survival = Math.max(0, ROWS * COLS - metrics.totalHeight) * policy.survivalWeight * 0.015;
  return (
    candidate.score * policy.immediateClearWeight +
    candidate.chain * policy.chainWeight +
    getChainScoreMultiplier(candidate.chain) * 90 +
    setup * policy.chainSetupWeight +
    stockGain +
    mode +
    survival +
    candidate.landingY * 3 -
    metrics.totalHeight * policy.heightWeight -
    metrics.holes * policy.holeWeight -
    metrics.topRisk * policy.topRiskWeight -
    metrics.maxHeight * 4
  );
}

export function evaluateTerminal(board: Board, state: SimState, snapshot: AiGameSnapshot, policy: AiPolicy): number {
  const metrics = getBoardMetrics(board);
  const stock = totalStock(state.juiceStock);
  const shipment = snapshot.shipment.enabled ? calculateShipmentScore(stock, 1) * 0.16 : 0;
  return (
    metrics.adjacentPairs * policy.chainSetupWeight +
    metrics.readyTriples * policy.chainSetupWeight * 4 +
    stock * policy.stockValueWeight +
    shipment -
    metrics.totalHeight * policy.heightWeight -
    metrics.holes * policy.holeWeight -
    metrics.topRisk * policy.topRiskWeight -
    metrics.maxHeight * 6
  );
}

export function evaluateJuice(summary: ResolveSummary, fruit: Fruit, snapshot: AiGameSnapshot, policy: AiPolicy): number {
  const before = getBoardMetrics(snapshot.board);
  const after = getBoardMetrics(summary.board);
  const dangerRelief = Math.max(0, before.topRisk - after.topRisk) * 150 + Math.max(0, before.maxHeight - after.maxHeight) * 42;
  const clearValue = summary.clearScore + summary.removed * 45 + summary.chain * 180;
  const setupValue = (after.readyTriples - before.readyTriples) * policy.chainSetupWeight * 4 + (after.adjacentPairs - before.adjacentPairs) * policy.chainSetupWeight;
  const mode = modeJuiceBonus(fruit, summary, snapshot);
  const holdPenalty = juiceHoldPenalty(snapshot, policy);
  return clearValue + dangerRelief + setupValue + mode - holdPenalty - after.topRisk * 18;
}

export function shouldHoldJuice(snapshot: AiGameSnapshot, policy: AiPolicy): boolean {
  if (snapshot.settings.mode === "waterCleanup") return false;
  if (!snapshot.shipment.enabled) return false;
  if (getBoardMetrics(snapshot.board).topRisk >= policy.dangerJuiceThreshold) return false;
  return snapshot.shipment.remainingMs <= policy.shipmentHoldSeconds * 1000 && totalStock(snapshot.juiceStock) > 0;
}

export function getBoardMetrics(board: Board): BoardMetrics {
  let totalHeight = 0;
  let maxHeight = 0;
  let holes = 0;
  let topRisk = 0;
  let waterCells = 0;
  for (let x = 0; x < COLS; x += 1) {
    let seenFruit = false;
    let height = 0;
    for (let y = 0; y < ROWS; y += 1) {
      if (board[y][x]) {
        if (isWaterCell(board[y][x])) waterCells += 1;
        seenFruit = true;
        if (height === 0) height = ROWS - y;
        if (y < 3) topRisk += 3 - y;
      } else if (seenFruit) {
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

function totalStock(stock: FruitRecord): number {
  return FRUITS.reduce((total, fruit) => total + stock[fruit], 0);
}

function stockDeltaValue(state: SimState, candidate: PlacementCandidate, snapshot: AiGameSnapshot, policy: AiPolicy): number {
  const next = applyJuiceAwards({
    juiceProgress: state.juiceProgress,
    juiceStock: state.juiceStock,
    awards: candidate.juiceAwards,
    featuredFruit: snapshot.featuredFruit,
    difficulty: getDifficultyConfig(snapshot.settings.difficulty),
  });
  const gained = Math.max(0, totalStock(next.juiceStock) - totalStock(state.juiceStock));
  let value = gained * policy.stockValueWeight;
  if (snapshot.shipment.enabled && totalStock(state.juiceStock) > 0) {
    value += snapshot.shipment.previewScore * 0.04;
  }
  return value;
}

function modePlacementBonus(candidate: PlacementCandidate, metrics: BoardMetrics, snapshot: AiGameSnapshot): number {
  if (snapshot.settings.mode === "chainChallenge") {
    const remaining = snapshot.challenge.remainingMs ?? 60_000;
    const urgency = remaining < 15_000 ? 1.55 : remaining < 30_000 ? 1.25 : 1;
    const bestChainGain = Math.max(0, candidate.chain - snapshot.challenge.runBestChain);
    return candidate.chain * 560 * urgency + bestChainGain * 360 + metrics.readyTriples * 300 + metrics.adjacentPairs * 16;
  }
  if (snapshot.settings.mode === "scoreAttack") {
    const target = snapshot.challenge.targetScore ?? snapshot.score;
    const deficit = Math.max(0, target - snapshot.score);
    const targetPressure = deficit <= 120_000 ? 1.35 : 1;
    const shipmentValue = snapshot.shipment.enabled ? snapshot.shipment.previewScore * 0.08 : 0;
    return Math.min(900, deficit / 1000) + candidate.score * 0.5 * targetPressure + shipmentValue;
  }
  if (snapshot.settings.mode === "waterCleanup") {
    const before = getBoardMetrics(snapshot.board);
    const waterCleared = Math.max(0, before.waterCells - metrics.waterCells);
    const adjacencyGain = Math.max(0, metrics.waterAdjacency - before.waterAdjacency);
    return waterCleared * 620 + adjacencyGain * 150 + metrics.waterAdjacency * 90 + candidate.removed * 12;
  }
  return 0;
}

function modeJuiceBonus(fruit: Fruit, summary: ResolveSummary, snapshot: AiGameSnapshot): number {
  if (snapshot.settings.mode === "chainChallenge" && (fruit === "berry" || fruit === "lemon" || fruit === "melon")) {
    const bestChainGain = Math.max(0, summary.chain - snapshot.challenge.runBestChain);
    return 300 + summary.chain * 150 + bestChainGain * 300;
  }
  if (snapshot.settings.mode === "scoreAttack") {
    const target = snapshot.challenge.targetScore ?? snapshot.score;
    const deficit = Math.max(0, target - snapshot.score);
    const targetPressure = deficit <= 120_000 ? 1.25 : 1;
    return summary.clearScore * 0.55 * targetPressure;
  }
  if (snapshot.settings.mode === "waterCleanup") {
    const before = getBoardMetrics(snapshot.board);
    const after = getBoardMetrics(summary.board);
    const waterCleared = Math.max(0, before.waterCells - after.waterCells);
    const openedWater = Math.max(0, before.waterAdjacency - after.waterAdjacency);
    const target = snapshot.challenge.targetWaterClears ?? 0;
    const remainingAfter = Math.max(0, target - snapshot.challenge.runWaterClears - waterCleared);
    const clearBonus = target > 0 && remainingAfter === 0 ? 2_400 : 0;
    return waterCleared * 760 + openedWater * 190 + clearBonus;
  }
  return 0;
}

function juiceHoldPenalty(snapshot: AiGameSnapshot, policy: AiPolicy): number {
  if (!shouldHoldJuice(snapshot, policy)) return 0;
  return policy.shipmentHoldBonus + snapshot.shipment.previewScore * 0.25;
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
