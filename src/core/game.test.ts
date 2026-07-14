import { describe, expect, it } from "vitest";
import { applyGravity, applyJuiceEffectRules, calculateClearScore, calculateJuiceUseBonus, createBoard, findClearGroups, GameModel, getDifficultyConfig, getPieceCells, getShipmentComboMultiplier, isValidPiece, makePiece, NEXT_QUEUE_SIZE, randomFruit, resolveBoardRules } from "./index";
import type { Board, Cell, Fruit, PairPiece } from "./types";

describe("board rules", () => {
  it("creates a 6 x 12 empty board", () => {
    const board = createBoard();
    expect(board).toHaveLength(12);
    expect(board[0]).toHaveLength(6);
    expect(board.flat().every((cell) => cell === null)).toBe(true);
  });

  it("finds orthogonal groups of four or more only", () => {
    const board = createBoard();
    board[11][0] = "apple";
    board[11][1] = "apple";
    board[10][0] = "apple";
    board[10][1] = "apple";
    board[0][0] = "grape";
    board[1][1] = "grape";
    board[2][2] = "grape";
    board[3][3] = "grape";

    const groups = findClearGroups(board);

    expect(groups).toHaveLength(1);
    expect(groups[0].fruit).toBe("apple");
    expect(groups[0].cells).toHaveLength(4);
  });

  it("does not clear connected water as a fruit group", () => {
    const board = createBoard();
    board[11][0] = "water";
    board[11][1] = "water";
    board[10][0] = "water";
    board[10][1] = "water";

    expect(findClearGroups(board)).toEqual([]);
  });

  it("resolves boards through the same rule entrypoint as the game model", () => {
    const board = boardFromRows([
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
      "w.....",
      "aaaa..",
    ]);
    const game = fixedGame();
    game.state = "playing";
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
      "w.....",
      "aaaa..",
    ]);

    const pure = resolveBoardRules(board, { difficulty: game.difficulty });
    const report = game.resolveBoard("piece");

    expect(report).toEqual({ chain: pure.chain, popEvents: pure.popEvents, waterClears: pure.waterClears, pressedJuices: ["apple"] });
    expect(game.board).toEqual(pure.board);
    expect(game.score).toBe(pure.clearScore);
    expect(game.juiceStock.apple).toBe(1);
  });

  it("applies juice effects through the same rule entrypoint as the game model", () => {
    const board = boardWithCells("orange", [
      [1, 5],
      [2, 5],
      [3, 5],
      [4, 5],
    ]);
    const game = activeJuiceGame("apple");
    game.board = boardWithCells("orange", [
      [1, 5],
      [2, 5],
      [3, 5],
      [4, 5],
    ]);

    const pure = applyJuiceEffectRules(board, { primary: "lemon", center: game.getEffectCenter(), activeAxisFruit: game.active?.axis.fruit });
    const effect = game.applyJuiceEffect("lemon");

    expect(effect).toEqual(pure.effect);
    expect(game.board).toEqual(pure.board);
  });

  it("applies column gravity without mixing columns", () => {
    const board = createBoard();
    board[0][0] = "apple";
    board[4][0] = "orange";
    board[3][2] = "melon";

    applyGravity(board);

    expect(board[11][0]).toBe("orange");
    expect(board[10][0]).toBe("apple");
    expect(board[11][2]).toBe("melon");
    expect(board[9][0]).toBeNull();
  });

  it("drops water with gravity and blocks piece placement", () => {
    const board = createBoard();
    board[0][2] = "water";

    applyGravity(board);

    expect(board[11][2]).toBe("water");
    const piece = { axis: { x: 2, y: 10, fruit: "apple" }, satellite: { fruit: "orange", rotation: 2 } } satisfies PairPiece;
    expect(isValidPiece(board, piece)).toBe(false);
  });

  it("validates pair collisions and hidden top cells", () => {
    const board = createBoard();
    const piece = makePiece(["apple", "orange"]);
    expect(getPieceCells(piece).map(({ fruit }) => fruit)).toEqual(["apple", "orange"]);
    expect(isValidPiece(board, piece)).toBe(true);

    board[0][2] = "grape";
    expect(isValidPiece(board, piece)).toBe(false);

    const hiddenPiece: PairPiece = { axis: { x: 2, y: -1, fruit: "apple" }, satellite: { fruit: "orange", rotation: 0 } };
    expect(isValidPiece(createBoard(), hiddenPiece)).toBe(true);
  });

  it("keeps random fruit generation in range at rng boundaries", () => {
    expect(randomFruit(() => 0)).toBe("apple");
    expect(randomFruit(() => 1)).toBe("berry");
  });
});

