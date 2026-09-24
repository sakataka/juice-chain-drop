import { GAME_MODE_CONFIGS, PROGRESSION_DROP_INTERVAL_MULTIPLIERS, getChallengeSnapshot, getDifficultyConfig, updateChallenge } from "../core";
import type { BgmMoment, ChallengeRuntimeState, ChallengeResult, DifficultyId, Fruit, GameModeId, GameSettings, GameState, GridPosition, JuiceEffectResult, NextPiecePreview, ProgressionStage, ResolveReport } from "../core";
import { createChallengeState } from "../core";
import { completePlayerStats, getScopedRecord } from "../storage/stats";
import type { PlayerStats, RecordScope } from "../storage/stats";
import type { GameModel } from "../core/game";
import type { HudSnapshot } from "../ui/hud";
import type { RenderSnapshot } from "../render/renderTypes";
import type { AiSpeed } from "../core";
import type { AiGameSnapshot } from "../ai/types";
import { buildResolvePlayback } from "./resolvePlayback";
import type { ResolvePlayback } from "./resolvePlayback";

export type SoundCue =
  | { kind: "tick" }
  | { kind: "pop" }
  | { kind: "tap" }
  | { kind: "whoosh"; strength?: number }
  | { kind: "splash"; chain: number; fruit: Fruit }
  | { kind: "sparkle"; chain: number }
  | { kind: "pour" }
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
  private elapsedPlayingMs = 0;
  private bgmStage: ProgressionStage = 0;
  private lastBgmContext = "";
  private gameOverRecorded = false;
  private recordScope: RecordScope = "player";
  private playback: { timeline: ResolvePlayback; elapsedMs: number; stepIndex: number } | null = null;
  private presentationStep = 0;
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
    this.recordScope = "player";
    this.playback = null;
    this.presentationStep += 1;
    this.resetChallenge("Active");
    this.dropTimer = 0;
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

  /** Marks the current run as Auto Play so its result is kept apart from the player's records. */
  markAutoPlay(): void {
    if (this.game.state === "playing" || this.game.state === "paused") this.recordScope = "autoPlay";
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
    if (!this.acceptsPieceInput()) return NO_RESULT;
    const result = createResult({ shouldUpdateHud: true });
    if (this.game.tryMove(dx, 0)) {
      result.sounds.push({ kind: "tick" });
      result.shouldRender = true;
    }
    return result;
  }

  rotate(): GameSessionCommandResult {
    if (!this.acceptsPieceInput()) return NO_RESULT;
    const result = createResult({ shouldUpdateHud: true });
    if (this.game.tryRotate()) {
      result.sounds.push({ kind: "pop" });
      result.shouldRender = true;
    }
    return result;
  }

  softDrop(): GameSessionCommandResult {
    if (!this.acceptsPieceInput()) return NO_RESULT;
    if (this.game.tryMove(0, 1)) {
      return createResult({ sounds: [{ kind: "whoosh", strength: 0.22 }], shouldRender: true, shouldUpdateHud: true });
    }
    const result = createResult({ sounds: [{ kind: "tap" }], shouldRender: true, shouldUpdateHud: true });
    this.applySettleReport(this.game.settlePiece(), result);
    return result;
  }

  hardDrop(): GameSessionCommandResult {
    if (!this.acceptsPieceInput()) return NO_RESULT;
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
    if (!this.acceptsPieceInput()) return NO_RESULT;
    const result = createResult({ sounds: [{ kind: "tap" }], shouldUpdateHud: true });
    this.applySettleReport(this.game.settlePiece(), result);
    return result;
  }

  tick(deltaMs: number): GameSessionCommandResult {
    if (this.playback) return this.tickPlayback(deltaMs);
    if (!this.acceptsPieceInput()) {
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
    const record = getScopedRecord(this.stats, this.recordScope);
    return {
      score: this.game.score,
      lastChain: this.game.lastChain,
      recordScope: this.recordScope,
      bestScore: Math.max(record.bestScore, this.game.score),
      bestChain: Math.max(record.bestChain, this.challenge.runBestChain),
      state: this.getPresentedState(),
      juiceStock: this.game.juiceStock,
      juiceProgress: this.game.juiceProgress,
      juiceDropsCreated: this.game.juiceDropsCreated,
      queuedJuiceDrops: [...this.game.queuedJuiceDrops],
      soundEnabled: this.options.soundEnabled(),
      stats: this.stats,
      settings: this.settings,
      challenge: getChallengeSnapshot(this.challenge, this.game.score, this.game.state, this.settings),
    };
  }

  getRenderSnapshot(): RenderSnapshot {
    if (this.playback) {
      const step = this.playback.timeline.steps[this.playback.stepIndex];
      return {
        board: step.board,
        active: null,
        nextPreviews: this.getPlaybackPreviews(),
        state: this.getPresentedState(),
        falls: step.falls,
        presentationStep: this.presentationStep,
      };
    }
    return {
      board: this.game.board,
      active: this.game.active,
      nextPreviews: this.game.nextPreviews,
      state: this.game.state,
      falls: [],
      presentationStep: this.presentationStep,
    };
  }

  /** True while a chain is being replayed; the rules have already finished resolving. */
  isResolving(): boolean {
    return this.playback !== null;
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
    this.startPlayback(report, result);
    this.syncBgmContext(result);
    this.syncWaterCleanupProgress(result);
    this.advanceChallenge(0, result);
  }

  private acceptsPieceInput(): boolean {
    return this.playback === null && this.game.state === "playing" && this.game.active !== null;
  }

  private getPresentedState(): GameState {
    if (!this.playback) return this.game.state;
    return this.game.state === "paused" ? "paused" : "resolving";
  }

  /** Next Drop during playback: the piece waiting to appear comes first. */
  private getPlaybackPreviews(): NextPiecePreview[] {
    const upcoming = this.game.active;
    const previews = this.game.nextPreviews;
    if (!upcoming) return previews;
    const first: NextPiecePreview =
      upcoming.kind === "juiceDrop" ? { kind: "juiceDrop", fruit: upcoming.axis.fruit } : { kind: "fruitPair", pair: [upcoming.axis.fruit, upcoming.satellite.fruit] };
    return [first, ...previews.slice(0, previews.length - 1)];
  }

  private startPlayback(report: ResolveReport, result: GameSessionCommandResult): void {
    const timeline = buildResolvePlayback(report.frames);
    if (!timeline) return;
    this.playback = { timeline, elapsedMs: 0, stepIndex: 0 };
    this.presentationStep += 1;
    const first = timeline.steps[0];
    result.sounds.push(...first.sounds);
    result.effects.push(...first.effects);
  }

  private tickPlayback(deltaMs: number): GameSessionCommandResult {
    const playback = this.playback;
    if (!playback || this.game.state === "paused") return NO_RESULT;
    const result = createResult();
    if (this.game.state === "playing") {
      this.advanceChallenge(deltaMs, result);
      this.advanceProgression(deltaMs, result);
    }
    playback.elapsedMs += deltaMs;
    const { steps, durationMs } = playback.timeline;
    while (playback.stepIndex + 1 < steps.length && steps[playback.stepIndex + 1].atMs <= playback.elapsedMs) {
      playback.stepIndex += 1;
      this.presentationStep += 1;
      const step = steps[playback.stepIndex];
      result.sounds.push(...step.sounds);
      result.effects.push(...step.effects);
      result.shouldRender = true;
    }
    if (playback.elapsedMs >= durationMs) {
      this.playback = null;
      this.presentationStep += 1;
      this.dropTimer = 0;
      result.shouldRender = true;
      result.shouldUpdateHud = true;
    }
    return result;
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
    this.stats = completePlayerStats(this.stats, this.game.score, this.challenge.runBestChain, new Date(), this.recordScope);
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
