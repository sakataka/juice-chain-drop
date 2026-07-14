import { Container, Graphics, TilingSprite } from "pixi.js";
import { BOARD_X, BOARD_Y, CELL, COLS, HEIGHT, getPieceCells, isFruitCell, isValidPiece, isWaterCell, movedPiece, ROWS, WIDTH } from "../core";
import type { Board, GameState, NextPiecePreview, PairPiece } from "../core";
import { addFruitSprite, addJuiceSprite, drawWaterCell, EFFECT_BRASS, EFFECT_CORAL, EFFECT_CREAM, EFFECT_INK, EFFECT_MINT, EFFECT_ORANGE, LAB_DARK, LAB_GRID_A, LAB_GRID_B, LAB_PANEL, replaceLayer, TRAY_WOOD } from "./pixiRenderHelpers";
import type { PixiRenderTextures } from "./renderTypes";

type BoardRenderLayers = {
  background: Container;
  board: Container;
  ghost: Container;
  active: Container;
  next: Container;
};

type BoardRendererOptions = {
  layers: BoardRenderLayers;
  textures: PixiRenderTextures;
};

export class BoardRenderer {
  constructor(private readonly options: BoardRendererOptions) {}

  drawBackground(): void {
    const { background } = this.options.layers;
    replaceLayer(background, () => {
      const base = new Graphics();
      base.rect(0, 0, WIDTH, HEIGHT).fill(LAB_DARK);
      base.rect(0, HEIGHT * 0.52, WIDTH, HEIGHT * 0.48).fill({ color: 0x2a1810, alpha: 0.48 });
      base.circle(44, 96, 82).fill({ color: EFFECT_BRASS, alpha: 0.08 });
      base.circle(WIDTH - 38, 168, 118).fill({ color: EFFECT_ORANGE, alpha: 0.08 });
      base.circle(WIDTH - 72, HEIGHT - 96, 92).fill({ color: EFFECT_CORAL, alpha: 0.08 });
      background.addChild(base);

      if (this.options.textures.counterWood) {
        const counter = new TilingSprite({ texture: this.options.textures.counterWood, width: WIDTH, height: 104 });
        counter.x = 0;
        counter.y = HEIGHT - 104;
        counter.alpha = 0.72;
        background.addChild(counter);
      }

      if (this.options.textures.boardFrame) {
        const frame = new TilingSprite({ texture: this.options.textures.boardFrame, width: COLS * CELL + 44, height: ROWS * CELL + 44 });
        frame.x = BOARD_X - 22;
        frame.y = BOARD_Y - 22;
        frame.tileScale.set(0.54);
        frame.alpha = 0.84;
        background.addChild(frame);
      }

      const garnish = new Graphics();
      garnish.roundRect(BOARD_X - 21, BOARD_Y - 21, COLS * CELL + 42, ROWS * CELL + 42, 18).fill({ color: EFFECT_INK, alpha: 0.74 });
      garnish
        .roundRect(BOARD_X - 14, BOARD_Y - 14, COLS * CELL + 28, ROWS * CELL + 28, 14)
        .stroke({ color: EFFECT_BRASS, alpha: 0.72, width: 3 });
      garnish
        .roundRect(BOARD_X - 8, BOARD_Y - 8, COLS * CELL + 16, ROWS * CELL + 16, 12)
        .stroke({ color: EFFECT_ORANGE, alpha: 0.3, width: 2 });
      garnish.roundRect(22, 42, WIDTH - 44, 58, 12).fill({ color: 0xffffff, alpha: 0.06 });
      garnish.roundRect(36, HEIGHT - 42, WIDTH - 72, 10, 5).fill({ color: EFFECT_BRASS, alpha: 0.48 });
      garnish.roundRect(52, HEIGHT - 39, WIDTH - 104, 4, 2).fill({ color: EFFECT_CREAM, alpha: 0.34 });
      background.addChild(garnish);
    });
  }

