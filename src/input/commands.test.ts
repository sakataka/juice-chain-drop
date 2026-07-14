import { describe, expect, it, vi } from "vitest";
import { GameModel } from "../core/game";
import type { AiRunnerState } from "../ai";
import type { GameSettings } from "../core";
import type { GameSessionCommandResult } from "../session/gameSession";
import { GameSession } from "../session/gameSession";
import type { PlayerStats } from "../storage/stats";
import { GameCommandBus } from "./commands";

const settings: GameSettings = {
  difficulty: "normal",
  mode: "normal",
  aiSpeed: "normal",
  shippingIntervalSeconds: 45,
  waterEnabled: true,
  reducedMotion: false,
  sfxVolume: 0.8,
  bgmVolume: 0.45,
};

const stats: PlayerStats = {
  bestScore: 0,
  bestChain: 0,
  playCount: 0,
  lastPlayedAt: null,
};

describe("GameCommandBus", () => {
  it("routes manual commands through one place while preserving AI stop and sound unlock behavior", () => {
    const { bus, session, ai, unlockSound, applyResult, updateHud } = createBus();
    bus.dispatch({ kind: "start" });
    const beforeX = session.getRenderSnapshot().active?.axis.x;

    const result = bus.dispatch({ kind: "move", dx: -1 }, { manual: true, unlockSound: true });

    expect(unlockSound).toHaveBeenCalledTimes(1);
    expect(ai.setEnabled).toHaveBeenCalledWith(false);
    expect(result?.sounds).toContainEqual({ kind: "tick" });
    expect(session.getRenderSnapshot().active?.axis.x).toBe((beforeX ?? 0) - 1);
    expect(applyResult).toHaveBeenCalledWith(result);
    expect(updateHud).toHaveBeenCalled();
  });

  it("keeps HUD sound and AI controls as boundary commands without touching session commands", () => {
    const { bus, ai, sound, applyResult, updateHud, unlockSound } = createBus();

    expect(bus.dispatch({ kind: "toggleSound" })).toBeNull();
    expect(sound.toggle).toHaveBeenCalledTimes(1);
    expect(applyResult).not.toHaveBeenCalled();
    expect(updateHud).toHaveBeenCalledTimes(1);
    expect(unlockSound).not.toHaveBeenCalled();
    expect(ai.setEnabled).not.toHaveBeenCalled();

    expect(bus.dispatch({ kind: "toggleAi" })).toBeNull();
    expect(ai.toggle).toHaveBeenCalledTimes(1);
    expect(updateHud).toHaveBeenCalledTimes(2);
  });

  it("applies setting side effects and session persistence from the same command path", () => {
    const { bus, session, ai, sound, applyResult } = createBus();

    bus.dispatch({ kind: "setAiSpeed", speed: "fast" });
    bus.dispatch({ kind: "setSfxVolume", sfxVolume: 0.25 });
    bus.dispatch({ kind: "setBgmVolume", bgmVolume: 0.5 });

    expect(ai.setIntervalMs).toHaveBeenCalledWith(65);
    expect(sound.setSfxVolume).toHaveBeenCalledWith(0.25);
    expect(sound.setBgmVolume).toHaveBeenCalledWith(0.5);
    expect(session.getSettings()).toMatchObject({ aiSpeed: "fast", sfxVolume: 0.25, bgmVolume: 0.5 });
    expect(applyResult).toHaveBeenCalledTimes(3);
  });

  it("syncs BGM playback with pause and resume state changes", () => {
    const { bus, sound } = createBus();
    bus.dispatch({ kind: "start" });

    bus.dispatch({ kind: "togglePause" });
    bus.dispatch({ kind: "togglePause" });

    expect(sound.syncGameState).toHaveBeenCalledWith("paused", 0);
    expect(sound.syncGameState).toHaveBeenLastCalledWith("playing", 0);
  });

  it("executes AI commands without manual AI cancellation", () => {
    const { bus, session, ai, applyResult, updateHud } = createBus();
    bus.dispatch({ kind: "start" });
    const beforeX = session.getRenderSnapshot().active?.axis.x;

    const result = bus.dispatchAiCommand({ kind: "move", dx: 1 });

    expect(ai.setEnabled).not.toHaveBeenCalledWith(false);
    expect(result?.sounds).toContainEqual({ kind: "tick" });
    expect(session.getRenderSnapshot().active?.axis.x).toBe((beforeX ?? 0) + 1);
    expect(applyResult).toHaveBeenCalledWith(result);
    expect(updateHud).not.toHaveBeenCalled();
  });

  it("builds AI snapshots with next queue, shipment, and typed mode context", () => {
    const { bus, session, game } = createBus();
    bus.dispatch({ kind: "setMode", mode: "scoreAttack" });
    bus.dispatch({ kind: "start" });
    game.juiceStock.apple = 2;
    game.active = { kind: "juiceDrop", axis: { x: 2, y: 0, fruit: "apple" }, satellite: { fruit: "apple", rotation: 0 } };

    const snapshot = bus.createAiSnapshot();

    expect(snapshot.nextQueue).toEqual(session.getRenderSnapshot().nextQueue);
    expect(snapshot.nextQueue).not.toBe(session.getRenderSnapshot().nextQueue);
    expect(snapshot.shipment).toMatchObject({ enabled: true, intervalSeconds: 45 });
    expect(snapshot.settings).toMatchObject({ mode: "scoreAttack", difficulty: "normal" });
    expect(snapshot.challenge).toMatchObject({ mode: "scoreAttack", targetScore: 50_000, result: "Active" });
    expect(snapshot.juiceStock.apple).toBe(2);
    expect(snapshot.active?.kind).toBe("juiceDrop");
  });
});

