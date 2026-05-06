import { COLS, FRUITS, NEXT_QUEUE_SIZE, ROWS } from "./constants";
import { calculateShipmentScore, getShipmentComboMultiplier } from "./balance";
import { applyGravity, createBoard, findClearGroups, getPieceCells, isValidPiece, makePiece, movedPiece, rotatedPiece } from "./board";
import { DEFAULT_DIFFICULTY, getDifficultyConfig } from "./difficulty";
import { createJuiceOrder, isOrderFulfilled } from "./orders";
import { applyJuiceAwards, applyJuiceEffectRules, calculateJuiceEffectBonus, getJuiceEffectCenter, resolveBoardRules } from "./rules";
import { initialFruitRecord, isWaterCell, randomFruit } from "./utils";
import type { Board, DifficultyConfig, DifficultyId, Fruit, FruitPair, FruitRecord, GameState, GridPosition, JuiceEffectResult, JuiceUseReport, PairPiece, ResolveReport, ShipmentReport } from "./types";
import type { JuiceOrder } from "./orders";

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
  shipmentStreak = 0;
  completedOrders = 0;
  featuredFruitIndex = 0;
  featuredFruit: Fruit = FRUITS[this.featuredFruitIndex];
  juiceProgress: FruitRecord = initialFruitRecord(0);
  juiceStock: FruitRecord = initialFruitRecord(0);
  difficulty: DifficultyConfig = getDifficultyConfig(DEFAULT_DIFFICULTY);
  currentOrder: JuiceOrder = createJuiceOrder(0, this.difficulty);

  constructor(private readonly rng: () => number = Math.random) {
    this.nextQueue = this.createNextQueue();
  }

  get nextPair(): FruitPair {
    return this.nextQueue[0];
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
    this.shipmentStreak = 0;
    this.completedOrders = 0;
    this.featuredFruitIndex = 0;
    this.featuredFruit = FRUITS[this.featuredFruitIndex];
    this.currentOrder = createJuiceOrder(0, this.difficulty);
    this.juiceProgress = initialFruitRecord(0);
    this.juiceStock = initialFruitRecord(0);

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
    this.spawnPiece();
    return report;
  }

  spawnPiece(): void {
    this.active = makePiece(this.takeNextPair());
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
    const resolved = resolveBoardRules(this.board, { difficulty: this.difficulty, turnMultiplier });
    this.board = resolved.board;
    this.score += resolved.clearScore;
    this.applyJuiceAwards(resolved.juiceAwards);
    if (source === "piece") {
      this.nextPieceScoreMultiplier = 1;
    }

    this.lastChain = resolved.chain;
    this.state = "playing";
    return { chain: resolved.chain, popEvents: resolved.popEvents, waterClears: resolved.waterClears };
  }

  awardJuice(removed: FruitRecord): void {
    this.applyJuiceAwards([removed]);
  }

  advanceFeaturedFruit(): Fruit {
    this.featuredFruitIndex = (this.featuredFruitIndex + 1) % FRUITS.length;
    this.featuredFruit = FRUITS[this.featuredFruitIndex];
    return this.featuredFruit;
  }

  useJuice(fruit: Fruit): JuiceUseReport | null {
    if (this.state !== "playing" || !this.active || this.juiceStock[fruit] <= 0) return null;
    this.juiceStock[fruit] -= 1;
    const effect = this.applyJuiceEffect(fruit);
    const bonusScore = calculateJuiceEffectBonus(fruit, effect.cells.length, this.difficulty);
    this.score += bonusScore;
    const resolve = this.resolveBoard("juice");
    return { effect, primary: fruit, bonusScore, resolve };
  }

  useNormalJuice(fruit: Fruit): JuiceUseReport | null {
    return this.useJuice(fruit);
  }

  getShipmentPreview(): ShipmentReport {
    const totalStock = this.getTotalJuiceStock();
    const streak = totalStock > 0 ? this.shipmentStreak + 1 : this.shipmentStreak;
    const baseScore = this.calculateShipmentScore(totalStock);
    const multiplier = totalStock > 0 ? getShipmentComboMultiplier(streak) : 1;
    const orderBonusScore = totalStock > 0 && isOrderFulfilled(this.juiceStock, this.currentOrder) ? this.currentOrder.bonusScore : 0;
    return {
      totalStock,
      baseScore,
      orderBonusScore,
      streak,
      multiplier,
      score: Math.round(baseScore * multiplier) + orderBonusScore,
      orderCompleted: orderBonusScore > 0 ? this.currentOrder : null,
    };
  }

  shipJuices(): ShipmentReport | null {
    const totalStock = this.getTotalJuiceStock();
    if (totalStock <= 0) {
      this.shipmentStreak = 0;
      return null;
    }
    this.shipmentStreak += 1;
    const baseScore = this.calculateShipmentScore(totalStock);
    const multiplier = getShipmentComboMultiplier(this.shipmentStreak);
    const orderCompleted = isOrderFulfilled(this.juiceStock, this.currentOrder) ? this.currentOrder : null;
    const orderBonusScore = orderCompleted?.bonusScore ?? 0;
    const score = Math.round(baseScore * multiplier) + orderBonusScore;
    this.score += score;
    this.juiceStock = initialFruitRecord(0);
    if (orderCompleted) {
      this.completedOrders += 1;
      this.currentOrder = createJuiceOrder(this.completedOrders, this.difficulty);
    }
    return { score, baseScore, orderBonusScore, totalStock, streak: this.shipmentStreak, multiplier, orderCompleted };
  }

  getEffectCenter(): GridPosition {
    return getJuiceEffectCenter(this.active);
  }

  applyJuiceEffect(primary: Fruit): JuiceEffectResult {
    const center = this.getEffectCenter();
    if (primary === "melon") {
      this.slowTurns = 1;
      this.nextPieceScoreMultiplier = Math.max(this.nextPieceScoreMultiplier, 1.5);
    }
    const result = applyJuiceEffectRules(this.board, { primary, center, activeAxisFruit: this.active?.axis.fruit });
    this.board = result.board;
    return result.effect;
  }

  private getTotalJuiceStock(): number {
    return FRUITS.reduce((total, fruit) => total + this.juiceStock[fruit], 0);
  }

  private calculateShipmentScore(totalStock: number): number {
    return calculateShipmentScore(totalStock, this.difficulty.scoreMultiplier);
  }

  dropWater(): GridPosition | null {
    if (this.state !== "playing") return null;
    const columns = Array.from({ length: COLS }, (_, x) => x).filter((x) => this.board[0][x] === null);
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

  private applyJuiceAwards(awards: FruitRecord[]): void {
    const result = applyJuiceAwards({
      juiceProgress: this.juiceProgress,
      juiceStock: this.juiceStock,
      awards,
      featuredFruit: this.featuredFruit,
      difficulty: this.difficulty,
    });
    this.juiceProgress = result.juiceProgress;
    this.juiceStock = result.juiceStock;
  }
}

export { applyGravity, createBoard, findClearGroups, getPieceCells, isValidPiece, makePiece };