  drawBoard(board: Board): void {
    const { board: boardLayer } = this.options.layers;
    replaceLayer(boardLayer, () => {
      const panel = new Graphics();
      panel.roundRect(BOARD_X - 9, BOARD_Y - 9, COLS * CELL + 18, ROWS * CELL + 18, 13).fill({ color: EFFECT_INK, alpha: 0.86 });
      panel.roundRect(BOARD_X - 14, BOARD_Y - 2, 9, ROWS * CELL + 4, 5).fill({ color: TRAY_WOOD, alpha: 0.9 });
      panel.roundRect(BOARD_X + COLS * CELL + 5, BOARD_Y - 2, 9, ROWS * CELL + 4, 5).fill({ color: TRAY_WOOD, alpha: 0.9 });
      panel.roundRect(BOARD_X - 5, BOARD_Y - 16, COLS * CELL + 10, 9, 5).fill({ color: TRAY_WOOD, alpha: 0.72 });
      panel.roundRect(BOARD_X - 5, BOARD_Y + ROWS * CELL + 7, COLS * CELL + 10, 9, 5).fill({ color: TRAY_WOOD, alpha: 0.72 });
      panel.roundRect(BOARD_X - 3, BOARD_Y - 3, COLS * CELL + 6, ROWS * CELL + 6, 10).stroke({ color: EFFECT_BRASS, width: 2, alpha: 0.62 });
      panel.roundRect(BOARD_X, BOARD_Y, COLS * CELL, ROWS * CELL, 10).fill(LAB_PANEL);
      for (let y = 0; y < ROWS; y += 1) {
        for (let x = 0; x < COLS; x += 1) {
          panel.rect(BOARD_X + x * CELL + 1, BOARD_Y + y * CELL + 1, CELL - 2, CELL - 2).fill((x + y) % 2 === 0 ? LAB_GRID_A : LAB_GRID_B);
        }
      }
      panel.rect(BOARD_X, BOARD_Y, COLS * CELL, ROWS * CELL).stroke({ color: EFFECT_BRASS, width: 2, alpha: 0.44 });
      panel
        .moveTo(BOARD_X + 10, BOARD_Y + 8)
        .lineTo(BOARD_X + COLS * CELL - 10, BOARD_Y + 8)
        .stroke({ color: 0xffffff, width: 2, alpha: 0.18 });
      for (let y = 1; y < ROWS; y += 1) {
        panel
          .moveTo(BOARD_X, BOARD_Y + y * CELL)
          .lineTo(BOARD_X + COLS * CELL, BOARD_Y + y * CELL)
          .stroke({ color: EFFECT_BRASS, width: 1, alpha: 0.14 });
      }
      for (let x = 1; x < COLS; x += 1) {
        panel
          .moveTo(BOARD_X + x * CELL, BOARD_Y)
          .lineTo(BOARD_X + x * CELL, BOARD_Y + ROWS * CELL)
          .stroke({ color: EFFECT_BRASS, width: 1, alpha: 0.14 });
      }
      boardLayer.addChild(panel);

      for (let y = 0; y < ROWS; y += 1) {
        for (let x = 0; x < COLS; x += 1) {
          const cell = board[y][x];
          if (isFruitCell(cell)) {
            addFruitSprite(this.options.textures, boardLayer, cell, BOARD_X + x * CELL + 4, BOARD_Y + y * CELL + 4, CELL - 8, 1);
          } else if (isWaterCell(cell)) {
            drawWaterCell(this.options.textures, boardLayer, x, y, 1);
          }
        }
      }
    });
  }

