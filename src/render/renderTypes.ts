import type { Texture } from "pixi.js";
import type { Board, Fruit, FruitPair, GameState, GridPosition, PairPiece, ProgressionStage } from "../core";

export type RenderSnapshot = {
  board: Board;
  active: PairPiece | null;
  nextQueue: FruitPair[];
  state: GameState;
};

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: number;
  delay: number;
};

export type VisualEffect =
  | {
      kind: "juiceSplash";
      start: number;
      duration: number;
      center: GridPosition;
      cells: GridPosition[];
      colors: number[];
      particles: Particle[];
      strong: boolean;
      intensity: number;
    }
  | {
      kind: "clearPop";
      start: number;
      duration: number;
      cells: GridPosition[];
      color: number;
      chain: number;
      intensity: number;
      particles: Particle[];
    }
  | {
      kind: "shipment";
      start: number;
      duration: number;
      score: number;
      streak: number;
      multiplier: number;
      orderCompleted: boolean;
      totalStock: number;
    }
  | {
      kind: "stageAdvance";
      start: number;
      duration: number;
      stage: ProgressionStage;
      particles: Particle[];
    }
  | {
      kind: "waterDrop";
      start: number;
      duration: number;
      cells: GridPosition[];
      particles: Particle[];
    }
  | {
      kind: "waterClear";
      start: number;
      duration: number;
      cells: GridPosition[];
      particles: Particle[];
    };

export type PixiRenderTextures = {
  fruit: Map<Fruit, Texture>;
  effects: Texture[];
  splash: Texture | null;
  boardFrame: Texture | null;
  counterWood: Texture | null;
  water: Texture | null;
};
