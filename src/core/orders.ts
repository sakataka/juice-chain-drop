import { FRUITS } from "./constants";
import type { DifficultyConfig, FruitRecord } from "./types";
import { initialFruitRecord } from "./utils";

export type JuiceOrder = {
  id: string;
  requirements: FruitRecord;
  bonusScore: number;
};

const ORDER_TEMPLATES: Array<Omit<JuiceOrder, "bonusScore">> = [
  { id: "citrus-line", requirements: order({ lemon: 2, grape: 1 }) },
  { id: "orchard-box", requirements: order({ apple: 2, orange: 1 }) },
  { id: "summer-mix", requirements: order({ melon: 2, berry: 1 }) },
  { id: "bright-trio", requirements: order({ apple: 1, lemon: 1, berry: 1 }) },
  { id: "deep-blend", requirements: order({ orange: 1, grape: 1, melon: 1 }) },
];

export function createJuiceOrder(completedOrders: number, difficulty: DifficultyConfig): JuiceOrder {
  const template = ORDER_TEMPLATES[completedOrders % ORDER_TEMPLATES.length];
  return {
    ...template,
    requirements: { ...template.requirements },
    bonusScore: calculateOrderBonus(template.requirements, completedOrders, difficulty.scoreMultiplier),
  };
}

export function isOrderFulfilled(stock: FruitRecord, order: JuiceOrder): boolean {
  return FRUITS.every((fruit) => stock[fruit] >= order.requirements[fruit]);
}

function calculateOrderBonus(requirements: FruitRecord, completedOrders: number, difficultyMultiplier: number): number {
  const total = FRUITS.reduce((sum, fruit) => sum + requirements[fruit], 0);
  const ramp = Math.min(4, completedOrders) * 60;
  return Math.round((520 + total * 120 + ramp) * difficultyMultiplier);
}

function order(partial: Partial<FruitRecord>): FruitRecord {
  return { ...initialFruitRecord(0), ...partial };
}
