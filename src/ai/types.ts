import type { Board, ChallengeResult, DifficultyId, Fruit, FruitPair, FruitRecord, GameModeId, GameState, PairPiece } from "../core";

export type AiCommand =
  | { kind: "move"; dx: -1 | 1 }
  | { kind: "rotate" }
  | { kind: "hardDrop" }
  | { kind: "useJuice"; fruit: Fruit }
  | { kind: "useNormalJuice"; fruit: Fruit }
  | { kind: "wait" };

export type AiPlan = {
  commands: AiCommand[];
  score: number;
  reason: string;
};

export type AiDecision = AiPlan & {
  evaluatedMoves: number;
};

export type AiGameSnapshot = {
  board: Board;
  active: PairPiece | null;
  nextQueue: FruitPair[];
  state: GameState;
  score: number;
  lastChain: number;
  featuredFruit: Fruit;
  juiceStock: FruitRecord;
  juiceProgress: FruitRecord;
  shipment: {
    enabled: boolean;
    intervalSeconds: number;
    remainingMs: number;
    previewScore: number;
  };
  settings: {
    mode: GameModeId;
    difficulty: DifficultyId;
    shippingIntervalSeconds: number;
  };
  challenge: {
    mode: GameModeId;
    elapsedMs: number;
    remainingMs?: number;
    targetScore?: number;
    targetWaterClears?: number;
    runBestChain: number;
    runWaterClears: number;
    result: ChallengeResult;
  };
};

export type AiStrategy = {
  readonly id: string;
  choose(snapshot: AiGameSnapshot): AiDecision;
};

export type AiRunnerState = {
  enabled: boolean;
  intervalMs: number;
  pendingCommands: number;
  lastReason: string;
};
