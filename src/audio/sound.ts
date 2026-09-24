import { sfxr } from "jsfxr";
import type { BgmMoment, Fruit, GameModeId, GameState, ProgressionStage } from "../core";
import type { BgmPreview } from "./bgmPreview";
import { loadSfxPack } from "./sfxPack";
import type { SfxKey, SfxPack } from "./sfxPack";
import { SFX_DEFINITIONS, type SynthSfxKey } from "./sfxCatalog";

/** Generated samples only cover the cues the synthesized set never had. */
const SAMPLE_KEYS: SfxKey[] = ["bottle_burst", "water_drop", "water_clear", "stage_up"];

export class SoundEngine {
  enabled = true;
  sfxVolume = 0.8;
  bgmVolume = 0.45;

  private unlocked = false;
  private sfxContext: AudioContext | null = null;
  private sfxOutput: GainNode | null = null;
  private sfxPack: SfxPack = new Map();
  private synthBuffers: Partial<Record<SynthSfxKey, AudioBuffer>> = {};
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

  // The juicy character comes from layering short synthesized hits with a falling sine
  // "bloop" (liquidNote), pitched by fruit and chain step. Keep that layer on every wet cue.

  move(): void {
    this.playSynth("tick");
  }

  rotate(): void {
    this.playSynth("pop");
  }

  softDrop(): void {
    this.playSynth("whoosh", { gain: 0.85, rate: 0.95 });
  }

  land(): void {
    if (!this.canPlay()) return;
    this.playSynth("tap", { gain: 0.025, rate: 1.12 });
    this.liquidNote(240, 0, 0.12, 0.12);
  }

  squish(chain: number, fruit: Fruit): void {
    if (!this.canPlay()) return;
    const capped = Math.min(4, chain);
    const fruitPitch = FRUIT_PITCH[fruit];
    this.liquidNote(340 * fruitPitch, 0, 0.17, 0.22);
    this.liquidNote(510 * fruitPitch, 0.075, 0.12, 0.12);
    this.playSynth("splash", { gain: 0.72 + capped * 0.05, rate: fruitPitch * (0.88 + capped * 0.03) });
    if (chain >= 2) this.playSynth("splashChain", { delay: 0.07, gain: 0.6 + capped * 0.04, rate: fruitPitch * (0.94 + capped * 0.05) });
    if (chain >= 3) this.playSynth("sparkleChain", { delay: 0.17, gain: 0.5, rate: fruitPitch * (1 + capped * 0.04) });
  }

  /** A rising sparkle cascade that gets longer and brighter with each chain step. */
  chainChime(chain: number): void {
    if (!this.canPlay()) return;
    const count = Math.min(chain + 2, chain >= 3 ? 6 : 5);
    for (let index = 0; index < count; index += 1) {
      this.playSynth(chain >= 3 ? "sparkleChain" : "sparkle", {
        delay: index * (chain >= 3 ? 0.035 : 0.045),
        gain: 0.5,
        rate: 0.88 + index * 0.08 + Math.min(chain, 4) * 0.03,
      });
    }
  }

  bottleFill(): void {
    if (!this.canPlay()) return;
    this.playSynth("pour", { gain: 0.65 });
    this.pourNotes(1);
  }

  bottleBurst(): void {
    if (!this.canPlay()) return;
    this.playSynth("pour", { gain: 0.65 });
    this.playSample("bottle_burst", { gain: 0.55 });
    this.pourNotes(0.9);
  }

  waterDrop(): void {
    if (!this.canPlay()) return;
    this.playSample("water_drop", { gain: 0.6 });
    this.liquidNote(620, 0, 0.14, 0.14);
  }

  waterClear(): void {
    if (!this.canPlay()) return;
    this.playSample("water_clear", { gain: 0.6 });
    this.liquidNote(420, 0, 0.15, 0.14);
    this.liquidNote(700, 0.08, 0.12, 0.1);
  }

  stageUp(): void {
    this.playSample("stage_up", { gain: 0.6 });
  }

