import { GAME_MODE_CONFIGS } from "./modes";
import type { GameModeConfig, GameModeId, GameSettings, GameState } from "./types";

export type ChallengeResult = "Ready" | "Active" | "Success" | "Failed";

export type ChallengeRuntimeState = {
  elapsedMs: number;
  completedMs: number | null;
  runBestChain: number;
  runWaterClears: number;
  result: ChallengeResult;
};

type ChallengeSnapshot = {
  label: string;
  progress: string;
  result: string;
  resultKicker: string;
  resultTitle: string;
  resultDetailLabel: string;
  resultDetailValue: string;
};

type ChallengeUpdateEvent =
  | { kind: "reset"; mode: GameModeId; result?: ChallengeResult }
  | { kind: "tick"; deltaMs: number; score: number; gameState: GameState; mode: GameModeId }
  | { kind: "chain"; chain: number }
  | { kind: "waterProgress"; cleared: number };

type ChallengeUpdateResult = {
  state: ChallengeRuntimeState;
  shouldEndGame: boolean;
};

export function createChallengeState(mode: GameModeId, result: ChallengeResult = "Ready"): ChallengeRuntimeState {
  return resetChallengeState(mode, result);
}

function resetChallengeState(mode: GameModeId, result: ChallengeResult = "Ready"): ChallengeRuntimeState {
  return {
    elapsedMs: 0,
    completedMs: null,
    runBestChain: 0,
    runWaterClears: 0,
    result: mode === "normal" && result === "Active" ? "Ready" : result,
  };
}

export function updateChallenge(state: ChallengeRuntimeState, event: ChallengeUpdateEvent, config: GameModeConfig): ChallengeUpdateResult {
  if (event.kind === "reset") {
    return { state: resetChallengeState(event.mode, event.result), shouldEndGame: false };
  }

  if (event.kind === "chain") {
    return { state: { ...state, runBestChain: Math.max(state.runBestChain, event.chain) }, shouldEndGame: false };
  }

  if (event.kind === "waterProgress") {
    const nextState = { ...state, runWaterClears: Math.max(state.runWaterClears, event.cleared) };
    if (state.result === "Active" && config.targetWaterClears && nextState.runWaterClears >= config.targetWaterClears) {
      return { state: { ...nextState, completedMs: nextState.elapsedMs, result: "Success" }, shouldEndGame: true };
    }
    return { state: nextState, shouldEndGame: false };
  }

  if (event.gameState !== "playing" || state.result !== "Active") {
    return { state, shouldEndGame: false };
  }

  let nextState = { ...state, elapsedMs: state.elapsedMs + event.deltaMs };
  if (event.mode === "scoreAttack" && config.targetScore) {
    if (event.score >= config.targetScore) {
      return { state: { ...nextState, completedMs: nextState.elapsedMs, result: "Success" }, shouldEndGame: true };
    }
  }
  if (event.mode === "chainChallenge" && config.durationMs && nextState.elapsedMs >= config.durationMs) {
    return { state: { ...nextState, elapsedMs: config.durationMs, completedMs: config.durationMs, result: "Success" }, shouldEndGame: true };
  }
  if (event.mode === "waterCleanup" && config.targetWaterClears) {
    if (nextState.runWaterClears >= config.targetWaterClears) {
      return { state: { ...nextState, completedMs: nextState.elapsedMs, result: "Success" }, shouldEndGame: true };
    }
  }

  return { state: nextState, shouldEndGame: false };
}

export function getChallengeSnapshot(state: ChallengeRuntimeState, score: number, gameState: GameState, settings: GameSettings): ChallengeSnapshot {
  const config = GAME_MODE_CONFIGS[settings.mode];
  const gameOverResult = createGameOverResult(score);
  if (settings.mode === "normal") {
    return {
      label: config.label,
      progress: config.description,
      result: gameState === "playing" ? "Playing" : "Ready",
      ...gameOverResult,
    };
  }
  if (settings.mode === "scoreAttack") {
    const timeMs = state.completedMs ?? state.elapsedMs;
    const isSuccess = state.result === "Success";
    return {
      label: config.label,
      progress: `${score.toLocaleString()} / ${(config.targetScore ?? 0).toLocaleString()} pts, ${formatSeconds(timeMs)}`,
      result: state.result,
      ...(isSuccess
        ? {
            resultKicker: "Target reached",
            resultTitle: "Score Attack Clear",
            resultDetailLabel: "Clear Time",
            resultDetailValue: formatSeconds(timeMs),
          }
        : gameOverResult),
    };
  }
  if (settings.mode === "chainChallenge") {
    const remaining = Math.max(0, Math.ceil(((config.durationMs ?? 0) - state.elapsedMs) / 1000));
    const isSuccess = state.result === "Success";
    return {
      label: config.label,
      progress: `Best ${state.runBestChain} chain, ${remaining}s left`,
      result: state.result,
      ...(isSuccess
        ? {
            resultKicker: "Time up",
            resultTitle: "Chain Result",
            resultDetailLabel: "Best Chain",
            resultDetailValue: `${state.runBestChain} chain`,
          }
        : gameOverResult),
    };
  }
  if (settings.mode === "waterCleanup") {
    const timeMs = state.completedMs ?? state.elapsedMs;
    const target = config.targetWaterClears ?? 0;
    const remainingWater = Math.max(0, target - state.runWaterClears);
    const isSuccess = state.result === "Success";
    return {
      label: config.label,
      progress: `${remainingWater} / ${target} water, ${formatSeconds(timeMs)}`,
      result: state.result,
      ...(isSuccess
        ? {
            resultKicker: "All water cleared",
            resultTitle: "Water Cleanup Clear",
            resultDetailLabel: "Clear Time",
            resultDetailValue: formatSeconds(timeMs),
          }
        : gameOverResult),
    };
  }
  return { label: config.label, progress: config.description, result: state.result, ...gameOverResult };
}

function formatSeconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

function createGameOverResult(score: number): Pick<ChallengeSnapshot, "resultKicker" | "resultTitle" | "resultDetailLabel" | "resultDetailValue"> {
  return {
    resultKicker: "Top out",
    resultTitle: "Game Over",
    resultDetailLabel: "Score",
    resultDetailValue: score.toLocaleString(),
  };
}
