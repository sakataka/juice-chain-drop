import { Application, Assets, Container, Rectangle, Texture } from "pixi.js";
import effectStripUrl from "../assets/sprites/lab/effects-v2.png";
import juiceSplashUrl from "../assets/effects/lab/juice-splash.png";
import counterWoodUrl from "../assets/tiles/lab/counter-lab-v2.png";
import boardFrameUrl from "../assets/tiles/lab/board-frame-v2.png";
import fruitStripUrl from "../assets/sprites/lab/fruits-v2.png";
import waterSpriteUrl from "../assets/sprites/lab/water-v2.png";
import { FRUITS, HEIGHT, SPRITE_CELL, WIDTH } from "../core";
import type { Fruit, GridPosition, JuiceEffectResult, ProgressionStage, ShipmentReport } from "../core";
import { BoardRenderer } from "./boardRenderer";
import type { PixiRenderTextures, RenderSnapshot } from "./renderTypes";
import { VisualEffectsRenderer } from "./visualEffectsRenderer";

export type { RenderSnapshot } from "./renderTypes";

export class PixiGameRenderer {
  private readonly gameApp = new Application();
  private readonly nextApp = new Application();
  private readonly backgroundLayer = new Container();
  private readonly boardLayer = new Container();
  private readonly ghostLayer = new Container();
  private readonly activeLayer = new Container();
  private readonly effectsLayer = new Container();
  private readonly nextLayer = new Container();
  private readonly textures: PixiRenderTextures = {
    fruit: new Map<Fruit, Texture>(),
    effects: [],
    splash: null,
    boardFrame: null,
    counterWood: null,
    water: null,
  };
  private readonly boardRenderer = new BoardRenderer({
    layers: {
      background: this.backgroundLayer,
      board: this.boardLayer,
      ghost: this.ghostLayer,
      active: this.activeLayer,
      next: this.nextLayer,
    },
    textures: this.textures,
  });
  private readonly visualEffectsRenderer = new VisualEffectsRenderer({
    layer: this.effectsLayer,
    textures: this.textures,
  });
  private ready = false;

  constructor(
    private readonly gameCanvas: HTMLCanvasElement,
    private readonly nextCanvas: HTMLCanvasElement,
  ) {}

  async init(): Promise<void> {
    await Promise.all([
      this.gameApp.init({
        canvas: this.gameCanvas,
        width: WIDTH,
        height: HEIGHT,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        antialias: false,
        backgroundAlpha: 0,
      }),
      this.nextApp.init({
        canvas: this.nextCanvas,
        width: 300,
        height: 84,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        antialias: false,
        backgroundAlpha: 0,
      }),
    ]);

    await this.loadAssets();
    this.gameApp.stage.addChild(this.backgroundLayer, this.boardLayer, this.ghostLayer, this.activeLayer, this.effectsLayer);
    this.nextApp.stage.addChild(this.nextLayer);
    this.boardRenderer.drawBackground();
    this.gameApp.ticker.add(() => this.visualEffectsRenderer.draw(performance.now()));
    this.ready = true;
  }

  clearEffects(): void {
    this.visualEffectsRenderer.clear();
  }

  render(snapshot: RenderSnapshot): void {
    if (!this.ready) return;
    this.boardRenderer.drawBoard(snapshot.board);
    this.boardRenderer.drawGhost(snapshot.board, snapshot.active, snapshot.state);
    this.boardRenderer.drawActivePiece(snapshot.active);
    this.boardRenderer.drawNextQueue(snapshot.nextQueue);
  }

  spawnJuiceSplash(effect: JuiceEffectResult, primary: Fruit): void {
    this.visualEffectsRenderer.spawnJuiceSplash(effect, primary);
  }

  spawnClearPop(cells: GridPosition[], fruit: Fruit, chain: number): void {
    this.visualEffectsRenderer.spawnClearPop(cells, fruit, chain);
  }

  spawnShipment(report: ShipmentReport): void {
    this.visualEffectsRenderer.spawnShipment(report);
  }

  spawnStageAdvance(stage: ProgressionStage): void {
    this.visualEffectsRenderer.spawnStageAdvance(stage);
  }

  spawnWaterDrop(cell: GridPosition): void {
    this.visualEffectsRenderer.spawnWaterDrop(cell);
  }

  spawnWaterClear(cells: GridPosition[]): void {
    this.visualEffectsRenderer.spawnWaterClear(cells);
  }

  private async loadAssets(): Promise<void> {
    const [fruitStrip, effectStrip, splash, boardFrame, counterWood, water] = await Promise.all([
      Assets.load<Texture>(fruitStripUrl),
      Assets.load<Texture>(effectStripUrl),
      Assets.load<Texture>(juiceSplashUrl),
      Assets.load<Texture>(boardFrameUrl),
      Assets.load<Texture>(counterWoodUrl),
      Assets.load<Texture>(waterSpriteUrl),
    ]);
    this.textures.splash = splash;
    this.textures.boardFrame = boardFrame;
    this.textures.counterWood = counterWood;
    this.textures.water = water;
    for (let index = 0; index < FRUITS.length; index += 1) {
      const sourceCell = fruitStrip.width / FRUITS.length || SPRITE_CELL;
      this.textures.fruit.set(FRUITS[index], new Texture({ source: fruitStrip.source, frame: new Rectangle(index * sourceCell, 0, sourceCell, fruitStrip.height) }));
    }
    const effectCell = effectStrip.width / 6 || SPRITE_CELL;
    this.textures.effects = Array.from({ length: 6 }, (_, index) => new Texture({ source: effectStrip.source, frame: new Rectangle(index * effectCell, 0, effectCell, effectStrip.height) }));
  }
}
