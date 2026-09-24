import type { DifficultyConfig, GameModeConfig } from "./types";

/**
 * Water that dilutes the vat on a piece count, so pressure is the same whether a person
 * or Auto Play is placing pieces. Returns how many drops land after the given placement.
 */
export function getWaterPressureDrops(difficulty: DifficultyConfig, mode: GameModeConfig, piecesPlaced: number): number {
  if (!mode.waterPressure || piecesPlaced <= 0) return 0;
  const { everyPieces } = difficulty.waterPressure;
  if (piecesPlaced % everyPieces !== 0) return 0;
  return getWaterPressureSize(difficulty, piecesPlaced);
}

/** Drops in the landing that follows `piecesPlaced` pieces. */
export function getWaterPressureSize(difficulty: DifficultyConfig, piecesPlaced: number): number {
  return 1 + Math.floor(Math.max(0, piecesPlaced - 1) / difficulty.waterPressure.rampPieces);
}
