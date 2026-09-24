import { Container, Graphics, Sprite } from "pixi.js";
import type { Text, Texture } from "pixi.js";
import { BOARD_X, BOARD_Y, CELL, COLS, FRUIT_COLORS, ROWS, WIDTH, HEIGHT } from "../core";
import type { Fruit, GridPosition, JuiceEffectResult, ProgressionStage } from "../core";
import {
  clamp01,
  createParticles,
  createTextSprite,
  drawSparkle,
  easeOut,
  EFFECT_CREAM,
  EFFECT_MINT,
  EFFECT_ORANGE,
  gridToCanvas,
  hexToNumber,
  FRUIT_DRAW_SCALE,
} from "./pixiRenderHelpers";
import type { Particle, PixiRenderTextures, VisualEffect } from "./renderTypes";

type VisualEffectsRendererOptions = {
  layer: Container;
  textures: PixiRenderTextures;
};

type VisualEffectHandlers = {
  [Kind in VisualEffect["kind"]]: (effect: Extract<VisualEffect, { kind: Kind }>, elapsed: number, progress: number) => void;
};

export class VisualEffectsRenderer {
  private readonly effects: VisualEffect[] = [];
  private readonly drawHandlers: VisualEffectHandlers = {
    juiceSplash: (effect, elapsed, progress) => this.drawJuiceSplashEffect(effect, elapsed, progress),
    clearPop: (effect, elapsed, progress) => this.drawClearPopEffect(effect, elapsed, progress),
    stageAdvance: (effect, elapsed, progress) => this.drawStageAdvanceEffect(effect, elapsed, progress),
    waterDrop: (effect, elapsed, progress) => this.drawWaterDropEffect(effect, elapsed, progress),
    waterClear: (effect, elapsed, progress) => this.drawWaterClearEffect(effect, elapsed, progress),
  };

  /** One shared vector layer redrawn per frame, with sprites and labels reused across frames. */
  private readonly graphics = new Graphics();
  private readonly spriteLayer = new Container();
  private readonly labelLayer = new Container();
  private readonly spritePool: Sprite[] = [];
  private spriteCursor = 0;
  private readonly labels = new Map<VisualEffect, Map<string, Text>>();
  private idle = true;

  constructor(private readonly options: VisualEffectsRendererOptions) {
    options.layer.addChild(this.graphics, this.spriteLayer, this.labelLayer);
  }

  clear(): void {
    this.effects.length = 0;
    for (const effect of [...this.labels.keys()]) this.releaseLabels(effect);
    this.graphics.clear();
    this.hideUnusedSprites(0);
    this.idle = true;
  }

  spawnJuiceSplash(effect: JuiceEffectResult, primary: Fruit): void {
    const colors = [hexToNumber(FRUIT_COLORS[primary])];
    const centerPoint = gridToCanvas(effect.center);
    const cells = effect.cells.length > 0 ? effect.cells : fallbackJuiceEffectCells(effect.center);
    const intensity = primary === "melon" ? 1.72 : 1.5;
    const particleCount = 34 + Math.min(26, cells.length * 3);
    this.effects.push({
      kind: "juiceSplash",
      start: performance.now(),
      duration: 860,
      center: effect.center,
      cells,
      colors,
      particles: createParticles(centerPoint.x, centerPoint.y, [EFFECT_CREAM, EFFECT_MINT, ...colors], particleCount, 1.58),
      strong: cells.length >= 6 || primary === "melon",
      intensity,
    });
  }

  spawnClearPop(cells: GridPosition[], fruit: Fruit, chain: number): void {
    if (cells.length === 0) return;
    const intensity = getChainIntensity(chain);
    const sampleCells = cells.slice(0, Math.round(16 + intensity * 8));
    const color = hexToNumber(FRUIT_COLORS[fruit]);
    const now = performance.now();
    let showsBanner = true;
    for (const existing of this.effects) {
      if (existing.kind !== "clearPop") continue;
      if (existing.chain === chain && now - existing.start < 60) showsBanner = false;
      else existing.showsBanner = false;
    }
    this.effects.push({
      kind: "clearPop",
      fruit,
      showsBanner,
      start: now,
      duration: 540 + intensity * 150,
      cells: sampleCells,
      color,
      chain,
      intensity,
      particles: sampleCells.flatMap((cell) => {
        const point = gridToCanvas(cell);
        return createParticles(point.x, point.y, [EFFECT_CREAM, EFFECT_ORANGE, color], Math.round(3 + intensity * 2.8), 0.82 + intensity * 0.38);
      }),
    });
  }

