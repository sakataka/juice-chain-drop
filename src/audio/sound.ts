import type { BgmMoment, Fruit, GameModeId, GameState, ProgressionStage } from "../core";
import type { BgmPreview } from "./bgmPreview";
import { loadSfxPack } from "./sfxPack";
import type { SfxKey, SfxPack } from "./sfxPack";

export class SoundEngine {
  enabled = true;
  sfxVolume = 0.8;
  bgmVolume = 0.45;

  private unlocked = false;
  private sfxContext: AudioContext | null = null;
  private sfxOutput: GainNode | null = null;
  private sfxPack: SfxPack = new Map();
  private sfxLoad: Promise<void> | null = null;
  private bgmPreview: BgmPreview | null = null;
  /** Tone.js is large, so the BGM engine is fetched only once sound is first unlocked. */
  private bgmLoad: Promise<void> | null = null;
  private bgmWanted = false;
  private bgmStage: ProgressionStage = 0;
  private bgmMode: GameModeId = "normal";
  private bgmMoment: BgmMoment = "flow";

  toggle(): void {
    this.enabled = !this.enabled;
    if (this.enabled) {
      void this.unlock().then(() => {
        this.move();
      });
    } else {
      this.stopBgm();
    }
  }

  async unlock(): Promise<void> {
    if (!this.enabled) return;
    this.ensureNodes();
    const sfxUnlock = Promise.all([this.sfxContext?.resume(), this.loadSfx()]);
    const bgmUnlock = this.loadBgm().then(() => this.bgmPreview?.unlock());
    await Promise.all([sfxUnlock, bgmUnlock]);
    this.unlocked = true;
    if (this.bgmWanted) this.bgmPreview?.start();
  }

  /** Keys of the effect pack that decoded successfully; exposed for the debug hook. */
  get loadedSfxKeys(): string[] {
    return [...this.sfxPack.keys()];
  }

  setSfxVolume(value: number): void {
    this.sfxVolume = clamp01(value);
    this.applyVolumes();
  }

  setBgmVolume(value: number): void {
    this.bgmVolume = clamp01(value);
    this.applyVolumes();
  }

  setBgmStage(stage: ProgressionStage): void {
    this.bgmStage = stage;
    this.bgmPreview?.setStage(stage);
  }

  setBgmContext(mode: GameModeId, moment: BgmMoment): void {
    this.bgmMode = mode;
    this.bgmMoment = moment;
    this.bgmPreview?.setContext(mode, moment);
  }

  move(): void {
    this.play("move", { gain: 0.7 });
  }

  rotate(): void {
    this.play("rotate", { gain: 0.8 });
  }

  softDrop(): void {
    this.play("soft_drop", { gain: 0.45 });
  }

  land(): void {
    this.play("land", { gain: 0.85 });
  }

  /** Each chain step squishes a little higher, tinted by the fruit that popped. */
  squish(chain: number, fruit: Fruit): void {
    this.play("squish", { rate: FRUIT_PITCH[fruit] * semitones(Math.min(chain - 1, 7) * 1.5), gain: 0.9 + Math.min(chain, 5) * 0.03 });
  }

  /** The combo chime climbs a whole tone per chain step, so long chains audibly build. */
  chainChime(chain: number): void {
    this.play("chain_chime", { rate: semitones(Math.min(chain - 2, 8) * 2), gain: 0.75 });
  }

  bottleFill(): void {
    this.play("bottle_fill", { gain: 0.9 });
  }

  bottleBurst(): void {
    this.play("bottle_burst", { gain: 1 });
  }

  waterDrop(): void {
    this.play("water_drop", { gain: 0.8 });
  }

  waterClear(): void {
    this.play("water_clear", { gain: 0.85 });
  }

  stageUp(): void {
    this.play("stage_up", { gain: 0.7 });
  }

  fanfare(): void {
    this.stopBgm();
    this.play("clear_fanfare", { gain: 1 });
  }

  gameOver(): void {
    this.play("game_over", { gain: 0.9 });
  }

  syncGameState(state: GameState, bgmStage: ProgressionStage = 0): void {
    this.setBgmStage(bgmStage);
    if (!this.enabled || !this.unlocked) return;
    if (state === "paused") {
      this.stopBgm();
      return;
    }
    if (state === "gameover") {
      this.stopBgm();
      return;
    }
    if (state === "playing" || state === "resolving") {
      this.startBgm();
    }
  }

  private canPlay(): boolean {
    if (!this.enabled) return false;
    this.ensureNodes();
    return this.unlocked;
  }

  private ensureNodes(): void {
    if (this.sfxOutput) return;

    this.sfxContext ??= new AudioContext();
    this.sfxOutput ??= this.sfxContext.createGain();
    this.sfxOutput.connect(this.sfxContext.destination);
    this.applyVolumes();
  }

  private loadBgm(): Promise<void> {
    this.bgmLoad ??= import("./bgmPreview").then(({ BgmPreview }) => {
      this.bgmPreview = new BgmPreview(this.bgmVolume);
      this.bgmPreview.setStage(this.bgmStage);
      this.bgmPreview.setContext(this.bgmMode, this.bgmMoment);
      this.applyVolumes();
    });
    return this.bgmLoad;
  }

  private startBgm(): void {
    if (!this.enabled || !this.unlocked) return;
    this.ensureNodes();
    this.bgmWanted = true;
    if (this.bgmPreview) this.bgmPreview.start();
    else void this.loadBgm().then(() => {
      if (this.bgmWanted && this.enabled) this.bgmPreview?.start();
    });
  }

  private stopBgm(): void {
    this.bgmWanted = false;
    this.bgmPreview?.stop();
  }

  private applyVolumes(): void {
    if (this.sfxOutput) this.sfxOutput.gain.value = this.sfxVolume <= 0 ? 0 : 0.52 * clamp01(this.sfxVolume);
    this.bgmPreview?.setVolume(this.bgmVolume);
  }

  private loadSfx(): Promise<void> {
    if (!this.sfxContext) return Promise.resolve();
    this.sfxLoad ??= loadSfxPack(this.sfxContext)
      .then((pack) => {
        this.sfxPack = pack;
      })
      .catch(() => undefined);
    return this.sfxLoad;
  }

  private play(key: SfxKey, options: { gain?: number; rate?: number; delay?: number } = {}): void {
    if (!this.canPlay() || !this.sfxContext || !this.sfxOutput) return;
    const entry = this.sfxPack.get(key);
    if (!entry) return;
    const source = this.sfxContext.createBufferSource();
    const gain = this.sfxContext.createGain();
    const startTime = this.sfxContext.currentTime + (options.delay ?? 0);
    source.buffer = entry.buffers[Math.floor(Math.random() * entry.buffers.length)];
    source.playbackRate.value = (options.rate ?? 1) * (1 + (Math.random() * 2 - 1) * entry.pitchJitter);
    gain.gain.value = (options.gain ?? 1) * (1 + (Math.random() * 2 - 1) * entry.volumeJitter);
    source.connect(gain);
    gain.connect(this.sfxOutput);
    source.start(startTime);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function semitones(steps: number): number {
  return 2 ** (Math.max(0, steps) / 12);
}

/** Small per-fruit pitch offsets so different fruit popping together do not sound identical. */
const FRUIT_PITCH: Record<Fruit, number> = {
  apple: semitones(0),
  orange: semitones(1),
  lemon: semitones(3),
  grape: 2 ** (-2 / 12),
  melon: 2 ** (-1 / 12),
  berry: semitones(4),
};
