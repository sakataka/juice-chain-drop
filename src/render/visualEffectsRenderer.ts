import { Container, Graphics } from "pixi.js";
import { BOARD_X, BOARD_Y, CELL, COLS, FRUIT_COLORS, ROWS, WIDTH, HEIGHT } from "../core";
import type { Fruit, GridPosition, JuiceEffectResult, ProgressionStage, ShipmentReport } from "../core";
import {
  addEffectSprite,
  addSplashSprite,
  clamp01,
  createParticles,
  createTextSprite,
  drawSparkle,
  easeOut,
  EFFECT_CREAM,
  EFFECT_INK,
  EFFECT_MINT,
  EFFECT_ORANGE,
  gridToCanvas,
  hexToNumber,
  replaceLayer,
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
    shipment: (effect, _elapsed, progress) => this.drawShipmentEffect(effect, progress),
    stageAdvance: (effect, elapsed, progress) => this.drawStageAdvanceEffect(effect, elapsed, progress),
    waterDrop: (effect, elapsed, progress) => this.drawWaterDropEffect(effect, elapsed, progress),
    waterClear: (effect, elapsed, progress) => this.drawWaterClearEffect(effect, elapsed, progress),
  };

  constructor(private readonly options: VisualEffectsRendererOptions) {}

  clear(): void {
    this.effects.length = 0;
    replaceLayer(this.options.layer, () => undefined);
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
    this.effects.push({
      kind: "clearPop",
      start: performance.now(),
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

  spawnShipment(report: ShipmentReport): void {
    this.effects.push({
      kind: "shipment",
      start: performance.now(),
      duration: report.orderCompleted ? 1320 : 1040,
      score: report.score,
      streak: report.streak,
      multiplier: report.multiplier,
      orderCompleted: report.orderCompleted !== null,
      totalStock: report.totalStock,
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
    replaceLayer(this.options.layer, () => {
      for (let index = this.effects.length - 1; index >= 0; index -= 1) {
        const effect = this.effects[index];
        const elapsed = now - effect.start;
        if (elapsed >= effect.duration) {
          this.effects.splice(index, 1);
          continue;
        }
        const progress = clamp01(elapsed / effect.duration);
        this.drawVisualEffect(effect, elapsed, progress);
      }
    });
  }

  private drawVisualEffect(effect: VisualEffect, elapsed: number, progress: number): void {
    const handler = this.drawHandlers[effect.kind];
    if (!handler) return assertNever(effect as never);
    handler(effect as never, elapsed, progress);
  }

  private drawJuiceSplashEffect(effect: Extract<VisualEffect, { kind: "juiceSplash" }>, elapsed: number, progress: number): void {
    const graphics = new Graphics();
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

    addEffectSprite(this.options.textures, this.options.layer, getEffectIndexForColor(effect.colors[0]), center.x, center.y, 150 + effect.intensity * 24 + punch * 18, (1 - progress) * 0.66, easeOut(progress) * 72);
    addEffectSprite(this.options.textures, this.options.layer, 0, center.x, center.y, 108 + effect.intensity * 16, Math.max(0, 1 - progress * 2.2) * 0.6, -easeOut(progress) * 34);
    if (effect.strong) {
      addSplashSprite(this.options.textures, this.options.layer, center.x, center.y + CELL * 1.2, 250 + effect.intensity * 28, Math.max(0, 1 - progress * 1.26) * 0.42, 0.72 + punch * 0.12);
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

    this.options.layer.addChild(graphics);
    const label = createTextSprite("JUICE BURST", EFFECT_CREAM, 22 + effect.intensity * 2);
    label.anchor.set(0.5);
    label.x = center.x;
    label.y = center.y - 42 - wipe * 14;
    label.alpha = Math.max(0, 1 - progress * 1.28);
    label.scale.set(0.86 + punch * 0.14);
    this.options.layer.addChild(label);
    this.drawParticles(effect.particles, elapsed, progress);
  }

  private drawClearPopEffect(effect: Extract<VisualEffect, { kind: "clearPop" }>, elapsed: number, progress: number): void {
    const graphics = new Graphics();
    const burst = easeOut(progress);
    const isBigChain = effect.chain >= 3;
    const boardCenterX = BOARD_X + (COLS * CELL) / 2;
    const boardCenterY = BOARD_Y + (ROWS * CELL) / 2;
    if (isBigChain) {
      addSplashSprite(this.options.textures, this.options.layer, boardCenterX, BOARD_Y + ROWS * CELL - 92, 390 + effect.intensity * 42, Math.max(0, 1 - progress * 1.12) * 0.82, 0.92 + Math.sin(Math.min(1, progress) * Math.PI) * 0.16);
      addEffectSprite(this.options.textures, this.options.layer, 5, boardCenterX, boardCenterY, 232 + effect.intensity * 34, Math.max(0, 1 - progress * 1.32) * 0.56, burst * 36);
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
        addEffectSprite(this.options.textures, this.options.layer, 0, point.x, point.y, 42 + effect.intensity * 7, (1 - progress) * 0.28, burst * 90);
        graphics
          .circle(point.x, point.y, 3 + burst * (24 + effect.intensity * 6))
          .stroke({ color: EFFECT_CREAM, alpha: (1 - progress) * 0.3, width: 1.5 });
      }
    }
    if (effect.chain >= 2) {
      const sparkleAlpha = (1 - progress) * 0.34;
      for (let index = 0; index < 6; index += 1) {
        const angle = (Math.PI * 2 * index) / 6 + burst * 0.8;
        const distance = 42 + burst * (44 + effect.intensity * 8);
        const x = boardCenterX + Math.cos(angle) * distance;
        const y = boardCenterY + Math.sin(angle) * distance * 0.72;
        drawSparkle(graphics, x, y, 5 + effect.intensity * 1.2, EFFECT_ORANGE, sparkleAlpha);
      }
    }
    this.options.layer.addChild(graphics);
    if (effect.chain >= 2) {
      const label = createTextSprite(`${effect.chain} CHAIN!`, EFFECT_CREAM, 34 + effect.intensity * 4);
      label.anchor.set(0.5);
      label.x = boardCenterX;
      label.y = boardCenterY + 84 - burst * 34;
      label.alpha = Math.max(0, 1 - progress * 1.25);
      label.scale.set(0.82 + Math.sin(Math.min(1, progress) * Math.PI) * (effect.chain >= 3 ? 0.28 : 0.2));
      this.options.layer.addChild(label);
      const subLabel = createTextSprite(effect.chain >= 3 ? "SPLASH COMBO" : "NICE CHAIN", EFFECT_ORANGE, 16 + effect.intensity);
      subLabel.anchor.set(0.5);
      subLabel.x = boardCenterX;
      subLabel.y = label.y + 28;
      subLabel.alpha = Math.max(0, 1 - progress * 1.18);
      this.options.layer.addChild(subLabel);
    }
    this.drawParticles(effect.particles, elapsed, progress);
  }

  private drawShipmentEffect(effect: Extract<VisualEffect, { kind: "shipment" }>, progress: number): void {
    const graphics = new Graphics();
    const local = easeOut(progress);
    const boardCenterX = BOARD_X + (COLS * CELL) / 2;
    const boardCenterY = BOARD_Y + (ROWS * CELL) / 2;
    const alpha = Math.max(0, 1 - progress);
    const accent = effect.orderCompleted ? EFFECT_CREAM : EFFECT_ORANGE;
    const panelWidth = effect.orderCompleted ? 264 : 236;
    const panelHeight = effect.orderCompleted ? 108 : 92;
    graphics.rect(BOARD_X, BOARD_Y, COLS * CELL, ROWS * CELL).fill({ color: EFFECT_ORANGE, alpha: (effect.orderCompleted ? 0.24 : 0.16) * alpha });
    if (effect.orderCompleted) {
      graphics.rect(BOARD_X, BOARD_Y, COLS * CELL, ROWS * CELL).fill({ color: EFFECT_MINT, alpha: 0.1 * alpha });
    }
    graphics
      .roundRect(boardCenterX - panelWidth / 2, boardCenterY - panelHeight / 2 - local * 24, panelWidth, panelHeight, 10)
      .fill({ color: 0x102f34, alpha: 0.94 * alpha })
      .stroke({ color: accent, width: effect.orderCompleted ? 5 : 4, alpha });
    graphics
      .roundRect(boardCenterX - 105, boardCenterY - 25 - local * 24, 210, 52, 7)
      .stroke({ color: EFFECT_MINT, width: 2, alpha: 0.48 * alpha });
    graphics
      .circle(boardCenterX - 96, boardCenterY - 2 - local * 24, 18 + local * 10)
      .stroke({ color: EFFECT_MINT, width: 4, alpha: 0.76 * alpha });
    graphics
      .moveTo(boardCenterX - 78, boardCenterY + 27 - local * 24)
      .lineTo(boardCenterX + 78, boardCenterY + 27 - local * 24)
      .stroke({ color: EFFECT_MINT, width: 2, alpha: 0.34 * alpha });
    for (let index = 0; index < (effect.orderCompleted ? 8 : 5); index += 1) {
      const angle = (Math.PI * 2 * index) / (effect.orderCompleted ? 8 : 5) + local * 0.7;
      const distance = 82 + local * 38;
      drawSparkle(graphics, boardCenterX + Math.cos(angle) * distance, boardCenterY + Math.sin(angle) * distance * 0.72 - local * 24, 5.8, accent, alpha * 0.52);
    }
    this.options.layer.addChild(graphics);

    const label = createTextSprite(effect.orderCompleted ? "ORDER COMPLETE" : "SHIPMENT", EFFECT_INK, effect.orderCompleted ? 22 : 23);
    label.anchor.set(0.5);
    label.x = boardCenterX;
    label.y = boardCenterY - 24 - local * 24;
    label.alpha = alpha;
    this.options.layer.addChild(label);

    const score = createTextSprite(`+${effect.score.toLocaleString()}`, EFFECT_ORANGE, 28);
    score.anchor.set(0.5);
    score.x = boardCenterX;
    score.y = boardCenterY + 10 - local * 24;
    score.alpha = alpha;
    this.options.layer.addChild(score);

    const detail = createTextSprite(`STREAK ${effect.streak}  x${effect.multiplier.toFixed(2)}  STOCK ${effect.totalStock}`, EFFECT_CREAM, 14);
    detail.anchor.set(0.5);
    detail.x = boardCenterX;
    detail.y = boardCenterY + 38 - local * 24;
    detail.alpha = alpha * 0.9;
    this.options.layer.addChild(detail);
  }

  private drawStageAdvanceEffect(effect: Extract<VisualEffect, { kind: "stageAdvance" }>, elapsed: number, progress: number): void {
    const graphics = new Graphics();
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
    this.options.layer.addChild(graphics);

    const label = createTextSprite(stageLabel, EFFECT_CREAM, 24 + effect.stage * 2);
    label.anchor.set(0.5);
    label.x = boardCenterX;
    label.y = BOARD_Y + 42 - pulse * 14;
    label.alpha = alpha;
    label.scale.set(0.88 + Math.sin(Math.min(1, progress) * Math.PI) * 0.16);
    this.options.layer.addChild(label);
    this.drawParticles(effect.particles, elapsed, progress);
  }

  private drawWaterDropEffect(effect: Extract<VisualEffect, { kind: "waterDrop" }>, elapsed: number, progress: number): void {
    const graphics = new Graphics();
    const alpha = Math.max(0, 1 - progress);
    for (const cell of effect.cells) {
      const x = BOARD_X + cell.x * CELL;
      const y = BOARD_Y + cell.y * CELL;
      addEffectSprite(this.options.textures, this.options.layer, 4, x + CELL / 2, y + CELL / 2, 58, alpha * 0.34, easeOut(progress) * 28);
      const local = easeOut(progress);
      graphics
        .roundRect(x + 5 - local * 2, y + 5 - local * 2, CELL - 10 + local * 4, CELL - 10 + local * 4, 12)
        .stroke({ color: EFFECT_CREAM, width: 3, alpha: alpha * 0.86 });
      graphics.circle(x + CELL / 2, y + CELL / 2, 5 + local * 16).stroke({ color: 0x7ddcff, width: 2, alpha: alpha * 0.52 });
    }
    this.options.layer.addChild(graphics);
    this.drawParticles(effect.particles, elapsed, progress);
  }

  private drawWaterClearEffect(effect: Extract<VisualEffect, { kind: "waterClear" }>, elapsed: number, progress: number): void {
    const graphics = new Graphics();
    const alpha = Math.max(0, 1 - progress);
    for (const cell of effect.cells) {
      const x = BOARD_X + cell.x * CELL;
      const y = BOARD_Y + cell.y * CELL;
      addEffectSprite(this.options.textures, this.options.layer, 4, x + CELL / 2, y + CELL / 2, 72, alpha * 0.34, easeOut(progress) * 28);
      graphics.circle(x + CELL / 2, y + CELL / 2, 8 + easeOut(progress) * 24).stroke({ color: 0x77d8ff, width: 4, alpha: alpha * 0.72 });
      graphics
        .roundRect(x + 9, y + 18 + easeOut(progress) * 5, CELL - 18, 8, 6)
        .fill({ color: EFFECT_CREAM, alpha: alpha * 0.24 });
    }
    this.options.layer.addChild(graphics);
    this.drawParticles(effect.particles, elapsed, progress);
  }

  private drawParticles(particles: Particle[], elapsed: number, progress: number): void {
    const graphics = new Graphics();
    for (const particle of particles) {
      const localElapsed = elapsed - particle.delay;
      if (localElapsed < 0) continue;
      const t = localElapsed / 16;
      const x = particle.x + particle.vx * t;
      const y = particle.y + particle.vy * t + 0.018 * t * t;
      graphics.circle(x, y, particle.radius * (1 - progress * 0.45)).fill({ color: particle.color, alpha: Math.max(0, 1 - progress) * 0.78 });
    }
    this.options.layer.addChild(graphics);
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
