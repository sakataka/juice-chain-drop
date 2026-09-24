import { describe, expect, it } from "bun:test";
import { GameModel } from "../core/game";
import { DIFFICULTY_CONFIGS, makeJuiceDrop } from "../core";
import type { Board, Fruit, GameSettings } from "../core";
import type { PlayerStats } from "../storage/stats";
import { GameSession } from "./gameSession";

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
    game.awardJuice({ apple: 4, orange: 0, lemon: 0, grape: 0, melon: 0, berry: 0 });

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

  it("does not inject timed water into normal mode", () => {
    const { session, game } = createSession();
    session.start();

    const result = session.tick(30_000);
    expect(result.effects.some((effect) => effect.kind === "waterDrop")).toBe(false);
    expect(game.board.flat()).not.toContain("water");
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

    expect(result.effects.some((effect) => effect.kind === "waterClear")).toBe(true);
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
