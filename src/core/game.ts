import { COLS, FRUITS, NEXT_QUEUE_SIZE, ROWS } from "./constants";
import { applyGravity, createBoard, getPieceCells, isValidPiece, makeJuiceDrop, makePiece, movedPiece, rotatedPiece } from "./board";
import { DEFAULT_DIFFICULTY, getDifficultyConfig } from "./difficulty";
import { applyJuiceAwards, applyJuiceEffectRules, cloneBoard, calculateJuiceEffectBonus, getJuiceEffectCenter, resolveBoardRules } from "./rules";
import { initialFruitRecord, isWaterCell, randomFruit } from "./utils";
import type { Board, DifficultyConfig, DifficultyId, Fruit, FruitPair, FruitRecord, GameState, GridPosition, JuiceEffectResult, NextPiecePreview, PairPiece, ResolveFrame, ResolveReport } from "./types";

type ResolveSource = "piece" | "juice";

export class GameModel {
  board: Board = createBoard();
  state: GameState = "ready";
  active: PairPiece | null = null;
  nextQueue: FruitPair[];
  score = 0;
  lastChain = 0;
  slowTurns = 0;
  nextPieceScoreMultiplier = 1;
  juiceProgress: FruitRecord = initialFruitRecord(0);
  juiceStock: FruitRecord = initialFruitRecord(0);
  queuedJuiceDrops: Fruit[] = [];
  juiceDropsCreated = 0;
  difficulty: DifficultyConfig = getDifficultyConfig(DEFAULT_DIFFICULTY);

  constructor(private readonly rng: () => number = Math.random) {
    this.nextQueue = this.createNextQueue();
  }

  get nextPair(): FruitPair {
    return this.nextQueue[0];
  }

  get nextPreviews(): NextPiecePreview[] {
    const previews: NextPiecePreview[] = [];
    let pairIndex = 0;
    let juiceIndex = 0;
    let expectJuice = this.active?.kind !== "juiceDrop" && this.queuedJuiceDrops.length > 0;

    while (previews.length < NEXT_QUEUE_SIZE) {
      if (expectJuice && juiceIndex < this.queuedJuiceDrops.length) {
        previews.push({ kind: "juiceDrop", fruit: this.queuedJuiceDrops[juiceIndex] });
        juiceIndex += 1;
        expectJuice = false;
        continue;
      }
      const pair = this.nextQueue[pairIndex] ?? this.createRandomPair();
      previews.push({ kind: "fruitPair", pair });
      pairIndex += 1;
      expectJuice = juiceIndex < this.queuedJuiceDrops.length;
    }
    return previews;
  }

  start(options: { difficulty?: DifficultyId } = {}): void {
    this.difficulty = getDifficultyConfig(options.difficulty ?? DEFAULT_DIFFICULTY);
    this.board = createBoard();
    this.state = "playing";
    this.active = makePiece(this.takeNextPair());
    this.score = 0;
    this.lastChain = 0;
    this.slowTurns = 0;
    this.nextPieceScoreMultiplier = 1;
    this.juiceProgress = initialFruitRecord(0);
    this.juiceStock = initialFruitRecord(0);
    this.queuedJuiceDrops = [];
    this.juiceDropsCreated = 0;

    if (!this.active || !isValidPiece(this.board, this.active)) {
      this.endGame();
    }
  }

  endGame(): void {
    this.state = "gameover";
    this.active = null;
  }

  pause(): boolean {
    if (this.state !== "playing") return false;
    this.state = "paused";
    return true;
  }

  resume(): boolean {
    if (this.state !== "paused") return false;
    this.state = "playing";
    return true;
  }

  tryMove(dx: number, dy: number): boolean {
    if (this.state !== "playing") return false;
    if (!this.active) return false;
    const nextPiece = movedPiece(this.active, dx, dy);
    if (!isValidPiece(this.board, nextPiece)) return false;
    this.active = nextPiece;
    return true;
  }

  tryRotate(): boolean {
    if (this.state !== "playing") return false;
    if (!this.active) return false;
    if (this.active.kind === "juiceDrop") return false;
    for (const kick of [0, -1, 1, -2, 2]) {
      const nextPiece = rotatedPiece(this.active, kick);
      if (isValidPiece(this.board, nextPiece)) {
        this.active = nextPiece;
        return true;
      }
    }
    return false;
  }

  hardDrop(): ResolveReport | null {
    if (this.state !== "playing") return null;
    if (!this.active) return null;
    while (this.tryMove(0, 1)) {
      this.score += 1;
    }
    return this.settlePiece();
  }

  settlePiece(): ResolveReport | null {
    if (this.state !== "playing") return null;
    if (!this.active) return null;
    if (this.active.kind === "juiceDrop") {
      return this.settleJuiceDrop(this.active.axis.fruit);
    }

    const hadQueuedJuiceDrop = this.queuedJuiceDrops.length > 0;
    const cells = getPieceCells(this.active);
    if (cells.some((cell) => cell.y <= 0)) {
      this.endGame();
      return null;
    }

    for (const cell of cells) {
      this.board[cell.y][cell.x] = cell.fruit;
    }
    this.active = null;
    if (this.slowTurns > 0) this.slowTurns -= 1;
    const report = this.resolveBoard("piece");
    this.spawnPiece(hadQueuedJuiceDrop);
    return report;
  }