  spawnStageAdvance(stage: ProgressionStage): void {
    const boardCenterX = BOARD_X + (COLS * CELL) / 2;
    const boardCenterY = BOARD_Y + (ROWS * CELL) / 2;
    this.effects.push({
      kind: "stageAdvance",
      start: performance.now(),
      duration: 900,
      stage,
      particles: createParticles(boardCenterX, boardCenterY, [EFFECT_CREAM, EFFECT_MINT, EFFECT_ORANGE], 42 + stage * 8, 1.08 + stage * 0.16, 150),
    });
  }

  spawnWaterDrop(cell: GridPosition): void {
    const point = gridToCanvas(cell);
    this.effects.push({
      kind: "waterDrop",
      start: performance.now(),
      duration: 620,
      cells: [cell],
      particles: createParticles(point.x, point.y, [0x6fd6ff, EFFECT_CREAM], 14, 0.64, 80),
    });
  }

  spawnWaterClear(cells: GridPosition[]): void {
    if (cells.length === 0) return;
    this.effects.push({
      kind: "waterClear",
      start: performance.now(),
      duration: 560,
      cells,
      particles: cells.flatMap((cell) => {
        const point = gridToCanvas(cell);
        return createParticles(point.x, point.y, [0x7ddcff, EFFECT_CREAM], 6, 0.82, 90);
      }),
    });
  }