  fanfare(): void {
    if (!this.canPlay()) return;
    this.stopBgm();
    this.playSynth("fanfareLow", { gain: 0.95, rate: 0.92 });
    this.playSynth("fanfareMid", { delay: 0.11, gain: 1, rate: 1.05 });
    this.playSynth("fanfareHigh", { delay: 0.24, gain: 1.08, rate: 1.12 });
    this.playSynth("sparkleChain", { delay: 0.42, gain: 0.82, rate: 1.24 });
    this.playSynth("fanfareHigh", { delay: 0.58, gain: 0.9, rate: 1.34 });
  }

  gameOver(): void {
    if (!this.canPlay()) return;
    this.playSynth("gameOver");
    this.playSynth("gameOver", { delay: 0.14, gain: 0.85, rate: 0.76 });
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
    for (const key of Object.keys(SFX_DEFINITIONS) as SynthSfxKey[]) {
      this.synthBuffers[key] ??= sfxr.toWebAudio(SFX_DEFINITIONS[key], this.sfxContext).buffer ?? undefined;
    }
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
    this.sfxLoad ??= loadSfxPack(this.sfxContext, SAMPLE_KEYS)
      .then((pack) => {
        this.sfxPack = pack;
      })
      .catch(() => undefined);
    return this.sfxLoad;
  }

  private playSample(key: SfxKey, options: PlayOptions = {}): void {
    const entry = this.sfxPack.get(key);
    if (!entry) return;
    const buffer = entry.buffers[Math.floor(Math.random() * entry.buffers.length)];
    const rate = (options.rate ?? 1) * (1 + (Math.random() * 2 - 1) * entry.pitchJitter);
    const gain = (options.gain ?? 1) * (1 + (Math.random() * 2 - 1) * entry.volumeJitter);
    this.playBuffer(buffer, { ...options, rate, gain });
  }

  private playSynth(key: SynthSfxKey, options: PlayOptions = {}): void {
    const buffer = this.synthBuffers[key];
    if (buffer) this.playBuffer(buffer, options);
  }

  private playBuffer(buffer: AudioBuffer, options: PlayOptions): void {
    if (!this.canPlay() || !this.sfxContext || !this.sfxOutput) return;
    const source = this.sfxContext.createBufferSource();
    const gain = this.sfxContext.createGain();
    const startTime = this.sfxContext.currentTime + (options.delay ?? 0);
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(options.rate ?? 1, startTime);
    gain.gain.setValueAtTime(options.gain ?? 1, startTime);
    source.connect(gain);
    gain.connect(this.sfxOutput);
    source.start(startTime);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
  }

  private pourNotes(gainScale: number): void {
    this.liquidNote(320, 0, 0.16, 0.18 * gainScale);
    this.liquidNote(440, 0.1, 0.14, 0.15 * gainScale);
    this.liquidNote(680, 0.22, 0.12, 0.12 * gainScale);
  }

  /** A short resonant sine that drops in pitch: the "bloop" that makes cues sound wet. */
  private liquidNote(frequency: number, delay: number, duration: number, volume: number): void {
    if (!this.sfxContext || !this.sfxOutput) return;
    const oscillator = this.sfxContext.createOscillator();
    const envelope = this.sfxContext.createGain();
    const at = this.sfxContext.currentTime + delay;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency * 1.9, at);
    oscillator.frequency.exponentialRampToValueAtTime(frequency, at + duration * 0.2);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.55, at + duration);
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(volume, at + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.001, at + duration);
    oscillator.connect(envelope);
    envelope.connect(this.sfxOutput);
    oscillator.start(at);
    oscillator.stop(at + duration);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
    };
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

type PlayOptions = { gain?: number; rate?: number; delay?: number };

/** Per-fruit pitch so different fruit popping sound different (from the original liquid design). */
const FRUIT_PITCH: Record<Fruit, number> = {
  apple: 0.92,
  orange: 0.98,
  lemon: 1.08,
  grape: 0.86,
  melon: 0.9,
  berry: 1.14,
};