  spawnPiece(allowJuiceDrop = true): void {
    const juice = allowJuiceDrop ? this.queuedJuiceDrops.shift() : undefined;
    if (juice) {
      this.juiceStock[juice] = Math.max(0, this.juiceStock[juice] - 1);
      this.active = makeJuiceDrop(juice);
    } else {
      this.active = makePiece(this.takeNextPair());
    }
    if (!isValidPiece(this.board, this.active)) {
      this.endGame();
    }
  }

  private createNextQueue(): FruitPair[] {
    return Array.from({ length: NEXT_QUEUE_SIZE }, () => this.createRandomPair());
  }

  private createRandomPair(): FruitPair {
    return [randomFruit(this.rng), randomFruit(this.rng)];
  }

  private takeNextPair(): FruitPair {
    const pair = this.nextQueue.shift() ?? this.createRandomPair();
    this.nextQueue.push(this.createRandomPair());
    return pair;
  }

  resolveBoard(source: ResolveSource): ResolveReport {
    this.state = "resolving";
    const turnMultiplier = source === "piece" ? this.nextPieceScoreMultiplier : 1;
    const resolved = resolveBoardRules(this.board, { difficulty: this.difficulty, turnMultiplier, recordFrames: true });
    this.board = resolved.board;
    this.score += resolved.clearScore;
    const pressedJuices = this.applyJuiceAwards(resolved.juiceAwards);
    if (source === "piece") {
      this.nextPieceScoreMultiplier = 1;
    }

    this.lastChain = resolved.chain;
    this.state = "playing";
    return { chain: resolved.chain, popEvents: resolved.popEvents, waterClears: resolved.waterClears, frames: resolved.frames, pressedJuices };
  }

  awardJuice(removed: FruitRecord): void {
    this.applyJuiceAwards([removed]);
  }

  getEffectCenter(): GridPosition {
    return getJuiceEffectCenter(this.active);
  }

  applyJuiceEffect(primary: Fruit): JuiceEffectResult {
    return this.applyJuiceEffectWithFrames(primary).effect;
  }

  private applyJuiceEffectWithFrames(primary: Fruit): { effect: JuiceEffectResult; frames: ResolveFrame[] } {
    const center = this.getEffectCenter();
    if (primary === "melon") {
      this.slowTurns = 1;
      this.nextPieceScoreMultiplier = Math.max(this.nextPieceScoreMultiplier, 1.5);
    }
    const result = applyJuiceEffectRules(this.board, { primary, center, activeAxisFruit: this.active?.axis.fruit });
    this.board = result.board;
    return {
      effect: result.effect,
      frames: [
        { kind: "burst", board: result.burstBoard, effect: result.effect, primary },
        { kind: "collapse", board: cloneBoard(result.board), falls: result.falls },
      ],
    };
  }

  dropWater(): GridPosition | null {
    if (this.state !== "playing") return null;
    // Water must settle at row 2 or lower so it never blocks the spawn rows.
    const columns = Array.from({ length: COLS }, (_, x) => x).filter((x) => this.board[2][x] === null);
    if (columns.length === 0) return null;
    const x = columns[Math.floor(this.rng() * columns.length)];
    this.board[0][x] = "water";
    applyGravity(this.board);
    for (let y = 0; y < ROWS; y += 1) {
      if (isWaterCell(this.board[y][x])) return { x, y };
    }
    return null;
  }

  dropStartingWater(count: number): GridPosition[] {
    const cells: GridPosition[] = [];
    for (let index = 0; index < count; index += 1) {
      const cell = this.dropWater();
      if (!cell) break;
      cells.push(cell);
    }
    return cells;
  }

  countWaterCells(): number {
    let count = 0;
    for (const row of this.board) {
      for (const cell of row) {
        if (isWaterCell(cell)) count += 1;
      }
    }
    return count;
  }

  private settleJuiceDrop(fruit: Fruit): ResolveReport {
    if (this.slowTurns > 0) this.slowTurns -= 1;
    const { effect, frames } = this.applyJuiceEffectWithFrames(fruit);
    const bonusScore = calculateJuiceEffectBonus(fruit, effect.cells.length, this.difficulty);
    this.score += bonusScore;
    this.active = null;
    const report = this.resolveBoard("juice");
    this.spawnPiece(false);
    // The effect already settled the board, so the resolve's own settle frame adds nothing.
    const chainFrames = report.frames.filter((frame) => frame.kind !== "settle");
    return { ...report, frames: [...frames, ...chainFrames], juiceDrop: { effect, primary: fruit, bonusScore } };
  }

  private applyJuiceAwards(awards: FruitRecord[]): Fruit[] {
    const previousStock = { ...this.juiceStock };
    const result = applyJuiceAwards({
      juiceProgress: this.juiceProgress,
      juiceStock: this.juiceStock,
      awards,
      difficulty: this.difficulty,
    });
    this.juiceProgress = result.juiceProgress;
    this.juiceStock = result.juiceStock;
    const pressedJuices: Fruit[] = [];
    for (const fruit of FRUITS) {
      const completed = Math.max(0, result.juiceStock[fruit] - previousStock[fruit]);
      for (let index = 0; index < completed; index += 1) {
        pressedJuices.push(fruit);
        this.queuedJuiceDrops.push(fruit);
        this.juiceDropsCreated += 1;
      }
    }
    return pressedJuices;
  }
}
