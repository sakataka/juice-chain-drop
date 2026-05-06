import { describe, expect, it } from "vitest";
import { DEFAULT_GAME_SETTINGS, loadGameSettings, saveGameSettings } from "./settings";
import type { StatsStorage } from "./stats";

describe("game settings storage", () => {
  it("uses normal difficulty by default", () => {
    expect(loadGameSettings(null)).toEqual(DEFAULT_GAME_SETTINGS);
    expect(loadGameSettings(memoryStorage())).toEqual(DEFAULT_GAME_SETTINGS);
  });

  it("ignores corrupted or unknown setting values", () => {
    const storage = memoryStorage();
    storage.setItem("juice-chain-drop:settings", JSON.stringify({ difficulty: "extreme", mode: "daily", aiSpeed: "turbo", sfxVolume: "loud", bgmVolume: Number.NaN }));

    expect(loadGameSettings(storage)).toEqual(DEFAULT_GAME_SETTINGS);

    storage.setItem("juice-chain-drop:settings", "{bad json");
    expect(loadGameSettings(storage)).toEqual(DEFAULT_GAME_SETTINGS);
  });

  it("saves selected difficulty", () => {
    const storage = memoryStorage();
    saveGameSettings({ difficulty: "hard", mode: "chainChallenge", aiSpeed: "fast", shippingIntervalSeconds: 75, waterEnabled: false, reducedMotion: true, sfxVolume: 0.25, bgmVolume: 0.75 }, storage);

    expect(loadGameSettings(storage).difficulty).toBe("hard");
    expect(loadGameSettings(storage).mode).toBe("chainChallenge");
    expect(loadGameSettings(storage).aiSpeed).toBe("fast");
    expect(loadGameSettings(storage).shippingIntervalSeconds).toBe(75);
    expect(loadGameSettings(storage).waterEnabled).toBe(false);
    expect(loadGameSettings(storage).reducedMotion).toBe(true);
    expect(loadGameSettings(storage).sfxVolume).toBe(0.25);
    expect(loadGameSettings(storage).bgmVolume).toBe(0.75);
  });

  it("normalizes unknown modes to normal", () => {
    const storage = memoryStorage();
    storage.setItem("juice-chain-drop:settings", JSON.stringify({ mode: "unknownMode" }));
    expect(loadGameSettings(storage).mode).toBe("normal");
  });

  it("clamps saved volume settings into the supported range", () => {
    const storage = memoryStorage();
    storage.setItem("juice-chain-drop:settings", JSON.stringify({ sfxVolume: 2, bgmVolume: -1 }));

    expect(loadGameSettings(storage).sfxVolume).toBe(1);
    expect(loadGameSettings(storage).bgmVolume).toBe(0);
  });

  it("normalizes shipment interval and ignores removed shipping flags", () => {
    const storage = memoryStorage();
    storage.setItem("juice-chain-drop:settings", JSON.stringify({ shippingIntervalSeconds: 999 }));
    expect(loadGameSettings(storage).shippingIntervalSeconds).toBe(600);

    storage.setItem("juice-chain-drop:settings", JSON.stringify({ shippingEnabled: false }));
    expect(loadGameSettings(storage).shippingIntervalSeconds).toBe(DEFAULT_GAME_SETTINGS.shippingIntervalSeconds);
  });

  it("defaults water hazards on unless explicitly disabled", () => {
    const storage = memoryStorage();
    storage.setItem("juice-chain-drop:settings", JSON.stringify({ waterEnabled: "no" }));
    expect(loadGameSettings(storage).waterEnabled).toBe(true);

    storage.setItem("juice-chain-drop:settings", JSON.stringify({ waterEnabled: false }));
    expect(loadGameSettings(storage).waterEnabled).toBe(false);
  });
});

function memoryStorage(): StatsStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}