  drawGhost(board: Board, active: PairPiece | null, state: GameState): void {
    const { ghost: ghostLayer } = this.options.layers;
    replaceLayer(ghostLayer, () => {
      if (!active || state !== "playing") return;
      const ghostBoard = board.map((row) => [...row]);
      const ghost = structuredClone(active);
      while (isValidPiece(ghostBoard, movedPiece(ghost, 0, 1))) {
        ghost.axis.y += 1;
      }
      if (ghost.kind === "juiceDrop") {
        addJuiceSprite(this.options.textures, ghostLayer, ghost.axis.fruit, BOARD_X + ghost.axis.x * CELL + 5, BOARD_Y + ghost.axis.y * CELL + 5, CELL - 10, 0.28);
        return;
      }
      for (const cell of getPieceCells(ghost)) {
        if (cell.y < 0) continue;
        addFruitSprite(this.options.textures, ghostLayer, cell.fruit, BOARD_X + cell.x * CELL + 6, BOARD_Y + cell.y * CELL + 6, CELL - 12, 0.22);
      }
    });
  }

  drawActivePiece(active: PairPiece | null): void {
    const { active: activeLayer } = this.options.layers;
    replaceLayer(activeLayer, () => {
      if (!active) return;
      if (active.kind === "juiceDrop") {
        const left = BOARD_X + active.axis.x * CELL + 1;
        const top = BOARD_Y + active.axis.y * CELL + 1;
        const halo = new Graphics();
        halo.circle(left + CELL / 2, top + CELL / 2, CELL * 0.48).fill({ color: EFFECT_MINT, alpha: 0.18 });
        halo.circle(left + CELL / 2, top + CELL / 2, CELL * 0.42).stroke({ color: EFFECT_CREAM, width: 2, alpha: 0.62 });
        activeLayer.addChild(halo);
        addJuiceSprite(this.options.textures, activeLayer, active.axis.fruit, left + 2, top + 2, CELL - 4, 1);
        return;
      }
      for (const cell of getPieceCells(active)) {
        if (cell.y < 0) continue;
        addFruitSprite(this.options.textures, activeLayer, cell.fruit, BOARD_X + cell.x * CELL + 7, BOARD_Y + cell.y * CELL + 8, CELL - 8, 0.18, 0x2a2619);
        addFruitSprite(this.options.textures, activeLayer, cell.fruit, BOARD_X + cell.x * CELL + 3, BOARD_Y + cell.y * CELL + 3, CELL - 6, 1);
      }
    });
  }

  drawNextQueue(nextQueue: NextPiecePreview[]): void {
    const { next: nextLayer } = this.options.layers;
    replaceLayer(nextLayer, () => {
      const panelWidth = 88;
      const panelGap = 10;
      const startX = 8;
      for (let index = 0; index < nextQueue.length; index += 1) {
        const preview = nextQueue[index];
        const x = startX + index * (panelWidth + panelGap);
        const isNext = index === 0;
        const panel = new Graphics();
        panel.roundRect(x, 8, panelWidth, 64, 9).fill(isNext ? 0x4a2d12 : 0x33200e);
        panel.roundRect(x + 4, 13, panelWidth - 8, 54, 7).fill(isNext ? 0x271505 : 0x21120a);
        panel.roundRect(x + 0.5, 8.5, panelWidth - 1, 63, 9).stroke({ color: isNext ? EFFECT_ORANGE : EFFECT_BRASS, width: isNext ? 2 : 1, alpha: isNext ? 0.92 : 0.46 });
        if (isNext) {
          panel.roundRect(x + 7, 16, panelWidth - 14, 4, 2).fill({ color: EFFECT_CREAM, alpha: 0.3 });
        }
        nextLayer.addChild(panel);

        const alpha = isNext ? 1 : 0.86;
        if (preview.kind === "juiceDrop") {
          const juiceGlow = new Graphics();
          juiceGlow.circle(x + panelWidth / 2, 40, 28).fill({ color: EFFECT_MINT, alpha: isNext ? 0.2 : 0.1 });
          nextLayer.addChild(juiceGlow);
          addJuiceSprite(this.options.textures, nextLayer, preview.fruit, x + 17, 10, 54, alpha);
          continue;
        }
        const size = 29;
        const fruitX = x + 29.5;
        addFruitSprite(this.options.textures, nextLayer, preview.pair[1], fruitX, 13, size, alpha);
        addFruitSprite(this.options.textures, nextLayer, preview.pair[0], fruitX, 42, size, alpha);
      }
    });
  }
}
