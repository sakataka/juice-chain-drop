import { describe, expect, it } from "vitest";
import { DEFAULT_SHIPMENT_INTERVAL_SECONDS, FRUITS, GameModel } from "../core";
import type { Board, Cell, Fruit, GameModeId } from "../core";
import { enumeratePlacements, heuristicAiStrategy } from "./heuristicStrategy";
import { cloneBoard, cloneFruitRecord, clonePair, simulateJuice, simulatePlacement } from "./simulation";
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

  it("uses juice when the board is in immediate danger", () => {
    const game = fixedGame();
    game.start();
    game.board = filledBoard("grape");
    game.board[11][2] = null;
    game.juiceStock.orange = 1;

    const decision = heuristicAiStrategy.choose(createSnapshot(game));

    expect(decision.commands[0]).toEqual({ kind: "useJuice", fruit: "orange" });
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

  it("holds juice near shipment when the board is safe", () => {
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

    const decision = heuristicAiStrategy.choose(
      createSnapshot(game, {
        shipment: { enabled: true, intervalSeconds: 45, remainingMs: 2_000, previewScore: 160 },
      }),
    );

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
    const attack = heuristicAiStrategy.choose(createSnapshot(game, { mode: "scoreAttack", score: 940_000 }));

    expect(attack.score).toBeGreaterThan(normal.score);
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
  });

  it("uses juice aggressively in water cleanup instead of holding it for shipment", () => {
    const game = fixedGame(["apple", "orange"]);
    game.start();
    game.active = { axis: { x: 2, y: 8, fruit: "apple" }, satellite: { fruit: "orange", rotation: 0 } };
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
    game.juiceStock.apple = 1;

    const decision = heuristicAiStrategy.choose(
      createSnapshot(game, {
        mode: "waterCleanup",
        runWaterClears: 25,
        shipment: { enabled: true, intervalSeconds: 45, remainingMs: 2_000, previewScore: 160 },
      }),
    );

    expect(decision.commands[0]).toEqual({ kind: "useJuice", fruit: "apple" });
  });

  it("keeps simulation inputs immutable", () => {
    const game = fixedGame();
    game.start();
    const active = game.active!;
    const boardBefore = cloneBoard(game.board);
    const queueBefore = game.nextQueue.map(clonePair);
    const stockBefore = cloneFruitRecord(game.juiceStock);
    const progressBefore = cloneFruitRecord(game.juiceProgress);
    const candidate = enumeratePlacements(game.board, active, game.difficulty)[0];

    simulatePlacement(
      {
        board: game.board,
        nextQueue: game.nextQueue,
        juiceStock: game.juiceStock,
        juiceProgress: game.juiceProgress,
        featuredFruit: game.featuredFruit,
      },
      candidate,
      game.difficulty,
    );

    expect(game.board).toEqual(boardBefore);
    expect(game.nextQueue).toEqual(queueBefore);
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
        nextQueue: game.nextQueue,
        juiceStock: { apple: 0, orange: 0, lemon: 0, grape: 0, melon: 1, berry: 0 },
        juiceProgress: { apple: 0, orange: 0, lemon: 0, grape: 0, melon: 0, berry: 0 },
        featuredFruit: "apple",
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
        nextQueue: [["orange", "orange"]],
        juiceStock: { apple: 0, orange: 0, lemon: 0, grape: 0, melon: 0, berry: 0 },
        juiceProgress: { apple: 2, orange: 0, lemon: 0, grape: 0, melon: 0, berry: 0 },
        featuredFruit: "apple",
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
  });
});

function createSnapshot(
  game: GameModel,
  overrides: Partial<AiGameSnapshot> & {
    mode?: GameModeId;
    runBestChain?: number;
    runWaterClears?: number;
    targetWaterClears?: number;
  } = {},
): AiGameSnapshot {
  const mode = overrides.mode ?? "normal";
  return {
    board: game.board,
    active: overrides.active ?? game.active,
    nextQueue: overrides.nextQueue ?? game.nextQueue,
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
      remainingMs: mode === "chainChallenge" ? 60_000 : undefined,
      targetScore: mode === "scoreAttack" ? 1_000_000 : undefined,
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
