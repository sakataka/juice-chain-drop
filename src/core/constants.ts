import type { Fruit } from "./types";

export const FRUITS: Fruit[] = ["apple", "orange", "lemon", "grape", "melon", "berry"];

export const FRUIT_LABEL: Record<Fruit, string> = {
  apple: "Apple",
  orange: "Orange",
  lemon: "Lemon",
  grape: "Grape",
  melon: "Melon",
  berry: "Berry",
};

export const FRUIT_COLORS: Record<Fruit, string> = {
  apple: "#e43f47",
  orange: "#f58927",
  lemon: "#f8d347",
  grape: "#7c4bd6",
  melon: "#4fbc73",
  berry: "#d9468f",
};

export const NORMAL_KEYS: Record<Fruit, string> = {
  apple: "1",
  orange: "2",
  lemon: "3",
  grape: "4",
  melon: "5",
  berry: "6",
};

export const JUICE_EFFECT_LABEL: Record<Fruit, string> = {
  apple: "Apple: Burst Clear",
  orange: "Orange: Line Press",
  lemon: "Lemon: Color Shift",
  grape: "Grape: Vine Column",
  melon: "Melon: Chill Score",
  berry: "Berry: Chain Seed",
};
export const DEFAULT_SHIPMENT_INTERVAL_SECONDS = 45;
export const WATER_GRACE_MS = 10_000;
export const WATER_INTERVAL_MS = 20_000;
export const FEATURED_FRUIT_INTERVAL_MS = 30_000;
export const PROGRESSION_DROP_INTERVAL_MULTIPLIERS = [1, 0.9, 0.8, 0.7] as const;
export const NEXT_QUEUE_SIZE = 3;
export const SPRITE_CELL = 128;
export const COLS = 6;
export const ROWS = 12;
export const CELL = 48;
export const BOARD_X = 36;
export const BOARD_Y = 22;
export const WIDTH = 360;
export const HEIGHT = 628;

export const ROTATIONS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];
