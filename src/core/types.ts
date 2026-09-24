export type Fruit = "apple" | "orange" | "lemon" | "grape" | "melon" | "berry";
export type FruitPair = [Fruit, Fruit];
export type Cell = Fruit | "water" | null;
export type Board = Cell[][];
export type GameState = "ready" | "playing" | "paused" | "resolving" | "gameover";
export type DifficultyId = "easy" | "normal" | "hard";
export type GameModeId = "normal" | "scoreAttack" | "chainChallenge" | "waterCleanup";
export type AiSpeed = "slow" | "normal" | "fast";
export type ProgressionStage = 0 | 1 | 2 | 3;
export type BgmMoment = "flow" | "pressReady" | "juiceDrop";

export type DifficultyConfig = {
  id: DifficultyId;
  label: string;
  dropInterval: number;
  slowDropInterval: number;
  scoreMultiplier: number;
  /** Press units per bottle; a fruit cleared in chain step k presses k units. */
  juiceThreshold: number;
  waterPressure: WaterPressureConfig;
  progressionStageDurationMs: number;
};

export type WaterPressureConfig = {
  /** Water lands after every Nth placed fruit pair. */
  everyPieces: number;
  /** One more drop per landing for every this many pieces placed, without a cap. */
  rampPieces: number;
};

export type GameModeConfig = {
  id: GameModeId;
  label: string;
  description: string;
  targetScore?: number;
  targetWaterClears?: number;
  initialWaterCount?: number;
  durationMs?: number;
  /** Whether timed water pressure pushes back in this mode. */
  waterPressure?: boolean;
};

export type GameSettings = {
  difficulty: DifficultyId;
  mode: GameModeId;
  aiSpeed: AiSpeed;
  reducedMotion: boolean;
  sfxVolume: number;
  bgmVolume: number;
};

export type FruitRecord = Record<Fruit, number>;

export type PairPiece = {
  kind?: "fruitPair" | "juiceDrop";
  axis: { x: number; y: number; fruit: Fruit };
  satellite: { fruit: Fruit; rotation: number };
};

export type NextPiecePreview =
  | { kind: "fruitPair"; pair: FruitPair }
  | { kind: "juiceDrop"; fruit: Fruit };

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

/** A cell that dropped from fromY to toY in column x when gravity settled the board. */
export type FallMove = {
  x: number;
  fromY: number;
  toY: number;
};

/**
 * Presentation snapshots of one resolve, in order. The rules resolve instantly;
 * these frames let the session replay chains step by step without re-running rules.
 */
export type ResolveFrame =
  | { kind: "settle"; board: Board; falls: FallMove[] }
  | { kind: "burst"; board: Board; effect: JuiceEffectResult; primary: Fruit }
  | { kind: "pop"; chain: number; board: Board; pops: ClearPop[]; waterClears: GridPosition[] }
  | { kind: "collapse"; board: Board; falls: FallMove[] };

export type ResolveReport = {
  chain: number;
  popEvents: ClearPop[];
  waterClears: GridPosition[];
  frames: ResolveFrame[];
  pressedJuices?: Fruit[];
  juiceDrop?: {
    effect: JuiceEffectResult;
    primary: Fruit;
    bonusScore: number;
  };
};
