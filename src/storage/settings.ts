import { DEFAULT_DIFFICULTY, DEFAULT_GAME_MODE, isDifficultyId, isGameModeId } from "../core";
import type { AiSpeed, GameSettings } from "../core";
import type { StatsStorage } from "./stats";

const SETTINGS_KEY = "juice-chain-drop:settings";

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  difficulty: DEFAULT_DIFFICULTY,
  mode: DEFAULT_GAME_MODE,
  aiSpeed: "normal",
  reducedMotion: false,
  sfxVolume: 0.5,
  bgmVolume: 0.45,
};

export function loadGameSettings(storage: StatsStorage | null = getLocalStorage()): GameSettings {
  if (!storage) return { ...DEFAULT_GAME_SETTINGS };
  const raw = storage.getItem(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_GAME_SETTINGS };

  try {
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return normalizeSettings(parsed);
  } catch {
    return { ...DEFAULT_GAME_SETTINGS };
  }
}

export function saveGameSettings(settings: GameSettings, storage: StatsStorage | null = getLocalStorage()): void {
  if (!storage) return;
  storage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
}

function normalizeSettings(value: Partial<GameSettings>): GameSettings {
  return {
    difficulty: isDifficultyId(value.difficulty) ? value.difficulty : DEFAULT_DIFFICULTY,
    mode: isGameModeId(value.mode) ? value.mode : DEFAULT_GAME_MODE,
    aiSpeed: isAiSpeed(value.aiSpeed) ? value.aiSpeed : DEFAULT_GAME_SETTINGS.aiSpeed,
    reducedMotion: value.reducedMotion === true,
    sfxVolume: normalizeVolume(value.sfxVolume, DEFAULT_GAME_SETTINGS.sfxVolume),
    bgmVolume: normalizeVolume(value.bgmVolume, DEFAULT_GAME_SETTINGS.bgmVolume),
  };
}

function isAiSpeed(value: unknown): value is AiSpeed {
  return value === "slow" || value === "normal" || value === "fast";
}

function normalizeVolume(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function getLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
