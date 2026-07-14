import { calculateClearScore, calculateJuiceUseBonus } from "./balance";
import { applyGravity, findClearGroups, inBounds, neighbors } from "./board";
import { COLS, FRUITS, ROWS } from "./constants";
import { clamp, initialFruitRecord, isFruitCell, isWaterCell, positionsFromSet } from "./utils";
import type { Board, ClearGroup, DifficultyConfig, Fruit, FruitRecord, GridPosition, JuiceEffectResult, PairPiece, ResolveReport } from "./types";

export type BoardResolveResult = ResolveReport & {
  board: Board;
  clearScore: number;
  removed: number;
  removedByFruit: FruitRecord;
  juiceAwards: FruitRecord[];
};

export type JuiceProgressResult = {
  juiceProgress: FruitRecord;
  juiceStock: FruitRecord;
};

export function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

export function cloneFruitRecord(record: FruitRecord): FruitRecord {
  return { apple: record.apple, orange: record.orange, lemon: record.lemon, grape: record.grape, melon: record.melon, berry: record.berry };
}

export function resolveBoardRules(board: Board, options: { difficulty: DifficultyConfig; turnMultiplier?: number }): BoardResolveResult {
  const copy = cloneBoard(board);
  const turnMultiplier = options.turnMultiplier ?? 1;
  let chain = 0;
  let removed = 0;
  let clearScore = 0;
  const popEvents: BoardResolveResult["popEvents"] = [];
  const waterClears: GridPosition[] = [];
  const removedByFruit = initialFruitRecord(0);
  const juiceAwards: FruitRecord[] = [];

  while (true) {
    applyGravity(copy);
    const groups = findClearGroups(copy);
    if (groups.length === 0) break;

    chain += 1;
    const removedThisChain = initialFruitRecord(0);
    const clearedFruitCells: GridPosition[] = [];
    const popCells: GridPosition[] = [];
    let removedCount = 0;
    let popFruit: Fruit | null = null;

    for (const group of groups) {
      popFruit ??= group.fruit;
      removedCount += removeGroup(copy, group, removedThisChain, removedByFruit, clearedFruitCells, popCells);
    }

    waterClears.push(...clearAdjacentWater(copy, clearedFruitCells));
    removed += removedCount;
    juiceAwards.push(removedThisChain);
    clearScore += calculateClearScore(removedCount, chain, turnMultiplier, options.difficulty.scoreMultiplier);
    if (popFruit) {
      popEvents.push({ fruit: popFruit, chain, cells: popCells });
    }
  }

  return { board: copy, chain, popEvents, waterClears, clearScore, removed, removedByFruit, juiceAwards };
}

export function applyJuiceAwards(input: {
  juiceProgress: FruitRecord;
  juiceStock: FruitRecord;
  awards: FruitRecord[];
  featuredFruit: Fruit;
  difficulty: DifficultyConfig;
}): JuiceProgressResult {
  const juiceProgress = cloneFruitRecord(input.juiceProgress);
  const juiceStock = cloneFruitRecord(input.juiceStock);

  for (const removed of input.awards) {
    for (const fruit of FRUITS) {
      juiceProgress[fruit] += removed[fruit];
      while (juiceProgress[fruit] >= input.difficulty.juiceThreshold) {
        juiceProgress[fruit] -= input.difficulty.juiceThreshold;
        juiceStock[fruit] += 1;
      }
    }
  }

  return { juiceProgress, juiceStock };
}

export function getJuiceEffectCenter(active: PairPiece | null): GridPosition {
  const fallback = { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) };
  const center = active ? { x: active.axis.x, y: active.axis.y } : fallback;
  return {
    x: clamp(center.x, 0, COLS - 1),
    y: clamp(center.y, 0, ROWS - 1),
  };
}