  draw(now: number): void {
    if (this.effects.length === 0) {
      if (!this.idle) this.clear();
      return;
    }
    this.idle = false;
    this.graphics.clear();
    this.spriteCursor = 0;
    for (const labels of this.labels.values()) for (const label of labels.values()) label.visible = false;
    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index];
      const elapsed = now - effect.start;
      if (elapsed >= effect.duration) {
        this.effects.splice(index, 1);
        this.releaseLabels(effect);
        continue;
      }
      const progress = clamp01(elapsed / effect.duration);
      this.drawVisualEffect(effect, elapsed, progress);
    }
    this.hideUnusedSprites(this.spriteCursor);
  }

  private takeSprite(texture: Texture, alpha: number): Sprite {
    let sprite = this.spritePool[this.spriteCursor];
    if (!sprite) {
      sprite = new Sprite();
      this.spritePool.push(sprite);
      this.spriteLayer.addChild(sprite);
    }
    this.spriteCursor += 1;
    sprite.texture = texture;
    sprite.visible = true;
    sprite.alpha = alpha;
    sprite.rotation = 0;
    sprite.anchor.set(0);
    return sprite;
  }

  private hideUnusedSprites(from: number): void {
    for (let index = from; index < this.spritePool.length; index += 1) this.spritePool[index].visible = false;
  }

  private effectSprite(index: number, x: number, y: number, size: number, alpha: number, rotationDegrees = 0): void {
    const texture = this.options.textures.effects[index];
    if (!texture || alpha <= 0) return;
    const sprite = this.takeSprite(texture, alpha);
    sprite.anchor.set(0.5);
    sprite.x = x;
    sprite.y = y;
    sprite.width = size;
    sprite.height = size;
    sprite.rotation = (rotationDegrees * Math.PI) / 180;
  }

  private splashSprite(x: number, y: number, width: number, alpha: number, scaleY = 1): void {
    const texture = this.options.textures.splash;
    if (!texture || alpha <= 0) return;
    const sprite = this.takeSprite(texture, alpha);
    sprite.anchor.set(0.5, 0.82);
    sprite.x = x;
    sprite.y = y;
    sprite.width = width;
    sprite.height = width * 0.62 * scaleY;
  }

  private fruitSprite(fruit: Fruit, x: number, y: number, size: number, alpha: number): Sprite | undefined {
    const texture = this.options.textures.fruit.get(fruit);
    if (!texture) return;
    const sprite = this.takeSprite(texture, alpha);
    const visualSize = size * FRUIT_DRAW_SCALE;
    const inset = (size - visualSize) / 2;
    sprite.x = x + inset;
    sprite.y = y + inset;
    sprite.width = visualSize;
    sprite.height = visualSize;
    return sprite;
  }

  /** Text is rasterized once per effect and then only moved, instead of rebuilt every frame. */
  private label(effect: VisualEffect, key: string, text: string, color: number, size: number): Text {
    let labels = this.labels.get(effect);
    if (!labels) {
      labels = new Map();
      this.labels.set(effect, labels);
    }
    let label = labels.get(key);
    if (!label) {
      label = createTextSprite(text, color, size);
      label.anchor.set(0.5);
      labels.set(key, label);
      this.labelLayer.addChild(label);
    }
    label.visible = true;
    return label;
  }

  private releaseLabels(effect: VisualEffect): void {
    const labels = this.labels.get(effect);
    if (!labels) return;
    for (const label of labels.values()) label.destroy();
    this.labels.delete(effect);
  }

  private drawVisualEffect(effect: VisualEffect, elapsed: number, progress: number): void {
    const handler = this.drawHandlers[effect.kind];
    if (!handler) return assertNever(effect as never);
    handler(effect as never, elapsed, progress);
  }

  private drawJuiceSplashEffect(effect: Extract<VisualEffect, { kind: "juiceSplash" }>, elapsed: number, progress: number): void {
    const graphics = this.graphics;
    const wipe = easeOut(clamp01(progress / 0.72));
    const punch = Math.sin(Math.min(1, progress) * Math.PI);
    const center = gridToCanvas(effect.center);
    for (const cell of effect.cells) {
      const color = effect.colors[(cell.x + cell.y) % effect.colors.length];
      const point = gridToCanvas(cell);
      const cellPulse = 1 - progress;
      graphics
        .roundRect(BOARD_X + cell.x * CELL + 4, BOARD_Y + cell.y * CELL + 4, CELL - 8, CELL - 8, 10)
        .fill({ color, alpha: cellPulse * 0.34 });
      graphics
        .circle(point.x, point.y, 7 + wipe * 18)
        .stroke({ color: EFFECT_CREAM, alpha: cellPulse * 0.44, width: 2.8 });
      graphics
        .circle(point.x - 7 + wipe * 3, point.y - 6, 2.4 + wipe * 1.8)
        .fill({ color: EFFECT_CREAM, alpha: cellPulse * 0.62 });
      graphics
        .circle(point.x + 8 - wipe * 2, point.y + 7, 1.8 + wipe * 1.5)
        .fill({ color: EFFECT_CREAM, alpha: cellPulse * 0.46 });
      graphics
        .moveTo(center.x, center.y)
        .lineTo(point.x, point.y)
        .stroke({ color, alpha: cellPulse * 0.2, width: 5 + effect.intensity });
      drawSparkle(graphics, point.x, point.y - 16 * wipe, 4.8 + effect.intensity, EFFECT_CREAM, cellPulse * 0.42);
    }

    this.effectSprite(getEffectIndexForColor(effect.colors[0]), center.x, center.y, 150 + effect.intensity * 24 + punch * 18, (1 - progress) * 0.66, easeOut(progress) * 72);
    this.effectSprite(0, center.x, center.y, 108 + effect.intensity * 16, Math.max(0, 1 - progress * 2.2) * 0.6, -easeOut(progress) * 34);
    if (effect.strong) {
      this.splashSprite(center.x, center.y + CELL * 1.2, 250 + effect.intensity * 28, Math.max(0, 1 - progress * 1.26) * 0.42, 0.72 + punch * 0.12);
    }
    graphics.rect(BOARD_X, BOARD_Y, COLS * CELL, ROWS * CELL).fill({ color: EFFECT_CREAM, alpha: Math.max(0, 1 - progress * 4.2) * 0.16 });

    const rippleCount = 3;
    for (let index = 0; index < rippleCount; index += 1) {
      const local = clamp01((progress - index * 0.14) / 0.86);
      if (local <= 0) continue;
      const radius = 14 + easeOut(local) * (106 + effect.intensity * 18);
      graphics
        .circle(center.x, center.y, radius)
        .stroke({ color: index === 1 ? EFFECT_CREAM : effect.colors[index % effect.colors.length], alpha: (1 - local) * 0.68, width: Math.max(2, 6 - index) });
    }

    const label = this.label(effect, "title", "JUICE BURST", EFFECT_CREAM, 22 + effect.intensity * 2);
    label.x = center.x;
    label.y = center.y - 42 - wipe * 14;
    label.alpha = Math.max(0, 1 - progress * 1.28);
    label.scale.set(0.86 + punch * 0.14);
    this.drawParticles(effect.particles, elapsed, progress);
  }

  private drawClearPopEffect(effect: Extract<VisualEffect, { kind: "clearPop" }>, elapsed: number, progress: number): void {
    const graphics = this.graphics;
    const squeeze = clamp01(elapsed / 100);
    if (squeeze < 1) {
      for (const cell of effect.cells) {
        const point = gridToCanvas(cell);
        const sprite = this.fruitSprite(effect.fruit, point.x - CELL / 2 + 4, point.y - CELL / 2 + 4, CELL - 8, 1 - squeeze * 0.3);
        if (sprite) {
          sprite.width *= 1 + squeeze * 0.15;
          sprite.height *= 1 - squeeze * 0.4;
          sprite.y += CELL * squeeze * 0.18;
        }
      }
      return;
    }
    const burst = easeOut(clamp01((elapsed - 100) / (effect.duration - 100)));
    const isBigChain = effect.chain >= 3 && effect.showsBanner;
    const boardCenterX = BOARD_X + (COLS * CELL) / 2;
    const boardCenterY = BOARD_Y + (ROWS * CELL) / 2;
    if (isBigChain) {
      this.splashSprite(boardCenterX, BOARD_Y + ROWS * CELL - 92, 390 + effect.intensity * 42, Math.max(0, 1 - progress * 1.12) * 0.82, 0.92 + Math.sin(Math.min(1, progress) * Math.PI) * 0.16);
      this.effectSprite(5, boardCenterX, boardCenterY, 232 + effect.intensity * 34, Math.max(0, 1 - progress * 1.32) * 0.56, burst * 36);
      const flashAlpha = Math.max(0, 1 - progress * 4.2) * 0.26;
      graphics.rect(BOARD_X, BOARD_Y, COLS * CELL, ROWS * CELL).fill({ color: EFFECT_CREAM, alpha: flashAlpha });
      for (let index = 0; index < 3; index += 1) {
        const local = clamp01((progress - index * 0.13) / 0.87);
        if (local <= 0) continue;
        graphics
          .circle(boardCenterX, boardCenterY, 36 + easeOut(local) * (118 + effect.intensity * 28))
          .stroke({ color: index === 1 ? EFFECT_CREAM : effect.color, alpha: (1 - local) * 0.34, width: Math.max(2, 6 - index) });
      }
      if (effect.chain >= 4) {
        for (let index = 0; index < 2; index += 1) {
          const local = clamp01((progress - index * 0.22) / 0.78);
          if (local <= 0) continue;
          graphics
            .roundRect(BOARD_X - 10 - local * 7, BOARD_Y - 10 - local * 7, COLS * CELL + 20 + local * 14, ROWS * CELL + 20 + local * 14, 16)
            .stroke({ color: index === 0 ? EFFECT_ORANGE : EFFECT_CREAM, alpha: (1 - local) * 0.42, width: 4 });
        }
      }
    }

    for (const cell of effect.cells) {
      const point = gridToCanvas(cell);
      const radius = 7 + burst * (12 + effect.intensity * 7);
      const width = 1.4 + effect.intensity;
      const alpha = (1 - progress) * (0.3 + effect.intensity * 0.08);
      graphics
        .circle(point.x, point.y, radius)
        .stroke({ color: effect.color, alpha, width });
      graphics
        .roundRect(point.x - 13 - burst * 2, point.y - 5, 26 + burst * 4, 10, 6)
        .fill({ color: EFFECT_CREAM, alpha: (1 - progress) * 0.2 });
      if (effect.chain >= 2) {
        this.effectSprite(0, point.x, point.y, 42 + effect.intensity * 7, (1 - progress) * 0.28, burst * 90);
        graphics
          .circle(point.x, point.y, 3 + burst * (24 + effect.intensity * 6))
          .stroke({ color: EFFECT_CREAM, alpha: (1 - progress) * 0.3, width: 1.5 });
      }
    }
    if (effect.chain >= 2 && effect.showsBanner) {
      const sparkleAlpha = (1 - progress) * 0.34;
      for (let index = 0; index < 6; index += 1) {
        const angle = (Math.PI * 2 * index) / 6 + burst * 0.8;
        const distance = 42 + burst * (44 + effect.intensity * 8);
        const x = boardCenterX + Math.cos(angle) * distance;
        const y = boardCenterY + Math.sin(angle) * distance * 0.72;
        drawSparkle(graphics, x, y, 5 + effect.intensity * 1.2, EFFECT_ORANGE, sparkleAlpha);
      }
    }
    if (effect.chain >= 2 && effect.showsBanner) {
      const label = this.label(effect, "title", `${effect.chain} CHAIN!`, EFFECT_CREAM, 34 + effect.intensity * 4);
      label.x = boardCenterX;
      label.y = boardCenterY + 84 - burst * 34;
      label.alpha = Math.max(0, 1 - progress * 1.25);
      label.scale.set(0.82 + Math.sin(Math.min(1, progress) * Math.PI) * (effect.chain >= 3 ? 0.28 : 0.2));
      const subLabel = this.label(effect, "subtitle", effect.chain >= 3 ? "SPLASH COMBO" : "NICE CHAIN", EFFECT_ORANGE, 16 + effect.intensity);
      subLabel.x = boardCenterX;
      subLabel.y = label.y + 28;
      subLabel.alpha = Math.max(0, 1 - progress * 1.18);
    }
    this.drawParticles(effect.particles, elapsed, progress);
  }

  private drawStageAdvanceEffect(effect: Extract<VisualEffect, { kind: "stageAdvance" }>, elapsed: number, progress: number): void {
    const graphics = this.graphics;
    const alpha = Math.max(0, 1 - progress);
    const pulse = easeOut(progress);
    const boardCenterX = BOARD_X + (COLS * CELL) / 2;
    const boardCenterY = BOARD_Y + (ROWS * CELL) / 2;
    const stageLabel = `SPEED UP ${effect.stage}`;
    graphics.rect(0, 0, WIDTH, HEIGHT).fill({ color: EFFECT_MINT, alpha: Math.max(0, 1 - progress * 3.4) * 0.12 });
    graphics
      .roundRect(BOARD_X - 18 - pulse * 10, BOARD_Y - 18 - pulse * 10, COLS * CELL + 36 + pulse * 20, ROWS * CELL + 36 + pulse * 20, 18)
      .stroke({ color: EFFECT_ORANGE, alpha: alpha * 0.72, width: 5 });
    graphics
      .roundRect(BOARD_X - 8 - pulse * 5, BOARD_Y - 8 - pulse * 5, COLS * CELL + 16 + pulse * 10, ROWS * CELL + 16 + pulse * 10, 14)
      .stroke({ color: EFFECT_MINT, alpha: alpha * 0.58, width: 3 });
    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI * 2 * index) / 8;
      const distance = 112 + pulse * 74;
      drawSparkle(graphics, boardCenterX + Math.cos(angle) * distance, boardCenterY + Math.sin(angle) * distance * 0.68, 5.4 + effect.stage, EFFECT_CREAM, alpha * 0.5);
    }

    const label = this.label(effect, "title", stageLabel, EFFECT_CREAM, 24 + effect.stage * 2);
    label.x = boardCenterX;
    label.y = BOARD_Y + 42 - pulse * 14;
    label.alpha = alpha;
    label.scale.set(0.88 + Math.sin(Math.min(1, progress) * Math.PI) * 0.16);
    this.drawParticles(effect.particles, elapsed, progress);
  }

  private drawWaterDropEffect(effect: Extract<VisualEffect, { kind: "waterDrop" }>, elapsed: number, progress: number): void {
    const graphics = this.graphics;
    const alpha = Math.max(0, 1 - progress);
    for (const cell of effect.cells) {
      const x = BOARD_X + cell.x * CELL;
      const y = BOARD_Y + cell.y * CELL;
      this.effectSprite(4, x + CELL / 2, y + CELL / 2, 58, alpha * 0.34, easeOut(progress) * 28);
      const local = easeOut(progress);
      graphics
        .roundRect(x + 5 - local * 2, y + 5 - local * 2, CELL - 10 + local * 4, CELL - 10 + local * 4, 12)
        .stroke({ color: EFFECT_CREAM, width: 3, alpha: alpha * 0.86 });
      graphics.circle(x + CELL / 2, y + CELL / 2, 5 + local * 16).stroke({ color: 0x7ddcff, width: 2, alpha: alpha * 0.52 });
    }
    this.drawParticles(effect.particles, elapsed, progress);
  }

  private drawWaterClearEffect(effect: Extract<VisualEffect, { kind: "waterClear" }>, elapsed: number, progress: number): void {
    const graphics = this.graphics;
    const alpha = Math.max(0, 1 - progress);
    for (const cell of effect.cells) {
      const x = BOARD_X + cell.x * CELL;
      const y = BOARD_Y + cell.y * CELL;
      this.effectSprite(4, x + CELL / 2, y + CELL / 2, 72, alpha * 0.34, easeOut(progress) * 28);
      graphics.circle(x + CELL / 2, y + CELL / 2, 8 + easeOut(progress) * 24).stroke({ color: 0x77d8ff, width: 4, alpha: alpha * 0.72 });
      graphics
        .roundRect(x + 9, y + 18 + easeOut(progress) * 5, CELL - 18, 8, 6)
        .fill({ color: EFFECT_CREAM, alpha: alpha * 0.24 });
    }
    this.drawParticles(effect.particles, elapsed, progress);
  }

  private drawParticles(particles: Particle[], elapsed: number, progress: number): void {
    const graphics = this.graphics;
    for (const particle of particles) {
      const localElapsed = elapsed - particle.delay;
      if (localElapsed < 0) continue;
      const t = localElapsed / 16;
      const x = particle.x + particle.vx * t;
      const y = particle.y + particle.vy * t + 0.018 * t * t;
      graphics.circle(x, y, particle.radius * (1 - progress * 0.45)).fill({ color: particle.color, alpha: Math.max(0, 1 - progress) * 0.78 });
    }
  }
}

function fallbackJuiceEffectCells(center: GridPosition): GridPosition[] {
  const cells: GridPosition[] = [];
  for (let y = center.y - 1; y <= center.y + 1; y += 1) {
    for (let x = center.x - 1; x <= center.x + 1; x += 1) {
      if (x >= 0 && x < COLS && y >= 0 && y < ROWS) cells.push({ x, y });
    }
  }
  return cells;
}

function getChainIntensity(chain: number): number {
  if (chain <= 1) return 1;
  if (chain === 2) return 1.75;
  return Math.min(3.2, 2.35 + (chain - 3) * 0.22);
}

function getEffectIndexForColor(color: number): number {
  if (color === 0xe43f47 || color === 0xd9468f) return 2;
  if (color === 0x7c4bd6) return 3;
  if (color === 0x4fbc73) return 4;
  return 1;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled visual effect: ${JSON.stringify(value)}`);
}
