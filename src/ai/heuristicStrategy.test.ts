import { describe, expect, it } from "vitest";
import { DEFAULT_SHIPMENT_INTERVAL_SECONDS, FRUITS, GameModel } from "../core";
import type { Board, Cell, Fruit, GameModeId } from "../core";
import { getChainPotential } from "./evaluation";
import { enumeratePlacements, heuristicAiStrategy } from "./heuristicStrategy";
import { DEFAULT_AI_POLICY } from "./policy";
import { cloneBoard, cloneFruitRecord, clonePreview, nextActiveFromPreviews, simulateJuice, simulatePlacement } from "./simulation";
import type { AiGameSnapshot } from "./types";

describe("heuristic AI strategy", () => {
  it("returns only legal movement commands for playable boards", () => {
    const game = fixedGame();
    game.start();
    const active = game.active;
    expect(active).not.toBeNull();

    const decision = heuristicAiStrategy.choose(createSnapshot(game, { active }));

    expect(decision.commands.at(-1)).toEqual({ kind: "hardDrop" });
    expect(decision.commands.every((command) => command.kind !== "useJuice")).toBe(true);
    expect(enumeratePlacements(game.board, active!)).not.toHaveLength(0);
  });

  it("prefers a placement that completes an obvious clear", () => {
    const game = fixedGame(["apple", "orange"]);
    game.start();
    game.active = { axis: { x: 2, y: 0, fruit: "apple" }, satellite: { fruit: "orange", rotation: 0 } };
    game.board = boardFromRows([
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "aaa...",
    ]);

    const decision = heuristicAiStrategy.choose(createSnapshot(game));

    expect(decision.reason).toContain("r4");
    expect(decision.commands.at(-1)).toEqual({ kind: "hardDrop" });
  });

  it("forces a terminal drop when no placement exists", () => {
    const game = fixedGame();
    game.start();
    game.board = filledBoard("grape");

    const decision = heuristicAiStrategy.choose(createSnapshot(game));

    expect(decision.commands).toEqual([{ kind: "hardDrop" }]);
    expect(decision.reason).toBe("No legal AI placement");
  });

  it("places Juice Drops without rotation or legacy instant-use commands", () => {
    const game = fixedGame();
    game.start();
    game.active = { kind: "juiceDrop", axis: { x: 2, y: 0, fruit: "apple" }, satellite: { fruit: "apple", rotation: 0 } };
    game.board = boardFromRows([
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "aa....",
      "ooo...",
    ]);

    const decision = heuristicAiStrategy.choose(createSnapshot(game));

    expect(decision.reason).toContain("Juice Drop apple");
    expect(decision.commands.at(-1)).toEqual({ kind: "hardDrop" });
    expect(decision.commands.every((command) => command.kind !== "rotate" && command.kind !== "useJuice")).toBe(true);
    expect(enumeratePlacements(game.board, game.active, game.difficulty)).toHaveLength(6);
  });

  it("uses next queue lookahead to prepare a future clear instead of only taking the current move", () => {
    const game = fixedGame(["orange", "grape", "apple"]);
    game.start();
    game.active = { axis: { x: 2, y: 0, fruit: "orange" }, satellite: { fruit: "grape", rotation: 0 } };
    game.nextQueue = [["apple", "apple"], ["lemon", "berry"], ["melon", "orange"]];
    game.board = boardFromRows([
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "a.....",
      "aa.o..",
    ]);

    const withLookahead = heuristicAiStrategy.choose(createSnapshot(game));
    const immediateBest = enumeratePlacements(game.board, game.active, game.difficulty).sort((a, b) => b.score - a.score)[0];

    expect(withLookahead.reason).toContain("Lookahead d3");
    expect(withLookahead.commands).not.toEqual(immediateBest.commands);
  });

  it("does not spend queued bottles as legacy instant-use juice", () => {
    const game = fixedGame();
    game.start();
    game.juiceStock.apple = 1;
    game.board = boardFromRows([
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      ".oo...",
    ]);

    const decision = heuristicAiStrategy.choose(createSnapshot(game));

    expect(decision.commands[0]?.kind).not.toBe("useJuice");
  });

  it("raises chain setup value in chain challenge", () => {
    const game = fixedGame(["lemon", "grape", "apple"]);
    game.start();
    game.active = { axis: { x: 2, y: 0, fruit: "lemon" }, satellite: { fruit: "grape", rotation: 0 } };
    game.nextQueue = [["apple", "apple"], ["apple", "orange"], ["melon", "berry"]];
    game.board = boardFromRows([
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "aa....",
      "oo.l..",
    ]);

    const normal = heuristicAiStrategy.choose(createSnapshot(game));
    const chain = heuristicAiStrategy.choose(createSnapshot(game, { mode: "chainChallenge", runBestChain: 0 }));

    expect(chain.score).toBeGreaterThan(normal.score);
    expect(chain.reason).toContain("Lookahead");
  });

  it("builds chain potential instead of taking an early one-chain clear", () => {
    const game = fixedGame(["apple", "orange"]);
    game.start();
    game.active = { axis: { x: 2, y: 0, fruit: "apple" }, satellite: { fruit: "orange", rotation: 0 } };
    game.board = boardFromRows([
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "aaa...",
    ]);

    const normal = heuristicAiStrategy.choose(createSnapshot(game));
    const chain = heuristicAiStrategy.choose(createSnapshot(game, { mode: "chainChallenge", runBestChain: 2 }));

    expect(normal.reason).toContain("c1");
    expect(chain.phase).toBe("chainBuild");
    expect(chain.reason).toContain("c0");
    expect(chain.commands).not.toEqual(normal.commands);
    expect(chain.chainPotentialEvaluations).toBeLessThanOrEqual(DEFAULT_AI_POLICY.chainPotentialBudget);
  });

  it("fires an available chain in the final 15 seconds", () => {
    const game = fixedGame(["apple", "orange"]);
    game.start();
    game.active = { axis: { x: 2, y: 0, fruit: "apple" }, satellite: { fruit: "orange", rotation: 0 } };
    game.board = boardFromRows([
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "aaa...",
    ]);

    const decision = heuristicAiStrategy.choose(createSnapshot(game, { mode: "chainChallenge", remainingMs: 10_000 }));

    expect(decision.phase).toBe("chainTrigger");
    expect(decision.reason).toContain("c1");
  });

  it("switches to survival when the board reaches ten rows high", () => {
    const game = fixedGame(["apple", "orange"]);
    game.start();
    game.board = boardFromRows([
      "......",
      "......",
      "a.....",
      "o.....",
      "l.....",
      "g.....",
      "m.....",
      "b.....",
      "a.....",
      "o.....",
      "l.....",
      "g.....",
    ]);

    const decision = heuristicAiStrategy.choose(createSnapshot(game, { mode: "chainChallenge" }));

    expect(decision.phase).toBe("survive");
  });

  it("measures a legal single-fruit trigger that resolves a two-chain setup", () => {
    const game = fixedGame();
    game.start();
    const board = boardFromRows([
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "..o...",
      "..o...",
      "ooa...",
      "aaa...",
    ]);

    expect(getChainPotential(board, game.difficulty)).toMatchObject({ bestTriggerChain: 2 });
  });

  it("turns a visible Juice Drop preview into the next simulated active piece", () => {
    const next = nextActiveFromPreviews([{ kind: "juiceDrop", fruit: "berry" }]);

    expect(next).toMatchObject({ kind: "juiceDrop", axis: { fruit: "berry" } });
  });

  it("raises high-score clear value in score attack", () => {
    const game = fixedGame(["apple", "orange"]);
    game.start();
    game.active = { axis: { x: 2, y: 0, fruit: "apple" }, satellite: { fruit: "orange", rotation: 0 } };
    game.board = boardFromRows([
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "aaa...",
    ]);

    const normal = heuristicAiStrategy.choose(createSnapshot(game));
    const attack = heuristicAiStrategy.choose(createSnapshot(game, { mode: "scoreAttack", score: 49_900 }));

    expect(attack.score).toBeGreaterThan(normal.score);
    expect(attack.phase).toBe("scoreRush");
  });

  it("raises water-clearing value in water cleanup", () => {
    const game = fixedGame(["apple", "orange"]);
    game.start();
    game.active = { axis: { x: 2, y: 0, fruit: "apple" }, satellite: { fruit: "orange", rotation: 0 } };
    game.board = boardFromRows([
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "aaaw..",
    ]);

    const normal = heuristicAiStrategy.choose(createSnapshot(game));
    const cleanup = heuristicAiStrategy.choose(createSnapshot(game, { mode: "waterCleanup", runWaterClears: 0 }));

    expect(cleanup.score).toBeGreaterThan(normal.score);
    expect(cleanup.phase).toBe("waterClear");
  });

  it("aims a Juice Drop normally during water cleanup", () => {
    const game = fixedGame(["apple", "orange"]);
    game.start();
    game.active = { kind: "juiceDrop", axis: { x: 2, y: 0, fruit: "apple" }, satellite: { fruit: "apple", rotation: 0 } };
    game.board = boardFromRows([
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "..w...",
      ".www..",
      "..w...",
      "......",
      "......",
    ]);
    const decision = heuristicAiStrategy.choose(createSnapshot(game, { mode: "waterCleanup", runWaterClears: 25 }));

    expect(decision.reason).toContain("Juice Drop apple");
    expect(decision.commands.at(-1)).toEqual({ kind: "hardDrop" });
    expect(decision.commands.some((command) => command.kind === "useJuice")).toBe(false);
  });

  it("keeps simulation inputs immutable", () => {
    const game = fixedGame();
    game.start();
    const active = game.active!;
    const boardBefore = cloneBoard(game.board);
    const previewsBefore = game.nextPreviews.map(clonePreview);
    const stockBefore = cloneFruitRecord(game.juiceStock);
    const progressBefore = cloneFruitRecord(game.juiceProgress);
    const candidate = enumeratePlacements(game.board, active, game.difficulty)[0];

    simulatePlacement(
      {
        board: game.board,
        nextPreviews: game.nextPreviews,
        juiceStock: game.juiceStock,
        juiceProgress: game.juiceProgress,
        featuredFruit: game.featuredFruit,
        score: game.score,
        bestChain: 0,
        waterClears: 0,
      },
      candidate,
      game.difficulty,
    );

    expect(game.board).toEqual(boardBefore);
    expect(game.nextPreviews).toEqual(previewsBefore);
    expect(game.juiceStock).toEqual(stockBefore);
    expect(game.juiceProgress).toEqual(progressBefore);
  });

  it("scores melon juice like the real game by deferring the piece multiplier", () => {
    const game = fixedGame();
    game.start();
    game.board = boardFromRows([
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "aaaa..",
    ]);
    game.juiceStock.melon = 1;
    const realReport = game.useJuice("melon");

    const simulated = simulateJuice(
      {
        board: boardFromRows([
          "......",
          "......",
          "......",
          "......",
          "......",
          "......",
          "......",
          "......",
          "......",
          "......",
          "......",
          "aaaa..",
        ]),
        nextPreviews: game.nextPreviews,
        juiceStock: { apple: 0, orange: 0, lemon: 0, grape: 0, melon: 1, berry: 0 },
        juiceProgress: { apple: 0, orange: 0, lemon: 0, grape: 0, melon: 0, berry: 0 },
        featuredFruit: "apple",
        score: 0,
        bestChain: 0,
        waterClears: 0,
      },
      game.active,
      "melon",
      game.difficulty,
    );

    expect(realReport).not.toBeNull();
    expect(simulated.clearScore).toBe(game.score);
  });

  it("simulates press progress without a featured-fruit bonus", () => {
    const game = fixedGame();
    game.start();
    const next = simulatePlacement(
      {
        board: boardFromRows([
          "......",
          "......",
          "......",
          "......",
          "......",
          "......",
          "......",
          "......",
          "......",
          "......",
          "......",
          "......",
        ]),
        nextPreviews: [{ kind: "fruitPair", pair: ["orange", "orange"] }],
        juiceStock: { apple: 0, orange: 0, lemon: 0, grape: 0, melon: 0, berry: 0 },
        juiceProgress: { apple: 2, orange: 0, lemon: 0, grape: 0, melon: 0, berry: 0 },
        featuredFruit: "apple",
        score: 0,
        bestChain: 0,
        waterClears: 0,
      },
      {
        commands: [{ kind: "hardDrop" }],
        board: boardFromRows([
          "......",
          "......",
          "......",
          "......",
          "......",
          "......",
          "......",
          "......",
          "......",
          "......",
          "......",
          "......",
        ]),
        score: 400,
        chain: 1,
        removed: 4,
        removedByFruit: { apple: 4, orange: 0, lemon: 0, grape: 0, melon: 0, berry: 0 },
        juiceAwards: [{ apple: 4, orange: 0, lemon: 0, grape: 0, melon: 0, berry: 0 }],
        landingY: 11,
      },
      game.difficulty,
    );

    expect(next.juiceStock.apple).toBe(1);
    expect(next.juiceProgress.apple).toBe(2);
    expect(next.score).toBe(400);
    expect(next.bestChain).toBe(1);
    expect(next.waterClears).toBe(0);
  });
});

