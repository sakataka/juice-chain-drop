import { Container, Graphics, Sprite, TilingSprite } from "pixi.js";
import { BOARD_X, BOARD_Y, CELL, COLS, HEIGHT, getPieceCells, isFruitCell, isValidPiece, isWaterCell, movedPiece, ROWS, WIDTH } from "../core";
import type { Board, Cell, FallMove, GameState, NextPiecePreview, PairPiece } from "../core";
import {
  addFruitSprite,
  addJuiceSprite,
  EFFECT_BRASS,
  EFFECT_CORAL,
  EFFECT_CREAM,
  EFFECT_INK,
  EFFECT_MINT,
  EFFECT_ORANGE,
  FRUIT_DRAW_SCALE,
  LAB_DARK,
  LAB_GRID_A,
  LAB_GRID_B,
  LAB_PANEL,
  replaceLayer,
  TRAY_WOOD,
} from "./pixiRenderHelpers";
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

/** One reusable board cell: sprites are kept and retextured instead of rebuilt on every render. */
type CellSlot = {
  root: Container;
  fruit: Sprite;
  shadow: Graphics;
  water: Sprite;
  waterGlow: Graphics;
  cell: Cell;
  /** Pixel offset the cell is falling from, animated back to zero. */
  fall: { fromOffset: number; start: number; duration: number } | null;
  bounceStart: number | null;
};

const LANDING_BOUNCE_MS = 280;
const FALL_BASE_MS = 120;
const FALL_PER_ROW_MS = 26;
const FRUIT_INSET = 4;
const FRUIT_SIZE = CELL - FRUIT_INSET * 2;
const FRUIT_VISUAL = FRUIT_SIZE * FRUIT_DRAW_SCALE;
const FRUIT_OFFSET = FRUIT_INSET + (FRUIT_SIZE - FRUIT_VISUAL) / 2;

export class BoardRenderer {
  private readonly slots: CellSlot[][] = [];
  private readonly cellLayer = new Container();
  private previousBoard: Board | null = null;
  private lastPresentationStep = -1;
  private lastNextKey = "";
  private animating = false;

  constructor(private readonly options: BoardRendererOptions) {}

  /** Builds the static board art and the cell pool once textures are loaded. */
  init(): void {
    this.drawBackground();
    const { board } = this.options.layers;
    board.addChild(createBoardPanel(), this.cellLayer);
    for (let y = 0; y < ROWS; y += 1) {
      const row: CellSlot[] = [];
      for (let x = 0; x < COLS; x += 1) {
        row.push(this.createSlot(x, y));
      }
      this.slots.push(row);
    }
  }

  clearMotion(): void {
    this.previousBoard = null;
    for (const row of this.slots) {
      for (const slot of row) {
        slot.fall = null;
        slot.bounceStart = null;
        this.applySlotMotion(slot, 0, 0);
      }
    }
    this.animating = false;
  }

  animate(now: number): void {
    if (!this.animating) return;
    let active = false;
    for (const row of this.slots) {
      for (const slot of row) {
        if (!slot.fall && slot.bounceStart === null) continue;
        let offset = 0;
        if (slot.fall) {
          const t = Math.min(1, (now - slot.fall.start) / slot.fall.duration);
          offset = slot.fall.fromOffset * (1 - t * t);
          if (t >= 1) {
            slot.fall = null;
            slot.bounceStart = now;
          }
        }
        let squash = 0;
        if (slot.bounceStart !== null) {
          const t = Math.min(1, (now - slot.bounceStart) / LANDING_BOUNCE_MS);
          squash = Math.sin(t * Math.PI * 3) * Math.pow(1 - t, 2) * 0.22;
          if (t >= 1) slot.bounceStart = null;
        }
        this.applySlotMotion(slot, offset, squash);
        active ||= slot.fall !== null || slot.bounceStart !== null;
      }
    }
    this.animating = active;
  }

