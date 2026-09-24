import type { Board, ChallengeResult, DifficultyId, FruitRecord, GameModeId, GameState, NextPiecePreview, PairPiece } from "../core";

export type AiPhase = "balanced" | "scoreRush" | "chainBuild" | "chainTrigger" | "waterClear" | "survive";

export type AiCommand =
  | { kind: "move"; dx: -1 | 1 }
  | { kind: "rotate" }
  | { kind: "hardDrop" }
  | { kind: "wait" };

export type AiPlan = {
  commands: AiCommand[];
  score: number;
  reason: string;
};

export type AiDecision = AiPlan & {
  evaluatedMoves: number;
  chainPotentialEvaluations: number;
  mode: GameModeId;
  phase: AiPhase;
};

export type AiGameSnapshot = {
  board: Board;
  active: PairPiece | null;
  nextPreviews: NextPiecePreview[];
  state: GameState;
  score: number;
  lastChain: number;
  juiceStock: FruitRecord;
  juiceProgress: FruitRecord;
  settings: {
    mode: GameModeId;
    difficulty: DifficultyId;
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
  mode: GameModeId | null;
  phase: AiPhase | null;
  decisionCount: number;
  lastDecisionMs: number;
  maxDecisionMs: number;
  chainPotentialEvaluations: number;
};
