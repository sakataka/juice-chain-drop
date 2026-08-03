import type { GameModeId } from "../core";
import type { AiGameSnapshot, AiPhase } from "./types";

export type AiPolicy = {
  searchDepth: number;
  beamWidth: number;
  futureDiscount: number;
  dangerTopRisk: number;
  dangerMaxHeight: number;
  chainPotentialBudget: number;
  buildTriggerMinChain: number;
  buildTriggerMinRecordGain: number;
  prematureTriggerPenalty: number;
};

export type AiObjectiveWeights = {
  score: number;
  chain: number;
  recordGain: number;
  clearPenalty: number;
  nonRecordClearPenalty: number;
  chainSetup: number;
  chainPotential: number;
  triggerOptions: number;
  survival: number;
  height: number;
  holes: number;
  topRisk: number;
  stock: number;
  waterCleared: number;
  waterAdjacency: number;
};

export type AiObjectiveContext = {
  snapshot: AiGameSnapshot;
  topRisk: number;
  maxHeight: number;
  bestImmediateChain: number;
  bestBuildPotential: number;
};

export type AiModeObjective = {
  id: GameModeId;
  defaultPhase: Exclude<AiPhase, "survive">;
  beamWidth: number;
  resolvePhase(context: AiObjectiveContext, policy: AiPolicy): AiPhase;
};

export const DEFAULT_AI_POLICY: AiPolicy = {
  searchDepth: 3,
  beamWidth: 6,
  futureDiscount: 0.64,
  dangerTopRisk: 4,
  dangerMaxHeight: 10,
  chainPotentialBudget: 96,
  buildTriggerMinChain: 4,
  buildTriggerMinRecordGain: 2,
  prematureTriggerPenalty: 2_400,
};

const BALANCED_WEIGHTS: AiObjectiveWeights = {
  score: 1,
  chain: 210,
  recordGain: 0,
  clearPenalty: 0,
  nonRecordClearPenalty: 0,
  chainSetup: 38,
  chainPotential: 0,
  triggerOptions: 0,
  survival: 520,
  height: 7,
  holes: 28,
  topRisk: 85,
  stock: 95,
  waterCleared: 0,
  waterAdjacency: 0,
};

export const AI_PHASE_WEIGHTS: Record<AiPhase, AiObjectiveWeights> = {
  balanced: BALANCED_WEIGHTS,
  scoreRush: {
    ...BALANCED_WEIGHTS,
    score: 1.65,
    chain: 280,
    chainSetup: 24,
    stock: 125,
  },
  chainBuild: {
    ...BALANCED_WEIGHTS,
    score: 0.08,
    chain: 45,
    recordGain: 420,
    clearPenalty: 680,
    nonRecordClearPenalty: 900,
    chainSetup: 120,
    chainPotential: 920,
    triggerOptions: 80,
    stock: 35,
  },
  chainTrigger: {
    ...BALANCED_WEIGHTS,
    score: 0.12,
    chain: 720,
    recordGain: 2_600,
    chainSetup: 25,
    chainPotential: 110,
    triggerOptions: 10,
    stock: 20,
  },
  waterClear: {
    ...BALANCED_WEIGHTS,
    score: 0.25,
    chain: 120,
    chainSetup: 18,
    stock: 25,
    waterCleared: 900,
    waterAdjacency: 145,
  },
  survive: {
    ...BALANCED_WEIGHTS,
    score: 0.35,
    chain: 150,
    chainSetup: 16,
    survival: 920,
    height: 18,
    holes: 42,
    topRisk: 210,
    stock: 20,
    waterCleared: 160,
    waterAdjacency: 30,
  },
};

function isDangerous(context: AiObjectiveContext, policy: AiPolicy): boolean {
  return context.topRisk >= policy.dangerTopRisk || context.maxHeight >= policy.dangerMaxHeight;
}

export const AI_MODE_OBJECTIVES: Record<GameModeId, AiModeObjective> = {
  normal: {
    id: "normal",
    defaultPhase: "balanced",
    beamWidth: 6,
    resolvePhase: (context, policy) => (isDangerous(context, policy) ? "survive" : "balanced"),
  },
  scoreAttack: {
    id: "scoreAttack",
    defaultPhase: "scoreRush",
    beamWidth: 6,
    resolvePhase: (context, policy) => (isDangerous(context, policy) ? "survive" : "scoreRush"),
  },
  chainChallenge: {
    id: "chainChallenge",
    defaultPhase: "chainBuild",
    beamWidth: 4,
    resolvePhase: (context, policy) => {
      if (context.topRisk >= 2 || context.maxHeight >= 9) return "survive";
      if ((context.snapshot.challenge.remainingMs ?? 60_000) <= 15_000) return "chainTrigger";
      const recordGain = context.bestImmediateChain - context.snapshot.challenge.runBestChain;
      const meaningfulJump = context.bestImmediateChain >= policy.buildTriggerMinChain && recordGain >= policy.buildTriggerMinRecordGain;
      if (meaningfulJump && context.bestImmediateChain > context.bestBuildPotential) return "chainTrigger";
      return "chainBuild";
    },
  },
  waterCleanup: {
    id: "waterCleanup",
    defaultPhase: "waterClear",
    beamWidth: 6,
    resolvePhase: (context, policy) => (isDangerous(context, policy) ? "survive" : "waterClear"),
  },
};
