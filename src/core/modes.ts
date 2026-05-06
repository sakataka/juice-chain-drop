import type { GameModeConfig, GameModeId } from "./types";

export const GAME_MODE_CONFIGS: Record<GameModeId, GameModeConfig> = {
  normal: {
    id: "normal",
    label: "Normal",
    description: "Endless score play",
  },
  scoreAttack: {
    id: "scoreAttack",
    label: "Score Attack",
    description: "Race to 1,000,000 points",
    targetScore: 1_000_000,
  },
  chainChallenge: {
    id: "chainChallenge",
    label: "Chain Challenge",
    description: "Find the biggest chain in 60 seconds",
    durationMs: 60_000,
  },
  waterCleanup: {
    id: "waterCleanup",
    label: "Water Cleanup",
    description: "Clear 30 starting water drops as fast as possible",
    targetWaterClears: 30,
    initialWaterCount: 30,
  },
};

export const DEFAULT_GAME_MODE: GameModeId = "normal";

export function isGameModeId(value: unknown): value is GameModeId {
  return value === "normal" || value === "scoreAttack" || value === "chainChallenge" || value === "waterCleanup";
}
