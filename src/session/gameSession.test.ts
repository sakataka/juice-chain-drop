import { describe, expect, it } from "vitest";
import { GameModel } from "../core/game";
import { DEFAULT_SHIPMENT_INTERVAL_SECONDS, DIFFICULTY_CONFIGS, WATER_GRACE_MS } from "../core";
import type { Board, Fruit, GameSettings } from "../core";
import type { PlayerStats } from "../storage/stats";
import { GameSession } from "./gameSession";

const settings: GameSettings = {
  difficulty: "normal",
  mode: "normal",
  aiSpeed: "normal",
  shippingIntervalSeconds: DEFAULT_SHIPMENT_INTERVAL_SECONDS,
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

describe("GameSession", () => {
  it("starts, moves, rotates, and hard drops through command results", () => {
    const { session } = createSession();

    const start = session.start();
    const move = session.move(-1);
    const rotate = session.rotate();
    const hardDrop = session.hardDrop();

    expect(start.effects).toContainEqual({ kind: "clearEffects" });
    expect(move.sounds).toContainEqual({ kind: "tick" });
    expect(rotate.sounds).toContainEqual({ kind: "pop" });
    expect(hardDrop.sounds.map((cue) => cue.kind)).toContain("tap");
    expect(session.getRenderSnapshot().state).toBe("playing");
  });

  it("turns a completed press into a falling bottle with pour and splash feedback", () => {
    const { session, game } = createSession();
    session.start();
    game.awardJuice({ apple: 4, orange: 0, lemon: 0, grape: 0, melon: 0, berry: 0 });

    session.hardDrop();
    expect(session.getRenderSnapshot().active?.kind).toBe("juiceDrop");
    const result = session.hardDrop();

    expect(result.sounds).toContainEqual({ kind: "pour" });
    expect(result.effects.some((effect) => effect.kind === "juiceSplash" && effect.primary === "apple")).toBe(true);
    expect(session.getHudSnapshot().juiceDropsCreated).toBe(1);
  });

  it("only requests render work when visible game state changes", () => {
    const { session } = createSession({ settings: { ...settings, waterEnabled: false } });
    session.start();

    expect(session.tick(1).shouldRender).toBe(false);
    expect(session.move(-1).shouldRender).toBe(true);
    expect(session.rotate().shouldRender).toBe(true);
    expect(session.softDrop().shouldRender).toBe(true);
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

  it("resets challenge state when mode changes", () => {
    const { session } = createSession({ settings: { ...settings, mode: "scoreAttack" } });
    session.start();

    session.setMode("chainChallenge");

    expect(session.getHudSnapshot().challenge.result).toBe("Ready");
  });

  it("keeps completed juice for Juice Drop instead of auto-shipping it", () => {
    const { session, game } = createSession();
    session.start();
    game.juiceStock.apple = 2;
    game.juiceStock.orange = 1;

    const result = session.tick(DEFAULT_SHIPMENT_INTERVAL_SECONDS * 1000);

    expect(result.sounds.some((cue) => cue.kind === "shipment")).toBe(false);
    expect(result.effects.some((effect) => effect.kind === "shipment")).toBe(false);
    expect(session.getHudSnapshot().score).toBeLessThan(1440);
    expect(game.juiceStock.apple).toBe(2);
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

  it("does not advance shipment timing while paused", () => {
    const { session, game } = createSession();
    session.start();
    game.juiceStock.apple = 1;
    session.togglePause();

    const result = session.tick(DEFAULT_SHIPMENT_INTERVAL_SECONDS * 1000);

    expect(result.sounds).toEqual([]);
    expect(game.juiceStock.apple).toBe(1);
    expect(session.getHudSnapshot().shipment.remainingMs).toBe(DEFAULT_SHIPMENT_INTERVAL_SECONDS * 1000);
  });

  it("does not ship when the shipping interval is zero", () => {
    const { session, game } = createSession({ settings: { ...settings, shippingIntervalSeconds: 0, waterEnabled: false } });
    session.start();
    game.juiceStock.apple = 1;

    const result = session.tick(DEFAULT_SHIPMENT_INTERVAL_SECONDS * 1000);

    expect(result.sounds).toEqual([]);
    expect(game.juiceStock.apple).toBe(1);
    expect(session.getHudSnapshot().shipment.enabled).toBe(false);
  });

  it("does not inject timed water into normal mode", () => {
    const { session, game } = createSession();
    session.start();

    const result = session.tick(WATER_GRACE_MS * 3);
    expect(result.effects.some((effect) => effect.kind === "waterDrop")).toBe(false);
    expect(game.board.flat()).not.toContain("water");
  });

  it("raises progression stage over time and speeds automatic drops", () => {
    const { session, game } = createSession({ settings: { ...settings, waterEnabled: false } });
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
    const { session } = createSession({ settings: { ...settings, waterEnabled: false } });
    session.start();
    session.togglePause();

    session.tick(60_000);

    expect(session.getBgmStage()).toBe(0);
  });

  it("does not rotate a hidden featured-fruit modifier", () => {
    const { session } = createSession();
    session.start();

    expect(session.getHudSnapshot().featuredFruit).toBe("apple");
    const result = session.tick(30_000);

    expect(result.shouldUpdateHud).toBe(false);
    expect(session.getHudSnapshot().featuredFruit).toBe("apple");
  });

  it("does not drop water when disabled or outside normal mode", () => {
    const disabled = createSession({ settings: { ...settings, waterEnabled: false } });
    disabled.session.start();
    expect(disabled.session.tick(WATER_GRACE_MS).effects.some((effect) => effect.kind === "waterDrop")).toBe(false);

    const challenge = createSession({ settings: { ...settings, mode: "scoreAttack" } });
    challenge.session.start();
    expect(challenge.session.tick(WATER_GRACE_MS).effects.some((effect) => effect.kind === "waterDrop")).toBe(false);
  });

  it("starts water cleanup with 30 water cells and does not add timed drops", () => {
    const { session, game } = createSession({ settings: { ...settings, mode: "waterCleanup", waterEnabled: false } });
    const start = session.start();

    expect(start.effects.filter((effect) => effect.kind === "waterDrop")).toHaveLength(30);
    expect(game.countWaterCells()).toBe(30);

    const tick = session.tick(WATER_GRACE_MS);

    expect(tick.effects.some((effect) => effect.kind === "waterDrop")).toBe(false);
    expect(game.countWaterCells()).toBe(30);
  });

  it("tracks water cleanup completion from remaining water", () => {
    const { session, game } = createSession({ settings: { ...settings, mode: "waterCleanup", waterEnabled: false } });
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
    const { session, game } = createSession({ settings: { ...settings, mode: "waterCleanup", waterEnabled: false } });
    session.start();
    session.tick(12_340);
    game.board = createJuiceWaterClearBoard();
    game.juiceStock.orange = 1;

    const result = session.useJuice("orange");

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