function createSnapshot(
  game: GameModel,
  overrides: Partial<AiGameSnapshot> & {
    mode?: GameModeId;
    runBestChain?: number;
    runWaterClears?: number;
    targetWaterClears?: number;
    remainingMs?: number;
  } = {},
): AiGameSnapshot {
  const mode = overrides.mode ?? "normal";
  return {
    board: game.board,
    active: overrides.active ?? game.active,
    nextPreviews: overrides.nextPreviews ?? game.nextPreviews,
    state: overrides.state ?? game.state,
    score: overrides.score ?? game.score,
    lastChain: overrides.lastChain ?? game.lastChain,
    featuredFruit: overrides.featuredFruit ?? game.featuredFruit,
    juiceStock: overrides.juiceStock ?? game.juiceStock,
    juiceProgress: overrides.juiceProgress ?? game.juiceProgress,
    shipment: overrides.shipment ?? {
      enabled: true,
      intervalSeconds: DEFAULT_SHIPMENT_INTERVAL_SECONDS,
      remainingMs: DEFAULT_SHIPMENT_INTERVAL_SECONDS * 1000,
      previewScore: game.getShipmentPreview().score,
    },
    settings: overrides.settings ?? {
      mode,
      difficulty: game.difficulty.id,
      shippingIntervalSeconds: DEFAULT_SHIPMENT_INTERVAL_SECONDS,
    },
    challenge: overrides.challenge ?? {
      mode,
      elapsedMs: 0,
      remainingMs: mode === "chainChallenge" ? (overrides.remainingMs ?? 60_000) : undefined,
      targetScore: mode === "scoreAttack" ? 50_000 : undefined,
      targetWaterClears: overrides.targetWaterClears ?? (mode === "waterCleanup" ? 30 : undefined),
      runBestChain: overrides.runBestChain ?? 0,
      runWaterClears: overrides.runWaterClears ?? 0,
      result: "Active",
    },
  };
}

function fixedGame(sequence: Fruit[] = ["apple", "orange", "lemon", "grape", "melon"]): GameModel {
  let index = 0;
  return new GameModel(() => {
    const fruitIndex = FRUITS.indexOf(sequence[index % sequence.length]);
    index += 1;
    return fruitIndex / FRUITS.length + 0.01;
  });
}

function filledBoard(fruit: Fruit): Board {
  return Array.from({ length: 12 }, () => Array.from({ length: 6 }, () => fruit));
}

function boardFromRows(rows: string[]): Board {
  const map: Record<string, Cell> = {
    ".": null,
    w: "water",
    a: "apple",
    o: "orange",
    l: "lemon",
    g: "grape",
    m: "melon",
    b: "berry",
  };
  return rows.map((row) => [...row].map((cell) => map[cell]));
}
