import { FRUITS } from "./constants";
import type { Cell, Fruit, FruitRecord, GridPosition } from "./types";

export function initialFruitRecord(value: number): FruitRecord {
  return {
    apple: value,
    orange: value,
    lemon: value,
    grape: value,
    melon: value,
    berry: value,
  };
}

export function randomFruit(rng: () => number = Math.random): Fruit {
  return FRUITS[clamp(Math.floor(rng() * FRUITS.length), 0, FRUITS.length - 1)];
}

export function isFruitCell(cell: Cell): cell is Fruit {
  return cell !== null && cell !== "water";
}

export function isWaterCell(cell: Cell): cell is "water" {
  return cell === "water";
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function positionsFromSet(cells: Set<string>): GridPosition[] {
  return [...cells].map((cell) => {
    const [x, y] = cell.split(",").map(Number);
    return { x, y };
  });
}