function createBus(): {
  bus: GameCommandBus;
  session: GameSession;
  game: GameModel;
  ai: {
    setEnabled: ReturnType<typeof vi.fn>;
    toggle: ReturnType<typeof vi.fn>;
    setIntervalMs: ReturnType<typeof vi.fn>;
    getState: () => AiRunnerState;
  };
  sound: {
    toggle: ReturnType<typeof vi.fn>;
    syncGameState: ReturnType<typeof vi.fn>;
    setSfxVolume: ReturnType<typeof vi.fn>;
    setBgmVolume: ReturnType<typeof vi.fn>;
  };
  applyResult: ReturnType<typeof vi.fn<(result: GameSessionCommandResult) => void>>;
  updateHud: ReturnType<typeof vi.fn>;
  unlockSound: ReturnType<typeof vi.fn>;
} {
  const game = new GameModel();
  const session = new GameSession({
    game,
    settings,
    stats,
    soundEnabled: () => false,
    saveSettings: () => undefined,
    saveStats: () => undefined,
  });
  const ai = {
    setEnabled: vi.fn(),
    toggle: vi.fn(() => true),
    setIntervalMs: vi.fn(),
    getState: () => ({ enabled: false, intervalMs: 120, pendingCommands: 0, lastReason: "test" }),
  };
  const sound = {
    toggle: vi.fn(),
    syncGameState: vi.fn(),
    setSfxVolume: vi.fn(),
    setBgmVolume: vi.fn(),
  };
  const applyResult = vi.fn<(result: GameSessionCommandResult) => void>();
  const updateHud = vi.fn();
  const unlockSound = vi.fn();
  const bus = new GameCommandBus({
    session,
    ai,
    sound,
    applyResult,
    updateHud,
    toggleSettings: vi.fn(),
    unlockSound,
    aiIntervalForSpeed: (speed) => (speed === "fast" ? 65 : speed === "slow" ? 220 : 120),
  });
  return { bus, session, game, ai, sound, applyResult, updateHud, unlockSound };
}
