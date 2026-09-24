import { describe, expect, it } from "bun:test";
import { GameModel } from "../core/game";
import { createBoard, DIFFICULTY_CONFIGS, makeJuiceDrop } from "../core";
import type { Board, Fruit, GameSettings } from "../core";
import type { PlayerStats } from "../storage/stats";
import { GameSession } from "./gameSession";
import type { SoundCue, VisualEffectCue } from "./gameSession";

const settings: GameSettings = {
  difficulty: "normal",
  mode: "normal",
  aiSpeed: "normal",
  reducedMotion: false,
  sfxVolume: 0.8,
  bgmVolume: 0.45,
};

const stats: PlayerStats = {
  bestScore: 0,
  bestChain: 0,
  playCount: 0,
  lastPlayedAt: null,
  autoPlay: { bestScore: 0, bestChain: 0, playCount: 0 },
};

describe("GameSession", () => {
  it("starts, moves, rotates, and hard drops through command results", () => {
    const { session } = createSession();

    const start = session.start();
    const move = session.move(-1);
    const rotate = session.rotate();
    const hardDrop = session.hardDrop();

    expect(start.effects).toContainEqual({ kind: "clearEffects" });
    expect(start.sounds).toContainEqual({ kind: "bgmContext", mode: "normal", moment: "flow" });
    expect(move.sounds).toContainEqual({ kind: "tick" });
    expect(rotate.sounds).toContainEqual({ kind: "pop" });
    expect(hardDrop.sounds.map((cue) => cue.kind)).toContain("tap");
    expect(session.getRenderSnapshot().state).toBe("playing");
  });

  it("turns a completed press into a falling bottle with pour and splash feedback", () => {
    const { session, game } = createSession();
    session.start();
    game.awardJuice({ apple: game.difficulty.juiceThreshold, orange: 0, lemon: 0, grape: 0, melon: 0, berry: 0 });

    const bottleReady = session.hardDrop();
    expect(session.getRenderSnapshot().active?.kind).toBe("juiceDrop");
    expect(bottleReady.sounds).toContainEqual({ kind: "bgmContext", mode: "normal", moment: "juiceDrop" });
    const result = session.hardDrop();

    expect(result.sounds).toContainEqual({ kind: "pour" });
    expect(result.effects.some((effect) => effect.kind === "juiceSplash" && effect.primary === "apple")).toBe(true);
    expect(result.sounds).toContainEqual({ kind: "bgmContext", mode: "normal", moment: "flow" });
    expect(session.getHudSnapshot().juiceDropsCreated).toBe(1);
  });

  it("only requests render work when visible game state changes", () => {
    const { session } = createSession({ settings: { ...settings } });
    session.start();

    expect(session.tick(1).shouldRender).toBe(false);
    expect(session.move(-1).shouldRender).toBe(true);
    expect(session.rotate().shouldRender).toBe(true);
    expect(session.softDrop().shouldRender).toBe(true);
  });

  it("starts a fresh gravity interval after a hard drop spawns the next piece", () => {
    const { session } = createSession({ settings: { ...settings } });
    session.start();
    session.tick(DIFFICULTY_CONFIGS.normal.dropInterval - 1);
    session.hardDrop();
    const beforeY = session.getRenderSnapshot().active?.axis.y;

    session.tick(1);

    expect(session.getRenderSnapshot().active?.axis.y).toBe(beforeY);
  });

  it("exposes live best score and chain before game-over persistence", () => {
    const { session, game } = createSession({ settings: { ...settings, mode: "chainChallenge" } });
    session.start();
    game.board[11][0] = "apple";
    game.board[11][1] = "apple";
    game.board[11][2] = "apple";
    game.active = { axis: { x: 3, y: 0, fruit: "apple" }, satellite: { fruit: "orange", rotation: 0 } };

    session.hardDrop();

    const hud = session.getHudSnapshot();
    expect(hud.lastChain).toBe(1);
    expect(hud.bestChain).toBe(1);
    expect(hud.bestScore).toBe(hud.score);
    expect(hud.stats.bestChain).toBe(0);
    expect(hud.stats.bestScore).toBe(0);
  });

  it("blocks gameplay commands while paused", () => {
    const { session } = createSession();
    session.start();
    session.togglePause();
    const before = session.getRenderSnapshot().active?.axis.y;

    const move = session.move(1);
    const rotate = session.rotate();
    const drop = session.hardDrop();

    expect(move.shouldUpdateHud).toBe(false);
    expect(rotate.shouldUpdateHud).toBe(false);
    expect(drop.sounds).toEqual([]);
    expect(session.getRenderSnapshot().active?.axis.y).toBe(before);
  });

  it("records game over exactly once", () => {
    const savedStats: PlayerStats[] = [];
    const { session, game } = createSession({ saveStats: (nextStats) => savedStats.push(nextStats) });
    game.state = "playing";
    game.active = { axis: { x: 0, y: 0, fruit: "apple" }, satellite: { fruit: "orange", rotation: 1 } };

    const first = session.settlePiece();
    const second = session.settlePiece();

    expect(first.gameOverRecorded).toBe(true);
    expect(second.gameOverRecorded).toBe(false);
    expect(savedStats).toHaveLength(1);
    expect(savedStats[0].playCount).toBe(1);
  });

  it("replays a chain step by step while holding piece input", () => {
    const { session, game } = createSession();
    session.start();
    game.board = createTwoChainBoard();
    game.active = { axis: { x: 5, y: 0, fruit: "grape" }, satellite: { fruit: "grape", rotation: 0 } };
    const finalBoard = () => game.board.map((row) => [...row]);

    const drop = session.hardDrop();
    const settled = finalBoard();

    expect(drop.effects.some((effect) => effect.kind === "clearPop")).toBe(false);
    expect(session.isResolving()).toBe(true);
    expect(session.getRenderSnapshot()).toMatchObject({ state: "resolving", active: null });
    expect(session.getRenderSnapshot().board).not.toEqual(settled);
    expect(session.getHudSnapshot().state).toBe("resolving");
    expect(session.move(-1)).toBe(session.move(-1));
    expect(session.move(-1).shouldRender).toBe(false);
    expect(session.getRenderSnapshot().nextPreviews[0]).toEqual({ kind: "fruitPair", pair: [game.active!.axis.fruit, game.active!.satellite.fruit] });

    const firstPop = session.tick(100);
    expect(firstPop.effects).toContainEqual(expect.objectContaining({ kind: "clearPop", fruit: "apple", chain: 1 }));
    expect(firstPop.sounds).toContainEqual({ kind: "splash", chain: 1, fruit: "apple" });

    const rest = finishPlayback(session);
    expect(rest.effects).toContainEqual(expect.objectContaining({ kind: "clearPop", fruit: "orange", chain: 2 }));
    expect(rest.sounds).toContainEqual({ kind: "sparkle", chain: 2 });
    expect(session.isResolving()).toBe(false);
    expect(session.getRenderSnapshot().board).toEqual(settled);
    expect(session.getRenderSnapshot().active).toBe(game.active);
    expect(session.move(-1).shouldUpdateHud).toBe(true);
  });

  it("does not replay quiet landings", () => {
    const { session } = createSession();
    session.start();

    session.hardDrop();

    expect(session.isResolving()).toBe(false);
    expect(session.getRenderSnapshot().state).toBe("playing");
  });

  it("freezes chain playback while paused and does not let gravity drop the next piece", () => {
    const { session, game } = createSession();
    session.start();
    game.board = createTwoChainBoard();
    game.active = { axis: { x: 5, y: 0, fruit: "grape" }, satellite: { fruit: "grape", rotation: 0 } };
    session.hardDrop();
    const spawnedY = game.active?.axis.y;

    session.togglePause();
    expect(session.tick(10_000).shouldRender).toBe(false);
    expect(session.isResolving()).toBe(true);
    session.togglePause();
    finishPlayback(session);

    expect(game.active?.axis.y).toBe(spawnedY);
  });

  it("keeps Auto Play runs out of the player's personal records", () => {
    const savedStats: PlayerStats[] = [];
    const { session, game } = createSession({
      stats: { ...stats, bestScore: 500, bestChain: 2, playCount: 4 },
      saveStats: (nextStats) => savedStats.push(nextStats),
    });
    session.start();
    session.markAutoPlay();
    game.score = 9_000;
    game.active = { axis: { x: 0, y: 0, fruit: "apple" }, satellite: { fruit: "orange", rotation: 1 } };

    expect(session.getHudSnapshot().bestScore).toBe(9_000);
    expect(session.getHudSnapshot().recordScope).toBe("autoPlay");
    session.settlePiece();

    expect(savedStats).toHaveLength(1);
    expect(savedStats[0].bestScore).toBe(500);
    expect(savedStats[0].bestChain).toBe(2);
    expect(savedStats[0].playCount).toBe(4);
    expect(savedStats[0].autoPlay.bestScore).toBe(9_000);
    expect(savedStats[0].autoPlay.playCount).toBe(1);

    session.start();
    expect(session.getHudSnapshot().recordScope).toBe("player");
    expect(session.getHudSnapshot().bestScore).toBe(500);
  });

  it("resets challenge state when mode changes", () => {
    const { session } = createSession({ settings: { ...settings, mode: "scoreAttack" } });
    session.start();

    const result = session.setMode("chainChallenge");

    expect(session.getHudSnapshot().challenge.result).toBe("Ready");
    expect(result.sounds).toContainEqual({ kind: "bgmContext", mode: "chainChallenge", moment: "flow" });
  });

  it("ends score attack when the target is reached", () => {
    const { session, game } = createSession({ settings: { ...settings, mode: "scoreAttack" } });
    session.start();
    game.score = 50_000;

    const result = session.tick(1_500);

    expect(result.gameOverRecorded).toBe(true);
    expect(result.sounds).toContainEqual({ kind: "fanfare" });
    expect(session.getRenderSnapshot().state).toBe("gameover");
    expect(session.getHudSnapshot().challenge.result).toBe("Success");
    expect(session.getHudSnapshot().challenge.progress).toBe("50,000 / 50,000 pts, 1.5s");
    expect(session.getHudSnapshot().challenge.resultTitle).toBe("Score Attack Clear");
    expect(session.getHudSnapshot().challenge.resultDetailValue).toBe("1.5s");
  });

  it("ends chain challenge after 60 seconds", () => {
    const { session } = createSession({ settings: { ...settings, mode: "chainChallenge" } });
    session.start();

    const result = session.tick(60_000);

    expect(result.gameOverRecorded).toBe(true);
    expect(result.sounds).toContainEqual({ kind: "fanfare" });
    expect(session.getRenderSnapshot().state).toBe("gameover");
    expect(session.getHudSnapshot().challenge.result).toBe("Success");
    expect(session.getHudSnapshot().challenge.progress).toBe("Best 0 chain, 0s left");
    expect(session.getHudSnapshot().challenge.resultTitle).toBe("Chain Result");
    expect(session.getHudSnapshot().challenge.resultDetailValue).toBe("0 chain");
  });

  it("dilutes the vat with water on the Normal piece interval", () => {
    const { session, game } = createSession();
    session.start();
    const pressure = DIFFICULTY_CONFIGS.normal.waterPressure;
    const drops: VisualEffectCue[] = [];

    for (let piece = 1; piece < pressure.everyPieces; piece += 1) {
      game.board = createBoard();
      drops.push(...session.hardDrop().effects);
    }
    game.board = createBoard();
    expect(drops.filter((effect) => effect.kind === "waterDrop")).toHaveLength(0);
    expect(session.getHudSnapshot().waterIncoming).toEqual({ inPieces: 1, drops: 1 });

    const due = session.hardDrop();

    expect(due.effects.filter((effect) => effect.kind === "waterDrop")).toHaveLength(1);
    expect(game.countWaterCells()).toBe(1);
    expect(game.board.slice(0, 2).flat()).not.toContain("water");
  });

  it("waits for a chain to finish before water lands", () => {
    const { session, game } = createSession();
    session.start();
    const pressure = DIFFICULTY_CONFIGS.normal.waterPressure;
    for (let piece = 1; piece < pressure.everyPieces; piece += 1) {
      game.board = createBoard();
      session.hardDrop();
    }
    game.board = createTwoChainBoard();
    game.active = { axis: { x: 5, y: 0, fruit: "grape" }, satellite: { fruit: "grape", rotation: 0 } };

    const drop = session.hardDrop();
    expect(drop.effects.some((effect) => effect.kind === "waterDrop")).toBe(false);
    const playback = finishPlayback(session);

    expect(playback.effects.filter((effect) => effect.kind === "waterDrop")).toHaveLength(1);
    expect(game.countWaterCells()).toBe(1);
  });

  it("keeps water pressure out of Chain Challenge", () => {
    const { session, game } = createSession({ settings: { ...settings, mode: "chainChallenge" } });
    session.start();

    for (let piece = 0; piece < DIFFICULTY_CONFIGS.normal.waterPressure.everyPieces * 2; piece += 1) {
      game.board = createBoard();
      session.hardDrop();
    }

    expect(game.countWaterCells()).toBe(0);
    expect(session.getHudSnapshot().waterIncoming).toBeNull();
  });

  it("raises progression stage over time and speeds automatic drops", () => {
    const { session, game } = createSession({ settings: { ...settings } });
    session.start();

    const stageChange = session.tick(60_000);
    expect(stageChange.sounds).toContainEqual({ kind: "bgmStage", stage: 1 });
    expect(stageChange.effects).toContainEqual({ kind: "stageAdvance", stage: 1 });
    expect(session.getBgmStage()).toBe(1);

    const beforeY = game.active?.axis.y;
    expect(session.tick(Math.round(DIFFICULTY_CONFIGS.normal.dropInterval * 0.9) - 1).sounds.some((cue) => cue.kind === "tap")).toBe(false);
    expect(game.active?.axis.y).toBe(beforeY);
    session.tick(1);
    expect(game.active?.axis.y).toBe((beforeY ?? 0) + 1);
  });

  it("does not advance progression stage while paused", () => {
    const { session } = createSession({ settings: { ...settings } });
    session.start();
    session.togglePause();

    session.tick(60_000);

    expect(session.getBgmStage()).toBe(0);
  });

  it("starts water cleanup with 30 water cells and does not add timed drops", () => {
    const { session, game } = createSession({ settings: { ...settings, mode: "waterCleanup" } });
    const start = session.start();

    expect(start.effects.filter((effect) => effect.kind === "waterDrop")).toHaveLength(30);
    expect(game.countWaterCells()).toBe(30);

    const tick = session.tick(30_000);

    expect(tick.effects.some((effect) => effect.kind === "waterDrop")).toBe(false);
    expect(game.countWaterCells()).toBe(30);
  });

  it("tracks water cleanup completion from remaining water", () => {
    const { session, game } = createSession({ settings: { ...settings, mode: "waterCleanup" } });
    session.start();
    game.board = createWaterClearBoard();

    const result = session.hardDrop();
    const playback = finishPlayback(session);

    expect(playback.effects.some((effect) => effect.kind === "waterClear")).toBe(true);
    expect(result.sounds).toContainEqual({ kind: "fanfare" });
    expect(session.getRenderSnapshot().state).toBe("gameover");
    expect(session.getHudSnapshot().challenge.progress).toBe("0 / 30 water, 0.0s");
    expect(session.getHudSnapshot().challenge.result).toBe("Success");
    expect(session.getHudSnapshot().challenge.resultTitle).toBe("Water Cleanup Clear");
    expect(session.getHudSnapshot().challenge.resultDetailValue).toBe("0.0s");
  });

  it("shows water cleanup clear result when juice removes the last water", () => {
    const { session, game } = createSession({ settings: { ...settings, mode: "waterCleanup" } });
    session.start();
    session.tick(12_340);
    game.board = createJuiceWaterClearBoard();
    game.active = { ...makeJuiceDrop("orange"), axis: { x: 2, y: 1, fruit: "orange" } };

    const result = session.settlePiece();

    expect(result.gameOverRecorded).toBe(true);
    expect(result.sounds).toContainEqual({ kind: "fanfare" });
    expect(session.getRenderSnapshot().state).toBe("resolving");
    finishPlayback(session);
    expect(session.getRenderSnapshot().state).toBe("gameover");
    expect(session.getHudSnapshot().challenge.result).toBe("Success");
    expect(session.getHudSnapshot().challenge.resultTitle).toBe("Water Cleanup Clear");
    expect(session.getHudSnapshot().challenge.resultDetailValue).toBe("12.3s");
  });
});

