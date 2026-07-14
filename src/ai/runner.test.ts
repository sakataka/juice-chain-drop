import { describe, expect, it } from "vitest";
import { FRUITS, GameModel } from "../core";
import type { Fruit, GameSettings } from "../core";
import type { PlayerStats } from "../storage/stats";
import { GameSession } from "../session/gameSession";
import type { GameSessionCommandResult } from "../session/gameSession";
import { AiRunner } from "./runner";
import type { AiCommand, AiGameSnapshot, AiStrategy } from "./types";

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

describe("AiRunner", () => {
  it("dispatches AI decisions through the session command path", () => {
    const { session } = createSession();
    session.start();
    const runner = new AiRunner({
      getSnapshot: () => createAiSnapshot(session),
      executeCommand: (command) => executeAiCommand(session, command),
      strategy: scriptedStrategy([{ kind: "move", dx: -1 }]),
    });
    runner.setEnabled(true);
    runner.setIntervalMs(40);
    const before = session.getRenderSnapshot().active?.axis.x;

    const result = runner.tick(40);

    expect(result?.sounds).toContainEqual({ kind: "tick" });
    expect(session.getRenderSnapshot().active?.axis.x).toBe((before ?? 0) - 1);
  });

  it("does not emit commands while disabled", () => {
    const { session } = createSession();
    session.start();
    const runner = new AiRunner({
      getSnapshot: () => createAiSnapshot(session),
      executeCommand: (command) => executeAiCommand(session, command),
      strategy: scriptedStrategy([{ kind: "hardDrop" }]),
    });

    expect(runner.tick(500)).toBeNull();
    expect(session.getRenderSnapshot().state).toBe("playing");
  });

  it("stops producing commands after game over", () => {
    const { session, game } = createSession();
    session.start();
    game.endGame();
    const runner = new AiRunner({
      getSnapshot: () => createAiSnapshot(session),
      executeCommand: (command) => executeAiCommand(session, command),
      strategy: scriptedStrategy([{ kind: "hardDrop" }]),
    });
    runner.setEnabled(true);

    expect(runner.tick(500)).toBeNull();
    expect(runner.getState().pendingCommands).toBe(0);
  });

  it("forces a hard drop when queued commands stop making progress", () => {
    const { session, game } = createSession();
    session.start();
    game.active = { axis: { x: 0, y: 0, fruit: "apple" }, satellite: { fruit: "orange", rotation: 0 } };
    const runner = new AiRunner({
      getSnapshot: () => createAiSnapshot(session),
      executeCommand: (command) => executeAiCommand(session, command),
      strategy: scriptedStrategy([{ kind: "move", dx: -1 }, { kind: "move", dx: -1 }, { kind: "move", dx: -1 }]),
    });
    runner.setEnabled(true);
    runner.setIntervalMs(40);

    runner.tick(40);
    const result = runner.tick(40);

    expect(result?.sounds.some((cue) => cue.kind === "tap")).toBe(true);
    expect(runner.getState().lastReason).toBe("AI unstuck hard drop");
  });
});

function createSession(): { session: GameSession; game: GameModel } {
  const game = fixedGame();
  const session = new GameSession({
    game,
    settings,
    stats,
    soundEnabled: () => false,
    saveSettings: () => undefined,
    saveStats: () => undefined,
  });
  return { session, game };
}

function scriptedStrategy(commands: AiCommand[]): AiStrategy {
  return {
    id: "scripted",
    choose: () => ({ commands, score: 1, reason: "scripted", evaluatedMoves: 1 }),
  };
}

function createAiSnapshot(session: GameSession): AiGameSnapshot {
  const render = session.getRenderSnapshot();
  const hud = session.getHudSnapshot();
    return {
      board: render.board.map((row) => [...row]),
      active: render.active ? { kind: render.active.kind, axis: { ...render.active.axis }, satellite: { ...render.active.satellite } } : null,
      nextQueue: render.nextQueue.map((pair) => [pair[0], pair[1]]),
      state: render.state,
      score: hud.score,
      lastChain: hud.lastChain,
      featuredFruit: hud.featuredFruit,
      juiceStock: { ...hud.juiceStock },
      juiceProgress: { ...hud.juiceProgress },
      shipment: { ...hud.shipment },
      settings: {
        mode: hud.settings.mode,
        difficulty: hud.settings.difficulty,
        shippingIntervalSeconds: hud.settings.shippingIntervalSeconds,
      },
      challenge: session.getAiChallengeContext(),
    };
}

function executeAiCommand(session: GameSession, command: AiCommand): GameSessionCommandResult | null {
  if (command.kind === "move") return session.move(command.dx);
  if (command.kind === "rotate") return session.rotate();
  if (command.kind === "hardDrop") return session.hardDrop();
  if (command.kind === "useJuice") return session.useJuice(command.fruit);
  return null;
}

function fixedGame(sequence: Fruit[] = ["apple", "orange", "lemon", "grape", "melon"]): GameModel {
  let index = 0;
  return new GameModel(() => {
    const fruitIndex = FRUITS.indexOf(sequence[index % sequence.length]);
    index += 1;
    return fruitIndex / FRUITS.length + 0.01;
  });
}
