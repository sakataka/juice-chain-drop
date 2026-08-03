import {
  applyJuiceAwards,
  applyJuiceEffectRules,
  calculateJuiceEffectBonus,
  COLS,
  cloneBoard,
  cloneFruitRecord,
  getJuiceEffectCenter,
  getPieceCells,
  isValidPiece,
  makeJuiceDrop,
  makePiece,
  movedPiece,
  resolveBoardRules,
} from "../core";
import type { Board, DifficultyConfig, Fruit, FruitRecord, NextPiecePreview, PairPiece } from "../core";
import type { AiCommand } from "./types";

export type PlacementCandidate = {
  commands: AiCommand[];
  board: Board;
  score: number;
  chain: number;
  removed: number;
  removedByFruit: FruitRecord;
  juiceAwards: FruitRecord[];
  landingY: number;
};

export type SimState = {
  board: Board;
  nextPreviews: NextPiecePreview[];
  juiceStock: FruitRecord;
  juiceProgress: FruitRecord;
  featuredFruit: Fruit;
  score: number;
  bestChain: number;
  waterClears: number;
};

export type ResolveSummary = {
  board: Board;
  chain: number;
  removed: number;
  removedByFruit: FruitRecord;
  juiceAwards: FruitRecord[];
  clearScore: number;
};

const ROTATION_COUNT = 4;
const FALLBACK_DIFFICULTY: DifficultyConfig = {
  id: "normal",
  label: "Normal",
  dropInterval: 0,
  slowDropInterval: 0,
  scoreMultiplier: 1,
  juiceThreshold: 4,
  waterIntervalMs: { min: 0, max: 0 },
  waterBurst: { min: 1, max: 1 },
  progressionStageDurationMs: 60_000,
};

export { cloneBoard, cloneFruitRecord };

export function enumeratePlacements(board: Board, active: PairPiece, difficulty?: DifficultyConfig): PlacementCandidate[] {
  const candidates: PlacementCandidate[] = [];
  const rotationCount = active.kind === "juiceDrop" ? 1 : ROTATION_COUNT;
  for (let rotations = 0; rotations < rotationCount; rotations += 1) {
    const rotated = withRotation(active, rotations);
    for (let x = -1; x <= COLS; x += 1) {
      const piece = { ...rotated, axis: { ...rotated.axis, x } };
      if (!isValidPiece(board, piece)) continue;
      const landed = dropPiece(board, piece);
      if (!landed || getPieceCells(landed).some((cell) => cell.y <= 0)) continue;
      const settled = settleOnClone(board, landed, difficulty);
      candidates.push({
        commands: commandsFor(active, rotations, x),
        board: settled.board,
        score: settled.clearScore,
        chain: settled.chain,
        removed: settled.removed,
        removedByFruit: settled.removedByFruit,
        juiceAwards: settled.juiceAwards,
        landingY: landed.axis.y,
      });
    }
  }
  return candidates;
}

export function simulatePlacement(state: SimState, candidate: PlacementCandidate, difficulty: DifficultyConfig): SimState {
  const nextProgress = { ...state.juiceProgress };
  const nextStock = { ...state.juiceStock };
  const juice = applyJuiceAwards({
    juiceProgress: nextProgress,
    juiceStock: nextStock,
    awards: candidate.juiceAwards,
    featuredFruit: state.featuredFruit,
    difficulty,
  });
  return {
    board: cloneBoard(candidate.board),
    nextPreviews: state.nextPreviews.slice(1).map(clonePreview),
    juiceProgress: juice.juiceProgress,
    juiceStock: juice.juiceStock,
    featuredFruit: state.featuredFruit,
    score: state.score + candidate.score,
    bestChain: Math.max(state.bestChain, candidate.chain),
    waterClears: state.waterClears + countWater(state.board) - countWater(candidate.board),
  };
}

export function nextActiveFromPreviews(nextPreviews: NextPiecePreview[]): PairPiece | null {
  const preview = nextPreviews[0];
  if (!preview) return null;
  return preview.kind === "juiceDrop" ? makeJuiceDrop(preview.fruit) : makePiece(preview.pair);
}

export function simulateJuice(state: SimState, active: PairPiece | null, fruit: Fruit, difficulty: DifficultyConfig): ResolveSummary {
  const juice = applyJuiceEffectRules(state.board, { primary: fruit, center: getJuiceEffectCenter(active), activeAxisFruit: active?.axis.fruit });
  const summary = resolveBoardRules(juice.board, { difficulty });
  return {
    ...summary,
    clearScore: summary.clearScore + calculateJuiceEffectBonus(fruit, juice.effect.cells.length, difficulty),
  };
}

export function clonePreview(preview: NextPiecePreview): NextPiecePreview {
  return preview.kind === "juiceDrop" ? { kind: "juiceDrop", fruit: preview.fruit } : { kind: "fruitPair", pair: [preview.pair[0], preview.pair[1]] };
}

function settleOnClone(board: Board, piece: PairPiece, difficulty?: DifficultyConfig): ResolveSummary {
  const copy = cloneBoard(board);
  if (piece.kind === "juiceDrop") {
    const effectiveDifficulty = difficulty ?? FALLBACK_DIFFICULTY;
    const juice = applyJuiceEffectRules(copy, {
      primary: piece.axis.fruit,
      center: getJuiceEffectCenter(piece),
      activeAxisFruit: piece.axis.fruit,
    });
    const resolved = resolveBoardRules(juice.board, { difficulty: effectiveDifficulty });
    return {
      ...resolved,
      clearScore: resolved.clearScore + calculateJuiceEffectBonus(piece.axis.fruit, juice.effect.cells.length, effectiveDifficulty),
    };
  }
  for (const cell of getPieceCells(piece)) {
    copy[cell.y][cell.x] = cell.fruit;
  }
  if (difficulty) return resolveBoardRules(copy, { difficulty });
  return resolveBoardWithoutDifficulty(copy);
}

function withRotation(piece: PairPiece, rotation: number): PairPiece {
  return {
    kind: piece.kind,
    axis: { ...piece.axis },
    satellite: { ...piece.satellite, rotation },
  };
}

function dropPiece(board: Board, piece: PairPiece): PairPiece | null {
  let landed = piece;
  if (!isValidPiece(board, landed)) return null;
  while (isValidPiece(board, movedPiece(landed, 0, 1))) {
    landed = movedPiece(landed, 0, 1);
  }
  return landed;
}

function commandsFor(active: PairPiece, rotations: number, targetX: number): AiCommand[] {
  const commands: AiCommand[] = [];
  for (let index = 0; index < rotations; index += 1) commands.push({ kind: "rotate" });
  const dx = targetX - active.axis.x;
  const step: -1 | 1 = dx < 0 ? -1 : 1;
  for (let index = 0; index < Math.abs(dx); index += 1) commands.push({ kind: "move", dx: step });
  commands.push({ kind: "hardDrop" });
  return commands;
}

function resolveBoardWithoutDifficulty(board: Board): ResolveSummary {
  return resolveBoardRules(board, { difficulty: FALLBACK_DIFFICULTY });
}

function countWater(board: Board): number {
  let total = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell === "water") total += 1;
    }
  }
  return total;
}
