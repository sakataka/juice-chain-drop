export type AutoPlayStats = {
  bestScore: number;
  bestChain: number;
  playCount: number;
};

export type PlayerStats = {
  bestScore: number;
  bestChain: number;
  playCount: number;
  lastPlayedAt: string | null;
  autoPlay: AutoPlayStats;
};

export type RecordScope = "player" | "autoPlay";

export type StatsStorage = Pick<Storage, "getItem" | "setItem">;

const STATS_KEY = "juice-chain-drop:player-stats";

export const DEFAULT_PLAYER_STATS: PlayerStats = {
  bestScore: 0,
  bestChain: 0,
  playCount: 0,
  lastPlayedAt: null,
  autoPlay: { bestScore: 0, bestChain: 0, playCount: 0 },
};

export function loadPlayerStats(storage: StatsStorage | null = getLocalStorage()): PlayerStats {
  if (!storage) return createDefaultStats();
  const raw = storage.getItem(STATS_KEY);
  if (!raw) return createDefaultStats();

  try {
    const parsed = JSON.parse(raw) as Partial<PlayerStats>;
    return normalizeStats(parsed);
  } catch {
    return createDefaultStats();
  }
}

export function savePlayerStats(stats: PlayerStats, storage: StatsStorage | null = getLocalStorage()): void {
  if (!storage) return;
  storage.setItem(STATS_KEY, JSON.stringify(normalizeStats(stats)));
}

export function completePlayerStats(stats: PlayerStats, score: number, chain: number, now = new Date(), scope: RecordScope = "player"): PlayerStats {
  if (scope === "autoPlay") {
    return { ...stats, autoPlay: completeRecord(stats.autoPlay, score, chain) };
  }
  return {
    ...completeRecord(stats, score, chain),
    lastPlayedAt: now.toISOString(),
    autoPlay: stats.autoPlay,
  };
}

export function getScopedRecord(stats: PlayerStats, scope: RecordScope): AutoPlayStats {
  return scope === "autoPlay" ? stats.autoPlay : { bestScore: stats.bestScore, bestChain: stats.bestChain, playCount: stats.playCount };
}

function completeRecord(record: AutoPlayStats, score: number, chain: number): AutoPlayStats {
  return {
    bestScore: Math.max(record.bestScore, Math.max(0, Math.floor(score))),
    bestChain: Math.max(record.bestChain, Math.max(0, Math.floor(chain))),
    playCount: record.playCount + 1,
  };
}

function createDefaultStats(): PlayerStats {
  return { ...DEFAULT_PLAYER_STATS, autoPlay: { ...DEFAULT_PLAYER_STATS.autoPlay } };
}

function normalizeStats(value: Partial<PlayerStats>): PlayerStats {
  const autoPlay: Partial<AutoPlayStats> = typeof value.autoPlay === "object" && value.autoPlay !== null ? value.autoPlay : {};
  return {
    bestScore: normalizeCount(value.bestScore),
    bestChain: normalizeCount(value.bestChain),
    playCount: normalizeCount(value.playCount),
    lastPlayedAt: normalizeDateString(value.lastPlayedAt),
    autoPlay: {
      bestScore: normalizeCount(autoPlay.bestScore),
      bestChain: normalizeCount(autoPlay.bestChain),
      playCount: normalizeCount(autoPlay.playCount),
    },
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