export function applyJuiceEffectRules(board: Board, input: { primary: Fruit; center: GridPosition; activeAxisFruit?: Fruit }): { board: Board; effect: JuiceEffectResult } {
  const copy = cloneBoard(board);
  const changedCells = new Set<string>();

  if (input.primary === "apple") clearSquare(copy, input.center, 1, changedCells);
  if (input.primary === "orange") clearRows(copy, [input.center.y], changedCells);
  if (input.primary === "lemon") transformNearby(copy, input.center, 4, input.activeAxisFruit ?? input.primary, changedCells);
  if (input.primary === "grape") clearColumns(copy, [input.center.x], changedCells);
  if (input.primary === "melon") clearDiamond(copy, input.center, 2, changedCells);
  if (input.primary === "berry") transformNearby(copy, input.center, 5, getMostCommonBoardFruit(copy) ?? input.activeAxisFruit ?? input.primary, changedCells);

  applyGravity(copy);
  return { board: copy, effect: { center: input.center, cells: positionsFromSet(changedCells) } };
}

function removeGroup(
  board: Board,
  group: ClearGroup,
  removedThisChain: FruitRecord,
  removedByFruit: FruitRecord,
  clearedFruitCells: GridPosition[],
  popCells: GridPosition[],
): number {
  let removedCount = 0;
  for (const position of group.cells) {
    if (!isFruitCell(board[position.y][position.x])) continue;
    board[position.y][position.x] = null;
    removedThisChain[group.fruit] += 1;
    removedByFruit[group.fruit] += 1;
    removedCount += 1;
    clearedFruitCells.push(position);
    popCells.push(position);
  }
  return removedCount;
}

function clearAdjacentWater(board: Board, cells: GridPosition[]): GridPosition[] {
  const cleared = new Set<string>();
  for (const cell of cells) {
    for (const neighbor of neighbors(cell.x, cell.y)) {
      if (!isWaterCell(board[neighbor.y][neighbor.x])) continue;
      board[neighbor.y][neighbor.x] = null;
      cleared.add(`${neighbor.x},${neighbor.y}`);
    }
  }
  return positionsFromSet(cleared);
}

function clearSquare(board: Board, center: GridPosition, radius: number, changedCells: Set<string>): void {
  for (let y = center.y - radius; y <= center.y + radius; y += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      clearCell(board, x, y, changedCells);
    }
  }
}

function clearRows(board: Board, rows: number[], changedCells: Set<string>): void {
  for (const y of rows) {
    if (y < 0 || y >= ROWS) continue;
    for (let x = 0; x < COLS; x += 1) {
      clearCell(board, x, y, changedCells);
    }
  }
}

function clearColumns(board: Board, cols: number[], changedCells: Set<string>): void {
  for (const x of cols) {
    if (x < 0 || x >= COLS) continue;
    for (let y = 0; y < ROWS; y += 1) {
      clearCell(board, x, y, changedCells);
    }
  }
}

function clearDiamond(board: Board, center: GridPosition, radius: number, changedCells: Set<string>): void {
  for (let y = center.y - radius; y <= center.y + radius; y += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      if (Math.abs(center.x - x) + Math.abs(center.y - y) > radius) continue;
      clearCell(board, x, y, changedCells);
    }
  }
}

function clearCell(board: Board, x: number, y: number, changedCells: Set<string>): void {
  if (!inBounds(x, y) || board[y][x] === null) return;
  board[y][x] = null;
  changedCells.add(`${x},${y}`);
}

function transformNearby(board: Board, center: GridPosition, maxCells: number, target: Fruit, changedCells: Set<string>): void {
  const candidates: Array<GridPosition & { distance: number }> = [];
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (!isFruitCell(board[y][x]) || board[y][x] === target) continue;
      candidates.push({ x, y, distance: Math.abs(center.x - x) + Math.abs(center.y - y) });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance);
  for (const candidate of candidates.slice(0, maxCells)) {
    board[candidate.y][candidate.x] = target;
    changedCells.add(`${candidate.x},${candidate.y}`);
  }
}

function getMostCommonBoardFruit(board: Board): Fruit | null {
  const counts = initialFruitRecord(0);
  for (const row of board) {
    for (const cell of row) {
      if (isFruitCell(cell)) counts[cell] += 1;
    }
  }
  return FRUITS.reduce<Fruit | null>((best, fruit) => {
    if (counts[fruit] <= 0) return best;
    if (!best || counts[fruit] > counts[best]) return fruit;
    return best;
  }, null);
}

export function calculateJuiceEffectBonus(fruit: Fruit, changedCells: number, difficulty: DifficultyConfig): number {
  return calculateJuiceUseBonus(fruit, changedCells, difficulty.scoreMultiplier);
}
