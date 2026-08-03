import { GAME_MODE_CONFIGS, PROGRESSION_DROP_INTERVAL_MULTIPLIERS, getChallengeSnapshot, getDifficultyConfig, updateChallenge } from "../core";
import type { BgmMoment, ChallengeRuntimeState, ChallengeResult, DifficultyId, Fruit, GameModeId, GameSettings, GridPosition, JuiceEffectResult, ProgressionStage, ResolveReport, ShipmentReport } from "../core";
import { createChallengeState } from "../core";
import { completePlayerStats } from "../storage/stats";
import type { PlayerStats } from "../storage/stats";
import type { GameModel } from "../core/game";
import type { HudSnapshot } from "../ui/hud";
import type { RenderSnapshot } from "../render/renderTypes";
import type { AiSpeed } from "../core";
import type { AiGameSnapshot } from "../ai/types";

export type SoundCue =
  | { kind: "tick" }
  | { kind: "pop" }
  | { kind: "tap" }
  | { kind: "whoosh"; strength?: number }
  | { kind: "splash"; chain: number; fruit: Fruit }
  | { kind: "sparkle"; chain: number }
  | { kind: "pour" }
  | { kind: "shipment"; totalStock: number }
  | { kind: "fanfare" }
  | { kind: "gameOver" }
  | { kind: "bgmContext"; mode: GameModeId; moment: BgmMoment }
  | { kind: "bgmStage"; stage: ProgressionStage };

export type VisualEffectCue =
  | { kind: "clearEffects" }
  | { kind: "juiceSplash"; effect: JuiceEffectResult; primary: Fruit }
  | { kind: "clearPop"; cells: GridPosition[]; fruit: Fruit; chain: number }
  | { kind: "waterDrop"; cell: GridPosition }
  | { kind: "waterClear"; cells: GridPosition[] }
  | { kind: "shipment"; report: ShipmentReport }
  | { kind: "stageAdvance"; stage: ProgressionStage };

export type GameSessionCommandResult = {
  sounds: SoundCue[];
  effects: VisualEffectCue[];
  shouldRender: boolean;
  shouldUpdateHud: boolean;
  gameOverRecorded: boolean;
};

type GameSessionOptions = {
  game: GameModel;
  settings: GameSettings;
  stats: PlayerStats;
  soundEnabled: () => boolean;
  saveSettings: (settings: GameSettings) => void;
  saveStats: (stats: PlayerStats) => void;
  rng?: () => number;
};

const NO_RESULT: GameSessionCommandResult = {
  sounds: [],
  effects: [],
  shouldRender: false,
  shouldUpdateHud: false,
  gameOverRecorded: false,
};

export class GameSession {
  private dropTimer = 0;
  private shipmentTimer = 0;
  private elapsedPlayingMs = 0;
  private bgmStage: ProgressionStage = 0;
  private lastBgmContext = "";
  private gameOverRecorded = false;
  private challenge: ChallengeRuntimeState;
  private settings: GameSettings;
  private stats: PlayerStats;

  constructor(private readonly options: GameSessionOptions) {
    this.settings = options.settings;
    this.stats = options.stats;
    this.challenge = createChallengeState(this.settings.mode);
  }

  start(): GameSessionCommandResult {
    this.game.start({ difficulty: this.settings.difficulty });
    this.gameOverRecorded = false;
    this.resetChallenge("Active");
    this.dropTimer = 0;
    this.shipmentTimer = 0;
    this.elapsedPlayingMs = 0;
    this.bgmStage = 0;
    this.lastBgmContext = "";
    const result = createResult({ sounds: [{ kind: "bgmStage", stage: 0 }], effects: [{ kind: "clearEffects" }], shouldRender: true, shouldUpdateHud: true });
    this.syncBgmContext(result);
    if (this.settings.mode === "waterCleanup") {
      const cells = this.game.dropStartingWater(GAME_MODE_CONFIGS.waterCleanup.initialWaterCount ?? 0);
      for (const cell of cells) {
        result.effects.push({ kind: "waterDrop", cell });
      }
      this.syncWaterCleanupProgress(result);
    }
    if (this.game.state === "gameover") {
      result.sounds.push({ kind: "gameOver" });
      this.recordGameOver(result);
    }
    return result;
  }

  togglePause(): GameSessionCommandResult {
    if (this.game.state === "playing") {
      this.game.pause();
    } else if (this.game.state === "paused") {
      this.game.resume();
      this.dropTimer = 0;
    }
    return createResult({ shouldRender: true, shouldUpdateHud: true });
  }

