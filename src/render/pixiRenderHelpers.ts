import { Container, Graphics, Sprite, Text } from "pixi.js";
import { BOARD_X, BOARD_Y, CELL } from "../core";
import type { Fruit, GridPosition } from "../core";
import type { Particle, PixiRenderTextures } from "./renderTypes";

export const FRUIT_DRAW_SCALE = 0.96;
export const EFFECT_CREAM = 0xfff1bd;
export const EFFECT_MINT = 0x39f0c2;
export const EFFECT_ORANGE = 0xff9f2e;
export const EFFECT_CORAL = 0xff5c54;
export const EFFECT_INK = 0x2a1708;
export const EFFECT_BRASS = 0xd9a44a;
export const LAB_DARK = 0x241307;
export const LAB_PANEL = 0x33200e;
export const LAB_GRID_A = 0x2c1b0c;
export const LAB_GRID_B = 0x3a2511;
export const TRAY_WOOD = 0xf2a23b;

export function replaceLayer(layer: Container, draw: () => void): void {
  layer.removeChildren().forEach((child) => child.destroy());
  draw();
}

export function addFruitSprite(textures: PixiRenderTextures, layer: Container, fruit: Fruit, x: number, y: number, size: number, alpha: number, tint?: number): void {
  const texture = textures.fruit.get(fruit);
  if (!texture) return;
  const sprite = new Sprite(texture);
  const visualSize = size * FRUIT_DRAW_SCALE;
  const inset = (size - visualSize) / 2;
  const shadow = new Graphics();
  shadow.ellipse(x + size / 2, y + size * 0.84, visualSize * 0.34, visualSize * 0.1).fill({ color: 0x000000, alpha: 0.22 * alpha });
  layer.addChild(shadow);
  sprite.x = x + inset;
  sprite.y = y + inset;
  sprite.width = visualSize;
  sprite.height = visualSize;
  sprite.alpha = alpha;
  if (tint !== undefined) {
    sprite.tint = tint;
  }
  layer.addChild(sprite);
}

export function drawWaterCell(textures: PixiRenderTextures, layer: Container, x: number, y: number, alpha: number): void {
  const left = BOARD_X + x * CELL + 6;
  const top = BOARD_Y + y * CELL + 6;
  if (textures.water) {
    const glow = new Graphics();
    glow.roundRect(left - 2, top - 2, CELL - 8, CELL - 8, 12).fill({ color: 0x65ddff, alpha: 0.18 * alpha });
    layer.addChild(glow);
    const sprite = new Sprite(textures.water);
    sprite.x = left;
    sprite.y = top;
    sprite.width = CELL - 12;
    sprite.height = CELL - 12;
    sprite.alpha = alpha;
    layer.addChild(sprite);
    return;
  }
  const graphics = new Graphics();
  graphics
    .roundRect(left, top, CELL - 12, CELL - 12, 10)
    .fill({ color: 0xc9f3ff, alpha: 0.58 * alpha })
    .stroke({ color: 0xffffff, width: 3, alpha: 0.92 * alpha });
  graphics.roundRect(left + 6, top + 5, CELL - 26, 10, 7).fill({ color: 0xffffff, alpha: 0.52 * alpha });
  graphics.circle(left + 13, top + 24, 3).fill({ color: 0xffffff, alpha: 0.7 * alpha });
  graphics.circle(left + 25, top + 29, 2.2).fill({ color: 0x6ecff6, alpha: 0.78 * alpha });
  graphics.rect(left + 4, top + CELL - 22, CELL - 20, 6).fill({ color: 0x58c6ef, alpha: 0.28 * alpha });
  layer.addChild(graphics);
}

export function addEffectSprite(textures: PixiRenderTextures, layer: Container, index: number, x: number, y: number, size: number, alpha: number, rotationDegrees = 0): void {
  const texture = textures.effects[index];
  if (!texture || alpha <= 0) return;
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  sprite.x = x;
  sprite.y = y;
  sprite.width = size;
  sprite.height = size;
  sprite.alpha = alpha;
  sprite.rotation = (rotationDegrees * Math.PI) / 180;
  layer.addChild(sprite);
}

export function addSplashSprite(textures: PixiRenderTextures, layer: Container, x: number, y: number, width: number, alpha: number, scaleY = 1): void {
  if (!textures.splash || alpha <= 0) return;
  const sprite = new Sprite(textures.splash);
  sprite.anchor.set(0.5, 0.82);
  sprite.x = x;
  sprite.y = y;
  sprite.width = width;
  sprite.height = width * 0.62 * scaleY;
  sprite.alpha = alpha;
  layer.addChild(sprite);
}

export function createParticles(x: number, y: number, colors: number[], count: number, speed: number, delayRange = 110): Particle[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = Math.random() * Math.PI * 2;
    const velocity = (0.55 + Math.random() * 0.85) * speed;
    return {
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity - 0.35 * speed,
      radius: 2.2 + Math.random() * 4.2,
      color: colors[index % colors.length],
      delay: Math.random() * delayRange,
    };
  });
}

export function drawSparkle(graphics: Graphics, x: number, y: number, size: number, color: number, alpha: number): void {
  graphics
    .moveTo(x, y - size)
    .lineTo(x, y + size)
    .moveTo(x - size, y)
    .lineTo(x + size, y)
    .stroke({ color, alpha, width: 1.8 });
  graphics.circle(x, y, size * 0.28).fill({ color: EFFECT_CREAM, alpha: alpha * 0.8 });
}

export function gridToCanvas(position: GridPosition): GridPosition {
  return {
    x: BOARD_X + position.x * CELL + CELL / 2,
    y: BOARD_Y + position.y * CELL + CELL / 2,
  };
}

export function hexToNumber(hex: string): number {
  return Number.parseInt(hex.replace("#", ""), 16);
}

export function createTextSprite(text: string, color: number, size: number): Text {
  return new Text({
    text,
    style: {
      fill: color,
      fontFamily: "Fredoka, sans-serif",
      fontSize: size,
      fontWeight: "700",
    },
  });
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function easeOut(value: number): number {
  return 1 - (1 - value) * (1 - value);
}
