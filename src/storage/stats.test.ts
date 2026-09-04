import { describe, expect, it } from "bun:test";
import { completePlayerStats, DEFAULT_PLAYER_STATS, loadPlayerStats, savePlayerStats, type StatsStorage } from "./stats";

describe("player stats storage", () => {
  it("returns defaults when storage is empty or unavailable", () => {
    expect(loadPlayerStats(null)).toEqual(DEFAULT_PLAYER_STATS);
    expect(loadPlayerStats(memoryStorage())).toEqual(DEFAULT_PLAYER_STATS);
  });

  it("ignores corrupted saved stats", () => {
    const storage = memoryStorage();
    storage.setItem("juice-chain-drop:player-stats", "{bad json");

    expect(loadPlayerStats(storage)).toEqual(DEFAULT_PLAYER_STATS);
  });

  it("normalizes invalid saved fields", () => {
    const storage = memoryStorage();
    storage.setItem(
      "juice-chain-drop:player-stats",
      JSON.stringify({ bestScore: 120.8, bestChain: -1, playCount: "many", lastPlayedAt: 42 }),
    );

    expect(loadPlayerStats(storage)).toEqual({
      bestScore: 120,
      bestChain: 0,
      playCount: 0,
      lastPlayedAt: null,
    });
  });

  it("drops corrupted saved last played dates", () => {
    const storage = memoryStorage();
    storage.setItem(
      "juice-chain-drop:player-stats",
      JSON.stringify({ bestScore: 120, bestChain: 3, playCount: 2, lastPlayedAt: "not-a-date" }),
    );

    expect(loadPlayerStats(storage)).toEqual({
      bestScore: 120,
      bestChain: 3,
      playCount: 2,
      lastPlayedAt: null,
    });
  });

  it("updates best values, play count, and last played time", () => {
    const next = completePlayerStats(
      { bestScore: 400, bestChain: 2, playCount: 3, lastPlayedAt: null },
      320,
      5,
      new Date("2026-04-26T10:20:30.000Z"),
    );

    expect(next).toEqual({
      bestScore: 400,
      bestChain: 5,
      playCount: 4,
      lastPlayedAt: "2026-04-26T10:20:30.000Z",
    });
  });

  it("saves normalized stats", () => {
    const storage = memoryStorage();
    savePlayerStats({ bestScore: 10.7, bestChain: 2, playCount: 1, lastPlayedAt: "2026-04-26T00:00:00.000Z" }, storage);

    expect(loadPlayerStats(storage).bestScore).toBe(10);
  });
});

function memoryStorage(): StatsStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}
