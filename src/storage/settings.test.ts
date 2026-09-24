import { describe, expect, it } from "bun:test";
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
    saveGameSettings({ difficulty: "hard", mode: "chainChallenge", aiSpeed: "fast", reducedMotion: true, sfxVolume: 0.25, bgmVolume: 0.75 }, storage);

    expect(loadGameSettings(storage).difficulty).toBe("hard");
    expect(loadGameSettings(storage).mode).toBe("chainChallenge");
    expect(loadGameSettings(storage).aiSpeed).toBe("fast");
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

  it("drops settings from removed features when loading older saves", () => {
    const storage = memoryStorage();
    storage.setItem("juice-chain-drop:settings", JSON.stringify({ difficulty: "hard", shippingIntervalSeconds: 999, waterEnabled: false }));

    expect(loadGameSettings(storage)).toEqual({ ...DEFAULT_GAME_SETTINGS, difficulty: "hard" });
  });
});

function memoryStorage(): StatsStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}