  move(dx: number): GameSessionCommandResult {
    if (this.game.state !== "playing" || !this.game.active) return NO_RESULT;
    const result = createResult({ shouldUpdateHud: true });
    if (this.game.tryMove(dx, 0)) {
      result.sounds.push({ kind: "tick" });
      result.shouldRender = true;
    }
    return result;
  }

  rotate(): GameSessionCommandResult {
    if (this.game.state !== "playing" || !this.game.active) return NO_RESULT;
    const result = createResult({ shouldUpdateHud: true });
    if (this.game.tryRotate()) {
      result.sounds.push({ kind: "pop" });
      result.shouldRender = true;
    }
    return result;
  }

  softDrop(): GameSessionCommandResult {
    if (this.game.state !== "playing" || !this.game.active) return NO_RESULT;
    if (this.game.tryMove(0, 1)) {
      return createResult({ sounds: [{ kind: "whoosh", strength: 0.22 }], shouldRender: true, shouldUpdateHud: true });
    }
    const result = createResult({ sounds: [{ kind: "tap" }], shouldRender: true, shouldUpdateHud: true });
    this.applySettleReport(this.game.settlePiece(), result);
    return result;
  }

  hardDrop(): GameSessionCommandResult {
    if (this.game.state !== "playing" || !this.game.active) return NO_RESULT;
    const result = createResult({ shouldUpdateHud: true });
    const report = this.game.hardDrop();
    this.dropTimer = 0;
    if (report) {
      result.sounds.push({ kind: "tap" });
      this.applyResolveFeedback(report, result);
    }
    this.recordCurrentGameOver(result);
    return result;
  }

  settlePiece(): GameSessionCommandResult {
    if (this.game.state !== "playing" || !this.game.active) return NO_RESULT;
    const result = createResult({ sounds: [{ kind: "tap" }], shouldUpdateHud: true });
    this.applySettleReport(this.game.settlePiece(), result);
    return result;
  }

  useJuice(fruit: Fruit): GameSessionCommandResult {
    const report = this.game.useJuice(fruit);
    if (!report) return NO_RESULT;
    const result = createResult({ sounds: [{ kind: "pour" }], shouldRender: true, shouldUpdateHud: true });
    result.effects.push({ kind: "juiceSplash", effect: report.effect, primary: report.primary });
    this.applyResolveFeedback(report.resolve, result);
    return result;
  }

  tick(deltaMs: number): GameSessionCommandResult {
    if (this.game.state !== "playing" || !this.game.active) {
      return NO_RESULT;
    }

    const result = createResult();
    this.dropTimer += deltaMs;
    this.advanceChallenge(deltaMs, result);
    this.advanceProgression(deltaMs, result);
    if (this.game.state !== "playing" || !this.game.active) return result;

    const difficulty = getDifficultyConfig(this.settings.difficulty);
    const interval = this.getProgressedDropInterval(this.game.slowTurns > 0 ? difficulty.slowDropInterval : difficulty.dropInterval);
    if (this.dropTimer >= interval) {
      this.dropTimer = 0;
      if (!this.game.tryMove(0, 1)) {
        result.sounds.push({ kind: "tap" });
        result.shouldRender = true;
        result.shouldUpdateHud = true;
        this.applySettleReport(this.game.settlePiece(), result);
      } else {
        result.shouldRender = true;
      }
    }
    return result;
  }

  setDifficulty(difficulty: DifficultyId): GameSessionCommandResult {
    this.settings = { ...this.settings, difficulty };
    this.options.saveSettings(this.settings);
    return createResult({ shouldUpdateHud: true });
  }

  setMode(mode: GameModeId): GameSessionCommandResult {
    this.settings = { ...this.settings, mode };
    this.options.saveSettings(this.settings);
    this.resetChallenge();
    this.lastBgmContext = "";
    const result = createResult({ shouldUpdateHud: true });
    this.syncBgmContext(result);
    return result;
  }

  setAiSpeed(aiSpeed: AiSpeed): GameSessionCommandResult {
    this.settings = { ...this.settings, aiSpeed };
    this.options.saveSettings(this.settings);
    return createResult({ shouldUpdateHud: true });
  }

  setShippingIntervalSeconds(shippingIntervalSeconds: number): GameSessionCommandResult {
    const normalized = Math.max(0, Math.min(600, Math.round(shippingIntervalSeconds)));
    this.settings = { ...this.settings, shippingIntervalSeconds: normalized };
    this.shipmentTimer = Math.min(this.shipmentTimer, this.getShipmentIntervalMs());
    this.options.saveSettings(this.settings);
    return createResult({ shouldUpdateHud: true });
  }

