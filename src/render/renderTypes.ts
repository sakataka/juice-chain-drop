import type { Texture } from "pixi.js";
import type { Board, FallMove, Fruit, GameState, GridPosition, NextPiecePreview, PairPiece, ProgressionStage } from "../core";

export type RenderSnapshot = {
  board: Board;
  active: PairPiece | null;
  nextPreviews: NextPiecePreview[];
  state: GameState;
  /** Cells that just dropped into place in this presentation step. */
  falls: FallMove[];
  /** Changes whenever the shown board step changes, so motion starts once per step. */
  presentationStep: number;
  /** Juice pooling in the vat: the fruit closest to its next bottle and how close (0-1). */
  vat: { fruit: Fruit; level: number } | null;
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
      fruit: Fruit;
      start: number;
      duration: number;
      cells: GridPosition[];
      color: number;
      chain: number;
      intensity: number;
      particles: Particle[];
      /** Only the newest chain step draws the board-wide banner and splash, once per step. */
      showsBanner: boolean;
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
  juice: Map<Fruit, Texture>;
  effects: Texture[];
  splash: Texture | null;
  boardFrame: Texture | null;
  counterWood: Texture | null;
  water: Texture | null;
};