  drawBoard(board: Board, motion: boolean, falls: FallMove[], presentationStep: number): void {
    const now = performance.now();
    const newStep = presentationStep !== this.lastPresentationStep;
    this.lastPresentationStep = presentationStep;
    const fallen = new Map<string, FallMove>();
    if (newStep) for (const fall of falls) fallen.set(`${fall.x},${fall.toY}`, fall);

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const slot = this.slots[y][x];
        const cell = board[y][x];
        const changed = slot.cell !== cell;
        if (changed) this.setSlotCell(slot, cell);
        if (!motion || cell === null) {
          if (slot.fall || slot.bounceStart !== null) {
            slot.fall = null;
            slot.bounceStart = null;
            this.applySlotMotion(slot, 0, 0);
          }
          continue;
        }
        const fall = fallen.get(`${x},${y}`);
        if (fall) {
          const rows = fall.toY - fall.fromY;
          slot.fall = { fromOffset: -rows * CELL, start: now, duration: FALL_BASE_MS + rows * FALL_PER_ROW_MS };
          slot.bounceStart = null;
          this.animating = true;
        } else if (changed && this.previousBoard && isFruitCell(cell)) {
          slot.fall = null;
          slot.bounceStart = now;
          this.animating = true;
        }
      }
    }
    this.previousBoard = board;
    this.animate(now);
  }

  drawGhost(board: Board, active: PairPiece | null, state: GameState): void {
    const { ghost: ghostLayer } = this.options.layers;
    replaceLayer(ghostLayer, () => {
      if (!active || state !== "playing") return;
      let ghost = active;
      while (isValidPiece(board, movedPiece(ghost, 0, 1))) {
        ghost = movedPiece(ghost, 0, 1);
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
    const key = nextQueue.map((preview) => (preview.kind === "juiceDrop" ? `j:${preview.fruit}` : `p:${preview.pair.join(",")}`)).join("|");
    if (key === this.lastNextKey) return;
    this.lastNextKey = key;
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

  private drawBackground(): void {
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

  private createSlot(x: number, y: number): CellSlot {
    const root = new Container();
    root.x = BOARD_X + x * CELL;
    root.y = BOARD_Y + y * CELL;
    const shadow = new Graphics();
    shadow.ellipse(FRUIT_INSET + FRUIT_SIZE / 2, FRUIT_INSET + FRUIT_SIZE * 0.84, FRUIT_VISUAL * 0.34, FRUIT_VISUAL * 0.1).fill({ color: 0x000000, alpha: 0.22 });
    const fruit = new Sprite();
    fruit.x = FRUIT_OFFSET;
    fruit.y = FRUIT_OFFSET;
    const waterGlow = new Graphics();
    waterGlow.roundRect(4, 4, CELL - 8, CELL - 8, 12).fill({ color: 0x65ddff, alpha: 0.18 });
    const water = new Sprite(this.options.textures.water ?? undefined);
    water.x = 6;
    water.y = 6;
    water.width = CELL - 12;
    water.height = CELL - 12;
    root.addChild(shadow, fruit, waterGlow, water);
    this.cellLayer.addChild(root);
    const slot: CellSlot = { root, fruit, shadow, water, waterGlow, cell: null, fall: null, bounceStart: null };
    this.setSlotCell(slot, null);
    return slot;
  }

  private setSlotCell(slot: CellSlot, cell: Cell): void {
    slot.cell = cell;
    const fruitTexture = isFruitCell(cell) ? this.options.textures.fruit.get(cell) : undefined;
    slot.fruit.visible = slot.shadow.visible = fruitTexture !== undefined;
    if (fruitTexture) {
      slot.fruit.texture = fruitTexture;
      slot.fruit.width = FRUIT_VISUAL;
      slot.fruit.height = FRUIT_VISUAL;
    }
    slot.water.visible = slot.waterGlow.visible = isWaterCell(cell);
    slot.root.visible = cell !== null;
  }

  private applySlotMotion(slot: CellSlot, offset: number, squash: number): void {
    slot.root.pivot.y = -offset;
    const width = FRUIT_VISUAL * (1 + squash);
    const height = FRUIT_VISUAL * (1 - squash);
    slot.fruit.width = width;
    slot.fruit.height = height;
    slot.fruit.x = FRUIT_OFFSET - (width - FRUIT_VISUAL) / 2;
    slot.fruit.y = FRUIT_OFFSET + FRUIT_VISUAL - height;
  }
}

/** Static tray, felt, and grid behind the cells. Drawn once; nothing here depends on game state. */
function createBoardPanel(): Graphics {
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
  return panel;
}
