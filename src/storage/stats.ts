export type PlayerStats = {
  bestScore: number;
  bestChain: number;
  playCount: number;
  lastPlayedAt: string | null;
};

export type StatsStorage = Pick<Storage, "getItem" | "setItem">;

const STATS_KEY = "juice-chain-drop:player-stats";

export const DEFAULT_PLAYER_STATS: PlayerStats = {
  bestScore: 0,
  bestChain: 0,
  playCount: 0,
  lastPlayedAt: null,
};

export function loadPlayerStats(storage: StatsStorage | null = getLocalStorage()): PlayerStats {
  if (!storage) return { ...DEFAULT_PLAYER_STATS };
  const raw = storage.getItem(STATS_KEY);
  if (!raw) return { ...DEFAULT_PLAYER_STATS };

  try {
    const parsed = JSON.parse(raw) as Partial<PlayerStats>;
    return normalizeStats(parsed);
  } catch {
    return { ...DEFAULT_PLAYER_STATS };
  }
}

export function savePlayerStats(stats: PlayerStats, storage: StatsStorage | null = getLocalStorage()): void {
  if (!storage) return;
  storage.setItem(STATS_KEY, JSON.stringify(normalizeStats(stats)));
}

export function completePlayerStats(stats: PlayerStats, score: number, chain: number, now = new Date()): PlayerStats {
  return {
    bestScore: Math.max(stats.bestScore, Math.max(0, Math.floor(score))),
    bestChain: Math.max(stats.bestChain, Math.max(0, Math.floor(chain))),
    playCount: stats.playCount + 1,
    lastPlayedAt: now.toISOString(),
  };
}

function normalizeStats(value: Partial<PlayerStats>): PlayerStats {
  return {
    bestScore: normalizeCount(value.bestScore),
    bestChain: normalizeCount(value.bestChain),
    playCount: normalizeCount(value.playCount),
    lastPlayedAt: normalizeDateString(value.lastPlayedAt),
  };
}

function normalizeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function normalizeDateString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return Number.isNaN(new Date(value).getTime()) ? null : value;
}

function getLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