function createSession(
  overrides: Partial<{
    settings: GameSettings;
    stats: PlayerStats;
    saveStats: (stats: PlayerStats) => void;
    rng: () => number;
  }> = {},
): { session: GameSession; game: GameModel } {
  const game = fixedGame();
  const session = new GameSession({
    game,
    settings: overrides.settings ?? settings,
    stats: overrides.stats ?? stats,
    soundEnabled: () => false,
    saveSettings: () => undefined,
    saveStats: overrides.saveStats ?? (() => undefined),
    rng: overrides.rng,
  });
  return { session, game };
}

function fixedGame(sequence: Fruit[] = ["apple", "orange", "lemon", "grape", "melon", "berry"]): GameModel {
  let index = 0;
  return new GameModel(() => {
    const fruitIndex = ["apple", "orange", "lemon", "grape", "melon", "berry"].indexOf(sequence[index % sequence.length]);
    index += 1;
    return fruitIndex / 6 + 0.01;
  });
}

function finishPlayback(session: GameSession): { sounds: SoundCue[]; effects: VisualEffectCue[] } {
  const merged: { sounds: SoundCue[]; effects: VisualEffectCue[] } = { sounds: [], effects: [] };
  for (let guard = 0; guard < 200 && session.isResolving(); guard += 1) {
    const result = session.tick(50);
    merged.sounds.push(...result.sounds);
    merged.effects.push(...result.effects);
  }
  return merged;
}

/** Apples clear first, then the orange column falls onto the floor row and clears as chain 2. */
function createTwoChainBoard(): Board {
  const rows = ["......", "......", "......", "......", "......", "......", "......", "......", "o.....", "a.....", "aooo..", "aa...."];
  const map: Record<string, Fruit | null> = { ".": null, a: "apple", o: "orange" };
  return rows.map((row) => [...row].map((cell) => map[cell])) as Board;
}

function createWaterClearBoard(): Board {
  const board = Array.from({ length: 12 }, () => Array.from({ length: 6 }, () => null)) as GameModel["board"];
  board[10][0] = "water";
  board[10][1] = "apple";
  board[10][2] = "apple";
  board[11][0] = "water";
  board[11][1] = "apple";
  board[11][2] = "apple";
  board[11][3] = "water";
  board[9][1] = "water";
  return board;
}

function createJuiceWaterClearBoard(): Board {
  const board = Array.from({ length: 12 }, () => Array.from({ length: 6 }, () => null)) as GameModel["board"];
  for (let x = 0; x < 6; x += 1) {
    board[1][x] = "water";
  }
  return board;
}