  setWaterEnabled(waterEnabled: boolean): GameSessionCommandResult {
    this.settings = { ...this.settings, waterEnabled };
    this.options.saveSettings(this.settings);
    return createResult({ shouldUpdateHud: true });
  }

  setReducedMotion(reducedMotion: boolean): GameSessionCommandResult {
    this.settings = { ...this.settings, reducedMotion };
    this.options.saveSettings(this.settings);
    return createResult({
      effects: reducedMotion ? [{ kind: "clearEffects" }] : [],
      shouldUpdateHud: true,
    });
  }

  setSfxVolume(sfxVolume: number): GameSessionCommandResult {
    this.settings = { ...this.settings, sfxVolume };
    this.options.saveSettings(this.settings);
    return createResult({ shouldUpdateHud: true });
  }

  setBgmVolume(bgmVolume: number): GameSessionCommandResult {
    this.settings = { ...this.settings, bgmVolume };
    this.options.saveSettings(this.settings);
    return createResult({ shouldUpdateHud: true });
  }

  getSettings(): GameSettings {
    return this.settings;
  }

  getHudSnapshot(): HudSnapshot {
    return {
      score: this.game.score,
      lastChain: this.game.lastChain,
      state: this.game.state,
      juiceStock: this.game.juiceStock,
      juiceProgress: this.game.juiceProgress,
      juiceDropsCreated: this.game.juiceDropsCreated,
      queuedJuiceDrops: [...this.game.queuedJuiceDrops],
      shipment: {
        enabled: this.settings.shippingIntervalSeconds > 0,
        intervalSeconds: this.settings.shippingIntervalSeconds,
        remainingMs: this.getShipmentRemainingMs(),
        previewScore: this.game.getShipmentPreview().score,
      },
      order: this.game.currentOrder,
      featuredFruit: this.game.featuredFruit,
      soundEnabled: this.options.soundEnabled(),
      stats: this.stats,
      settings: this.settings,
      challenge: getChallengeSnapshot(this.challenge, this.game.score, this.game.state, this.settings),
    };
  }

  getRenderSnapshot(): RenderSnapshot {
    return {
      board: this.game.board,
      active: this.game.active,
      nextQueue: this.game.nextQueue,
      nextPreviews: this.game.nextPreviews,
      state: this.game.state,
    };
  }

  getAiChallengeContext(): AiGameSnapshot["challenge"] {
    const config = GAME_MODE_CONFIGS[this.settings.mode];
    return {
      mode: this.settings.mode,
      elapsedMs: this.challenge.elapsedMs,
      remainingMs: config.durationMs ? Math.max(0, config.durationMs - this.challenge.elapsedMs) : undefined,
      targetScore: config.targetScore,
      targetWaterClears: config.targetWaterClears,
      runBestChain: this.challenge.runBestChain,
      runWaterClears: this.challenge.runWaterClears,
      result: this.challenge.result,
    };
  }

  getBgmStage(): ProgressionStage {
    return this.bgmStage;
  }

  private get game(): GameModel {
    return this.options.game;
  }

  private resetChallenge(result: ChallengeResult = "Ready"): void {
    this.challenge = updateChallenge(this.challenge, { kind: "reset", mode: this.settings.mode, result }, GAME_MODE_CONFIGS[this.settings.mode]).state;
  }

  private applySettleReport(report: ResolveReport | null, result: GameSessionCommandResult): void {
    if (report) {
      this.dropTimer = 0;
      this.applyResolveFeedback(report, result);
    }
    this.recordCurrentGameOver(result);
  }

  private applyResolveFeedback(report: ResolveReport, result: GameSessionCommandResult): void {
    result.shouldRender = true;
    if (report.juiceDrop) {
      result.sounds.push({ kind: "pour" });
      result.effects.push({ kind: "juiceSplash", effect: report.juiceDrop.effect, primary: report.juiceDrop.primary });
    }
    if ((report.pressedJuices?.length ?? 0) > 0) {
      result.sounds.push({ kind: "pour" });
    }
    this.challenge = updateChallenge(this.challenge, { kind: "chain", chain: report.chain }, GAME_MODE_CONFIGS[this.settings.mode]).state;
    for (const pop of report.popEvents) {
      result.effects.push({ kind: "clearPop", cells: pop.cells, fruit: pop.fruit, chain: pop.chain });
      result.sounds.push({ kind: "splash", chain: pop.chain, fruit: pop.fruit });
    }
    if (report.waterClears.length > 0) {
      result.effects.push({ kind: "waterClear", cells: report.waterClears });
      result.sounds.push({ kind: "pour" });
    }
    if (report.chain >= 2) {
      result.sounds.push({ kind: "sparkle", chain: report.chain });
    }
    this.syncBgmContext(result);
    this.syncWaterCleanupProgress(result);
    this.advanceChallenge(0, result);
  }

