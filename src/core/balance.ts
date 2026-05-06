import type { DifficultyId, Fruit } from "./types";

const CLEAR_SCORE_UNIT = 50;
const SHIPMENT_SCORE_UNIT = 160;
const SHIPMENT_COMBO_STEP = 0.25;
const SHIPMENT_COMBO_CAP = 2;
const JUICE_USE_BONUS: Record<Fruit, { flat: number; perCell: number }> = {
  apple: { flat: 0, perCell: 8 },
  orange: { flat: 0, perCell: 6 },
  lemon: { flat: 40, perCell: 18 },
  grape: { flat: 0, perCell: 6 },
  melon: { flat: 120, perCell: 0 },
  berry: { flat: 60, perCell: 16 },
};

const CHAIN_SCORE_MULTIPLIERS = [0, 1, 2.1, 3.6, 5.5, 7.8] as const;

export const DIFFICULTY_SCORE_MULTIPLIERS: Record<DifficultyId, number> = {
  easy: 0.9,
  normal: 1,
  hard: 1.25,
};

export function getChainScoreMultiplier(chain: number): number {
  if (chain <= 0) return 0;
  if (chain < CHAIN_SCORE_MULTIPLIERS.length) return CHAIN_SCORE_MULTIPLIERS[chain];
  return CHAIN_SCORE_MULTIPLIERS[5] + (chain - 5) * 2;
}

export function calculateClearScore(removedCount: number, chain: number, turnMultiplier: number, difficultyMultiplier: number): number {
  return Math.round(removedCount * CLEAR_SCORE_UNIT * getChainScoreMultiplier(chain) * turnMultiplier * difficultyMultiplier);
}

export function calculateShipmentScore(totalStock: number, difficultyMultiplier: number): number {
  return Math.round(SHIPMENT_SCORE_UNIT * totalStock * totalStock * difficultyMultiplier);
}

export function getShipmentComboMultiplier(streak: number): number {
  if (streak <= 1) return 1;
  return Math.min(SHIPMENT_COMBO_CAP, 1 + (streak - 1) * SHIPMENT_COMBO_STEP);
}

export function calculateJuiceUseBonus(fruit: Fruit, changedCells: number, difficultyMultiplier: number): number {
  const bonus = JUICE_USE_BONUS[fruit];
  return Math.round((bonus.flat + bonus.perCell * changedCells) * difficultyMultiplier);
}
