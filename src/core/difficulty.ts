import type { DifficultyConfig, DifficultyId } from "./types";
import { DIFFICULTY_SCORE_MULTIPLIERS } from "./balance";

export const DIFFICULTY_CONFIGS: Record<DifficultyId, DifficultyConfig> = {
  easy: {
    id: "easy",
    label: "Easy",
    dropInterval: 760,
    slowDropInterval: 1040,
    scoreMultiplier: DIFFICULTY_SCORE_MULTIPLIERS.easy,
    juiceThreshold: 18,
    waterPressure: { everyPieces: 6, rampPieces: 120 },
    progressionStageDurationMs: 75_000,
  },
  normal: {
    id: "normal",
    label: "Normal",
    dropInterval: 620,
    slowDropInterval: 880,
    scoreMultiplier: DIFFICULTY_SCORE_MULTIPLIERS.normal,
    juiceThreshold: 24,
    waterPressure: { everyPieces: 6, rampPieces: 90 },
    progressionStageDurationMs: 60_000,
  },
  hard: {
    id: "hard",
    label: "Hard",
    dropInterval: 500,
    slowDropInterval: 720,
    scoreMultiplier: DIFFICULTY_SCORE_MULTIPLIERS.hard,
    juiceThreshold: 30,
    waterPressure: { everyPieces: 4, rampPieces: 60 },
    progressionStageDurationMs: 60_000,
  },
};

export const DEFAULT_DIFFICULTY: DifficultyId = "normal";

export function getDifficultyConfig(id: DifficultyId): DifficultyConfig {
  return DIFFICULTY_CONFIGS[id];
}

export function isDifficultyId(value: unknown): value is DifficultyId {
  return value === "easy" || value === "normal" || value === "hard";
}