  private advanceChallenge(deltaMs: number, result: GameSessionCommandResult): void {
    const updated = updateChallenge(
      this.challenge,
      { kind: "tick", deltaMs, score: this.game.score, gameState: this.game.state, mode: this.settings.mode },
      GAME_MODE_CONFIGS[this.settings.mode],
    );
    this.challenge = updated.state;
    if (updated.shouldEndGame) {
      this.game.endGame();
      if (updated.state.result === "Success") {
        result.sounds.push({ kind: "fanfare" });
      }
      this.recordGameOver(result);
      result.shouldUpdateHud = true;
    }
  }

  private syncWaterCleanupProgress(result: GameSessionCommandResult): void {
    if (this.settings.mode !== "waterCleanup") return;
    const target = GAME_MODE_CONFIGS.waterCleanup.targetWaterClears ?? 0;
    const cleared = Math.max(0, target - this.game.countWaterCells());
    const updated = updateChallenge(this.challenge, { kind: "waterProgress", cleared }, GAME_MODE_CONFIGS.waterCleanup);
    this.challenge = updated.state;
    if (updated.shouldEndGame) {
      this.game.endGame();
      if (updated.state.result === "Success") {
        result.sounds.push({ kind: "fanfare" });
      }
      this.recordGameOver(result);
      result.shouldRender = true;
    }
    result.shouldUpdateHud = true;
  }

  private advanceProgression(deltaMs: number, result: GameSessionCommandResult): void {
    if (this.game.state !== "playing") return;
    this.elapsedPlayingMs += deltaMs;
    const stage = this.getProgressionStage();
    if (stage === this.bgmStage) return;
    this.bgmStage = stage;
    result.sounds.push({ kind: "bgmStage", stage });
    result.effects.push({ kind: "stageAdvance", stage });
  }

  private getProgressionStage(): ProgressionStage {
    const difficulty = getDifficultyConfig(this.settings.difficulty);
    return Math.min(3, Math.floor(this.elapsedPlayingMs / difficulty.progressionStageDurationMs)) as ProgressionStage;
  }

  private getProgressedDropInterval(intervalMs: number): number {
    return Math.round(intervalMs * PROGRESSION_DROP_INTERVAL_MULTIPLIERS[this.bgmStage]);
  }

  private syncBgmContext(result: GameSessionCommandResult): void {
    const moment: BgmMoment = this.game.active?.kind === "juiceDrop" ? "juiceDrop" : this.game.queuedJuiceDrops.length > 0 ? "pressReady" : "flow";
    const key = `${this.settings.mode}:${moment}`;
    if (key === this.lastBgmContext) return;
    this.lastBgmContext = key;
    result.sounds.push({ kind: "bgmContext", mode: this.settings.mode, moment });
  }

  private getShipmentRemainingMs(): number {
    const intervalMs = this.getShipmentIntervalMs();
    if (intervalMs <= 0) return 0;
    return Math.max(0, intervalMs - this.shipmentTimer);
  }

  private getShipmentIntervalMs(): number {
    return this.settings.shippingIntervalSeconds * 1000;
  }

  private recordCurrentGameOver(result: GameSessionCommandResult): void {
    if (this.game.state !== "gameover") return;
    result.sounds.push({ kind: "gameOver" });
    this.recordGameOver(result);
  }

  private recordGameOver(result: GameSessionCommandResult): void {
    if (this.gameOverRecorded) return;
    this.gameOverRecorded = true;
    result.shouldRender = true;
    if (this.challenge.result === "Active" && this.settings.mode !== "normal") {
      this.challenge = { ...this.challenge, result: "Failed" };
    }
    this.stats = completePlayerStats(this.stats, this.game.score, this.challenge.runBestChain);
    this.options.saveStats(this.stats);
    result.gameOverRecorded = true;
  }
}

function createResult(overrides: Partial<GameSessionCommandResult> = {}): GameSessionCommandResult {
  return {
    sounds: overrides.sounds ?? [],
    effects: overrides.effects ?? [],
    shouldRender: overrides.shouldRender ?? false,
    shouldUpdateHud: overrides.shouldUpdateHud ?? false,
    gameOverRecorded: overrides.gameOverRecorded ?? false,
  };
}
