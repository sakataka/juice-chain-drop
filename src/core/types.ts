export type Fruit = "apple" | "orange" | "lemon" | "grape" | "melon" | "berry";
export type FruitPair = [Fruit, Fruit];
export type Cell = Fruit | "water" | null;
export type Board = Cell[][];
export type GameState = "ready" | "playing" | "paused" | "resolving" | "gameover";
export type DifficultyId = "easy" | "normal" | "hard";
export type GameModeId = "normal" | "scoreAttack" | "chainChallenge" | "waterCleanup";
export type AiSpeed = "slow" | "normal" | "fast";
export type ProgressionStage = 0 | 1 | 2 | 3;

export type RangeConfig = {
  min: number;
  max: number;
};

export type DifficultyConfig = {
  id: DifficultyId;
  label: string;
  dropInterval: number;
  slowDropInterval: number;
  scoreMultiplier: number;
  juiceThreshold: number;
  waterIntervalMs: RangeConfig;
  waterBurst: RangeConfig;
  progressionStageDurationMs: number;
};

export type GameModeConfig = {
  id: GameModeId;
  label: string;
  description: string;
  targetScore?: number;
  targetWaterClears?: number;
  initialWaterCount?: number;
  durationMs?: number;
};

export type GameSettings = {
  difficulty: DifficultyId;
  mode: GameModeId;
  aiSpeed: AiSpeed;
  shippingIntervalSeconds: number;
  waterEnabled: boolean;
  reducedMotion: boolean;
  sfxVolume: number;
  bgmVolume: number;
};

export type FruitRecord = Record<Fruit, number>;

export type PairPiece = {
  axis: { x: number; y: number; fruit: Fruit };
  satellite: { fruit: Fruit; rotation: number };
};

export type GridPosition = {
  x: number;
  y: number;
};

export type PieceCell = GridPosition & {
  fruit: Fruit;
  role: "axis" | "satellite";
};

export type ClearGroup = {
  fruit: Fruit;
  cells: GridPosition[];
};

export type JuiceEffectResult = {
  center: GridPosition;
  cells: GridPosition[];
};

export type ClearPop = {
  fruit: Fruit;
  chain: number;
  cells: GridPosition[];
};

export type ResolveReport = {
  chain: number;
  popEvents: ClearPop[];
  waterClears: GridPosition[];
};

export type JuiceUseReport = {
  effect: JuiceEffectResult;
  primary: Fruit;
  bonusScore: number;
  resolve: ResolveReport;
};

export type ShipmentReport = {
  score: number;
  baseScore: number;
  orderBonusScore: number;
  totalStock: number;
  streak: number;
  multiplier: number;
  orderCompleted: import("./orders").JuiceOrder | null;
};
