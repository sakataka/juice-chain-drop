import { describe, expect, it } from "bun:test";
import { getDifficultyConfig } from "./difficulty";
import { GAME_MODE_CONFIGS } from "./modes";
import { getWaterPressureDrops, getWaterPressureSize } from "./pressure";
import { applyJuiceAwards } from "./rules";
import { initialFruitRecord } from "./utils";

describe("water pressure", () => {
  const normal = getDifficultyConfig("normal");
  const every = normal.waterPressure.everyPieces;

  it("drops water only on the configured piece interval", () => {
    expect(getWaterPressureDrops(normal, GAME_MODE_CONFIGS.normal, every - 1)).toBe(0);
    expect(getWaterPressureDrops(normal, GAME_MODE_CONFIGS.normal, every)).toBe(1);
    expect(getWaterPressureDrops(normal, GAME_MODE_CONFIGS.normal, every + 1)).toBe(0);
    expect(getWaterPressureDrops(normal, GAME_MODE_CONFIGS.normal, 0)).toBe(0);
  });

  it("keeps growing with pieces placed so endless play always ends", () => {
    const ramp = normal.waterPressure.rampPieces;
    expect(getWaterPressureSize(normal, ramp)).toBe(1);
    expect(getWaterPressureSize(normal, ramp + 1)).toBe(2);
    expect(getWaterPressureSize(normal, ramp * 10 + 1)).toBe(11);
  });

  it("presses harder on higher difficulties", () => {
    const easy = getDifficultyConfig("easy").waterPressure;
    const hard = getDifficultyConfig("hard").waterPressure;
    expect(easy.everyPieces).toBeGreaterThanOrEqual(normal.waterPressure.everyPieces);
    expect(hard.everyPieces).toBeLessThanOrEqual(normal.waterPressure.everyPieces);
    expect(hard.rampPieces).toBeLessThan(easy.rampPieces);
  });

  it("stays out of modes that measure pure chaining or cleanup", () => {
    expect(getWaterPressureDrops(normal, GAME_MODE_CONFIGS.scoreAttack, every)).toBeGreaterThan(0);
    expect(getWaterPressureDrops(normal, GAME_MODE_CONFIGS.chainChallenge, every)).toBe(0);
    expect(getWaterPressureDrops(normal, GAME_MODE_CONFIGS.waterCleanup, every)).toBe(0);
  });
});

describe("chain-weighted pressing", () => {
  it("counts fruit cleared in chain step k as k units of juice", () => {
    const difficulty = { ...getDifficultyConfig("normal"), juiceThreshold: 100 };
    const step = (apple: number) => ({ ...initialFruitRecord(0), apple });

    const result = applyJuiceAwards({ juiceProgress: initialFruitRecord(0), juiceStock: initialFruitRecord(0), awards: [step(4), step(4), step(5)], difficulty });

    expect(result.juiceProgress.apple).toBe(4 * 1 + 4 * 2 + 5 * 3);
  });

  it("makes a single four-clear worth less than a bottle on every difficulty", () => {
    for (const id of ["easy", "normal", "hard"] as const) {
      expect(getDifficultyConfig(id).juiceThreshold).toBeGreaterThan(4);
    }
  });
});