describe("game model", () => {
  it("keeps the next queue valid when rng returns the upper boundary", () => {
    const game = new GameModel(() => 1);

    expect(game.nextQueue).toHaveLength(NEXT_QUEUE_SIZE);
    expect(game.nextQueue.flat()).toEqual(Array(NEXT_QUEUE_SIZE * 2).fill("berry"));

    game.start();

    expect(game.active?.axis.fruit).toBe("berry");
    expect(game.active?.satellite.fruit).toBe("berry");
    expect(game.nextQueue.flat()).toEqual(Array(NEXT_QUEUE_SIZE * 2).fill("berry"));
  });

  it("keeps a three-pair next queue and consumes it in order", () => {
    const game = fixedGame(["apple", "orange", "lemon", "grape", "melon"]);
    const firstVisible = game.nextQueue[0];
    const secondVisible = game.nextQueue[1];

    expect(game.nextQueue).toHaveLength(NEXT_QUEUE_SIZE);

    game.start();

    expect(game.active?.axis.fruit).toBe(firstVisible[0]);
    expect(game.active?.satellite.fruit).toBe(firstVisible[1]);
    expect(game.nextQueue).toHaveLength(NEXT_QUEUE_SIZE);
    expect(game.nextQueue[0]).toEqual(secondVisible);

    const report = game.hardDrop();

    expect(report).not.toBeNull();
    expect(game.nextQueue).toHaveLength(NEXT_QUEUE_SIZE);
    expect(game.active?.axis.fruit).toBe(secondVisible[0]);
    expect(game.active?.satellite.fruit).toBe(secondVisible[1]);
  });

  it("starts, moves, rotates, hard-drops, and spawns the next pair", () => {
    const game = fixedGame(["apple", "orange", "lemon", "grape"]);
    game.start();

    expect(game.state).toBe("playing");
    expect(game.active?.axis.fruit).toBe("apple");
    expect(game.tryMove(-1, 0)).toBe(true);
    expect(game.tryRotate()).toBe(true);

    const report = game.hardDrop();
    expect(report).not.toBeNull();
    expect(game.score).toBeGreaterThan(0);
    expect(game.active?.axis.fruit).toBe("lemon");
  });

  it("pauses and blocks gameplay actions until resumed", () => {
    const game = fixedGame();
    game.start();
    const y = game.active?.axis.y;

    expect(game.pause()).toBe(true);
    expect(game.state).toBe("paused");
    expect(game.tryMove(0, 1)).toBe(false);
    expect(game.tryRotate()).toBe(false);
    expect(game.hardDrop()).toBeNull();
    expect(game.active?.axis.y).toBe(y);

    expect(game.resume()).toBe(true);
    expect(game.tryMove(0, 1)).toBe(true);
  });

  it("ends when a piece locks at the visible ceiling", () => {
    const game = fixedGame();
    game.state = "playing";
    game.active = { axis: { x: 2, y: 0, fruit: "apple" }, satellite: { fruit: "orange", rotation: 0 } };

    const report = game.settlePiece();

    expect(report).toBeNull();
    expect(game.state).toBe("gameover");
    expect(game.active).toBeNull();
    expect(game.board[0][2]).toBeNull();
  });

  it("ends when a horizontal piece locks on the visible top row", () => {
    const game = fixedGame();
    game.state = "playing";
    game.active = { axis: { x: 0, y: 0, fruit: "apple" }, satellite: { fruit: "orange", rotation: 1 } };

    const report = game.settlePiece();

    expect(report).toBeNull();
    expect(game.state).toBe("gameover");
    expect(game.active).toBeNull();
    expect(game.board[0][0]).toBeNull();
  });

  it("ends when a new pair cannot spawn into the board", () => {
    const game = fixedGame();
    game.state = "playing";
    game.board[0][2] = "grape";

    game.spawnPiece();

    expect(game.state).toBe("gameover");
    expect(game.active).toBeNull();
  });

  it("resolves clears, awards juice, and tracks score", () => {
    const game = fixedGame();
    game.state = "playing";
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

    const report = game.resolveBoard("piece");

    expect(report.chain).toBe(1);
    expect(report.popEvents[0].fruit).toBe("apple");
    expect(game.juiceStock.apple).toBe(1);
    expect(game.score).toBe(200);
    expect(game.board[11].slice(0, 4)).toEqual([null, null, null, null]);
  });

  it("clears only orthogonally adjacent water when fruit clears", () => {
    const game = fixedGame();
    game.state = "playing";
    game.board = boardFromRows([
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "......",
      "w.....",
      "waa...",
      "waa...",
      "w..w.w",
    ]);

    const report = game.resolveBoard("piece");

    expect(report.chain).toBe(1);
    expect(report.waterClears).toEqual(
      expect.arrayContaining([
        { x: 0, y: 10 },
        { x: 0, y: 11 },
        { x: 3, y: 11 },
      ]),
    );
    expect(report.waterClears).toHaveLength(3);
    expect(game.board[11][0]).toBe("water");
    expect(game.board[11][5]).toBe("water");
    expect(game.score).toBe(200);
    expect(game.juiceStock.apple).toBe(1);
  });

  it("uses the risk-reward chain score table", () => {
    expect(calculateClearScore(4, 1, 1, 1)).toBe(200);
    expect(calculateClearScore(4, 1, 1, 1.25)).toBe(250);
    expect(calculateClearScore(4, 1, 1.5, 1)).toBe(300);
    expect(calculateClearScore(4, 1, 1, 1) + calculateClearScore(4, 2, 1, 1)).toBe(620);
  });

  it("applies difficulty score and juice settings", () => {
    const easy = fixedGame();
    easy.start({ difficulty: "easy" });
    easy.featuredFruit = "orange";
    easy.board = boardFromRows([
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

    easy.resolveBoard("piece");
    expect(easy.juiceStock.apple).toBe(1);

    const hard = fixedGame();
    hard.start({ difficulty: "hard" });
    hard.featuredFruit = "orange";
    hard.board = boardFromRows([
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

    hard.resolveBoard("piece");
    expect(hard.score).toBe(250);
    expect(hard.juiceStock.apple).toBe(0);
    expect(hard.juiceProgress.apple).toBe(4);
    expect(getDifficultyConfig("hard").dropInterval).toBeLessThan(getDifficultyConfig("normal").dropInterval);
  });

  it("does not cap normal juice stock and keeps remainder progress", () => {
    const game = fixedGame();
    game.featuredFruit = "orange";
    game.awardJuice({ apple: 20, orange: 0, lemon: 0, grape: 0, melon: 0, berry: 0 });

    expect(game.juiceStock.apple).toBe(5);
    expect(game.juiceProgress.apple).toBe(0);
  });

  it("uses the active difficulty threshold without capping stock", () => {
    const hard = fixedGame();
    hard.start({ difficulty: "hard" });
    hard.featuredFruit = "orange";
    hard.awardJuice({ apple: 30, orange: 0, lemon: 0, grape: 0, melon: 0, berry: 0 });

    expect(hard.juiceStock.apple).toBe(6);
    expect(hard.juiceProgress.apple).toBe(0);
  });

  it("uses only cleared fruit for press progress regardless of featured state", () => {
    const game = fixedGame();
    game.start();

    game.awardJuice({ apple: 2, orange: 0, lemon: 0, grape: 0, melon: 0, berry: 0 });

    expect(game.featuredFruit).toBe("apple");
    expect(game.juiceProgress.apple).toBe(2);
    expect(game.advanceFeaturedFruit()).toBe("orange");

    game.awardJuice({ apple: 2, orange: 2, lemon: 0, grape: 0, melon: 0, berry: 0 });

    expect(game.juiceStock.apple).toBe(1);
    expect(game.juiceProgress.apple).toBe(0);
    expect(game.juiceProgress.orange).toBe(2);
    expect(game.queuedJuiceDrops).toEqual(["apple"]);
  });

  it("queues a pressed bottle in Next, drops it as a piece, and bursts on landing", () => {
    const game = fixedGame();
    game.start();
    game.awardJuice({ apple: 4, orange: 0, lemon: 0, grape: 0, melon: 0, berry: 0 });

    expect(game.juiceDropsCreated).toBe(1);
    expect(game.nextPreviews[0]).toEqual({ kind: "juiceDrop", fruit: "apple" });

    game.hardDrop();
    expect(game.active?.kind).toBe("juiceDrop");
    expect(game.active?.axis.fruit).toBe("apple");
    expect(game.juiceStock.apple).toBe(0);

    game.board[9][1] = "orange";
    game.board[9][2] = "orange";
    game.board[9][3] = "orange";
    const report = game.hardDrop();

    expect(report?.juiceDrop?.primary).toBe("apple");
    expect(report?.juiceDrop?.effect.cells.length).toBeGreaterThan(0);
    expect(game.active?.kind).toBe("fruitPair");
    expect(game.queuedJuiceDrops).toEqual([]);
  });

  it("uses apple juice as a 3x3 clear around the active axis", () => {
    const game = activeJuiceGame("apple");
    game.board = boardWithCells("orange", [
      [1, 4],
      [2, 4],
      [3, 4],
      [1, 5],
      [2, 5],
      [3, 5],
      [1, 6],
      [2, 6],
      [3, 6],
    ]);
    game.juiceStock.apple = 1;

    const report = game.useJuice("apple");

    expect(report?.effect.cells).toHaveLength(9);
    expect(report?.bonusScore).toBe(72);
    expect(game.score).toBe(72);
    expect(game.juiceStock.apple).toBe(0);
    expect(game.board[5][2]).toBeNull();
  });

  it("uses row, column, and color-shift juices", () => {
    const rowGame = activeJuiceGame("orange");
    rowGame.board = boardWithCells("apple", [
      [0, 5],
      [1, 5],
      [2, 5],
      [3, 5],
      [4, 5],
      [5, 5],
    ]);
    rowGame.juiceStock.orange = 1;
    expect(rowGame.useJuice("orange")?.effect.cells).toHaveLength(6);
    expect(rowGame.board[5].every((cell) => cell === null)).toBe(true);

    const columnGame = activeJuiceGame("grape");
    columnGame.board = boardWithCells("apple", [
      [2, 0],
      [2, 1],
      [2, 2],
      [2, 3],
      [2, 4],
      [2, 5],
      [2, 6],
      [2, 7],
      [2, 8],
      [2, 9],
      [2, 10],
      [2, 11],
    ]);
    columnGame.juiceStock.grape = 1;
    expect(columnGame.useJuice("grape")?.effect.cells).toHaveLength(12);
    expect(columnGame.board.every((row) => row[2] === null)).toBe(true);

    const lemonGame = activeJuiceGame("lemon");
    lemonGame.board = boardWithCells("grape", [
      [0, 0],
      [5, 0],
      [0, 11],
      [5, 11],
      [1, 9],
      [4, 9],
    ]);
    lemonGame.juiceStock.lemon = 1;
    expect(lemonGame.useJuice("lemon")?.effect.cells).toHaveLength(4);
    expect(lemonGame.board.flat().filter((cell) => cell === "lemon")).toHaveLength(4);
  });

  it("clears water inside destructive juice effects without converting water", () => {
    const rowGame = activeJuiceGame("orange");
    rowGame.board = createBoard();
    rowGame.board[5][0] = "water";
    rowGame.board[5][1] = "apple";
    rowGame.juiceStock.orange = 1;

    expect(rowGame.useJuice("orange")?.effect.cells).toEqual(
      expect.arrayContaining([
        { x: 0, y: 5 },
        { x: 1, y: 5 },
      ]),
    );
    expect(rowGame.board[11][0]).toBeNull();

    const lemonGame = activeJuiceGame("lemon");
    lemonGame.board = createBoard();
    lemonGame.board[5][1] = "water";
    lemonGame.board[5][2] = "grape";
    lemonGame.juiceStock.lemon = 1;
    lemonGame.useJuice("lemon");
    expect(lemonGame.board.flat()).toContain("water");
  });

  it("uses melon juice to slow the next turn and multiply piece clear score", () => {
    const game = activeJuiceGame("melon");
    game.juiceStock.melon = 1;

    const report = game.useJuice("melon");

    expect(report?.effect.cells).toHaveLength(0);
    expect(report?.bonusScore).toBe(120);
    expect(game.score).toBe(120);
    expect(game.slowTurns).toBe(1);
    expect(game.nextPieceScoreMultiplier).toBe(1.5);
  });

  it("uses fruit-specific juice use bonus values", () => {
    expect(calculateJuiceUseBonus("orange", 6, 1)).toBe(36);
    expect(calculateJuiceUseBonus("lemon", 4, 1)).toBe(112);
    expect(calculateJuiceUseBonus("berry", 5, 1.25)).toBe(175);
  });

  it("uses berry juice to seed chains by converting nearby fruit to the most common fruit", () => {
    const game = activeJuiceGame("berry");
    game.board = createBoard();
    game.board[5][1] = "apple";
    game.board[5][2] = "apple";
    game.board[5][3] = "apple";
    game.board[4][2] = "orange";
    game.board[6][2] = "grape";
    game.board[5][4] = "lemon";
    game.board[4][3] = "melon";
    game.board[6][3] = "berry";
    game.board[7][2] = "orange";
    game.juiceStock.berry = 1;

    const report = game.useJuice("berry");

    expect(report?.effect.cells).toHaveLength(5);
    expect(report?.resolve.chain).toBeGreaterThanOrEqual(1);
    expect(game.juiceStock.berry).toBe(0);
  });

  it("consumes melon slow turns and piece score multiplier on the next settled pair", () => {
    const game = activeJuiceGame("melon");
    game.juiceStock.melon = 1;
    game.useJuice("melon");

    const report = game.settlePiece();

    expect(report).not.toBeNull();
    expect(game.slowTurns).toBe(0);
    expect(game.nextPieceScoreMultiplier).toBe(1);
    expect(game.state).toBe("playing");
  });

  it("clamps juice effect centers that start outside the visible board", () => {
    const game = activeJuiceGame("apple");
    game.active = { axis: { x: -3, y: -2, fruit: "apple" }, satellite: { fruit: "orange", rotation: 0 } };

    const report = game.applyJuiceEffect("melon");

    expect(report.center).toEqual({ x: 0, y: 0 });
  });

  it("keeps piece score multipliers for juice resolves and consumes them on piece resolves", () => {
    const game = fixedGame();
    game.state = "playing";
    game.nextPieceScoreMultiplier = 2;
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

    game.resolveBoard("juice");

    expect(game.score).toBe(200);
    expect(game.nextPieceScoreMultiplier).toBe(2);

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

    game.resolveBoard("piece");

    expect(game.score).toBe(600);
    expect(game.nextPieceScoreMultiplier).toBe(1);
  });

  it("scores and reports simultaneous clear groups without merging fruit types", () => {
    const game = fixedGame();
    game.state = "playing";
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
      "aaaaoo",
    ]);
    game.board[10][4] = "orange";
    game.board[10][5] = "orange";

    const report = game.resolveBoard("piece");

    expect(report.chain).toBe(1);
    expect(report.popEvents).toHaveLength(1);
    expect(report.popEvents[0].cells).toHaveLength(8);
    expect(game.score).toBe(400);
    expect(game.juiceStock.apple).toBe(1);
    expect(game.juiceStock.orange).toBe(1);
  });

  it("ships completed juice stock for quadratic score and preserves juice progress", () => {
    const game = fixedGame();
    game.start({ difficulty: "hard" });
    game.juiceStock.apple = 2;
    game.juiceStock.orange = 1;
    game.juiceProgress.apple = 4;

    const report = game.shipJuices();

    expect(report).toMatchObject({ score: 1800, baseScore: 1800, orderBonusScore: 0, totalStock: 3, streak: 1, multiplier: 1, orderCompleted: null });
    expect(game.score).toBe(1800);
    expect(game.juiceStock).toEqual({ apple: 0, orange: 0, lemon: 0, grape: 0, melon: 0, berry: 0 });
    expect(game.juiceProgress.apple).toBe(4);
  });

  it("adds a capped shipment combo multiplier across successful shipments", () => {
    const game = fixedGame();
    game.start();
    game.juiceStock.apple = 1;

    expect(game.shipJuices()).toMatchObject({ score: 160, baseScore: 160, streak: 1, multiplier: 1 });

    game.juiceStock.orange = 1;
    expect(game.getShipmentPreview()).toMatchObject({ score: 200, baseScore: 160, streak: 2, multiplier: 1.25 });
    expect(game.shipJuices()).toMatchObject({ score: 200, baseScore: 160, streak: 2, multiplier: 1.25 });

    game.juiceStock.lemon = 1;
    expect(game.shipJuices()).toMatchObject({ score: 240, baseScore: 160, streak: 3, multiplier: 1.5 });
    expect(game.score).toBe(600);
    expect(getShipmentComboMultiplier(99)).toBe(2);
  });

  it("completes juice orders during shipment and advances to the next order", () => {
    const game = fixedGame();
    game.start();
    expect(game.currentOrder.id).toBe("citrus-line");
    game.juiceStock.lemon = 2;
    game.juiceStock.grape = 1;

    const report = game.shipJuices();

    expect(report).toMatchObject({ baseScore: 1440, orderBonusScore: 880, score: 2320, totalStock: 3 });
    expect(report?.orderCompleted?.id).toBe("citrus-line");
    expect(game.completedOrders).toBe(1);
    expect(game.currentOrder.id).toBe("orchard-box");
  });

  it("does not ship when no completed juice stock exists", () => {
    const game = fixedGame();

    expect(game.shipJuices()).toBeNull();
    expect(game.score).toBe(0);
    expect(game.shipmentStreak).toBe(0);
  });
});

function fixedGame(sequence: Fruit[] = ["apple", "orange", "lemon", "grape", "melon", "berry"]): GameModel {
  let index = 0;
  return new GameModel(() => {
    const fruitIndex = ["apple", "orange", "lemon", "grape", "melon", "berry"].indexOf(sequence[index % sequence.length]);
    index += 1;
    return fruitIndex / 6 + 0.01;
  });
}

function activeJuiceGame(axis: Fruit): GameModel {
  const game = fixedGame();
  game.state = "playing";
  game.active = { axis: { x: 2, y: 5, fruit: axis }, satellite: { fruit: "orange", rotation: 0 } };
  return game;
}

function boardWithCells(fruit: Fruit, cells: Array<[number, number]>): Board {
  const board = createBoard();
  for (const [x, y] of cells) {
    board[y][x] = fruit;
  }
  return board;
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
