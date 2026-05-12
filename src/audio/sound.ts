import { sfxr } from "jsfxr";
import type { Fruit, GameState, ProgressionStage } from "../core";
import { BgmPreview } from "./bgmPreview";
import { SFX_DEFINITIONS, type SfxKey } from "./sfxCatalog";

export class SoundEngine {
  enabled = true;
  sfxVolume = 0.8;
  bgmVolume = 0.45;

  private unlocked = false;
  private sfxContext: AudioContext | null = null;
  private sfxOutput: GainNode | null = null;
  private sfxBuffers: Partial<Record<SfxKey, AudioBuffer>> = {};
  private bgmPreview: BgmPreview | null = null;
  private bgmStage: ProgressionStage = 0;

  toggle(): void {
    this.enabled = !this.enabled;
    if (this.enabled) {
      void this.unlock().then(() => {
        this.tick();
      });
    } else {
      this.stopBgm();
    }
  }

  async unlock(): Promise<void> {
    if (!this.enabled) return;
    this.ensureNodes();
    await this.sfxContext?.resume();
    await this.bgmPreview?.unlock();
    this.unlocked = true;
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

  tick(): void {
    if (!this.canPlay()) return;
    this.playSfx("tick");
  }

  pop(): void {
    if (!this.canPlay()) return;
    this.playSfx("pop");
  }

  tap(): void {
    if (!this.canPlay()) return;
    this.playSfx("tap", { gain: 0.025, playbackRate: 1.12 });
  }

  whoosh(strength = 0.35): void {
    if (!this.canPlay()) return;
    this.playSfx("whoosh", { gain: Math.min(1.2, 0.7 + strength * 0.7), playbackRate: 0.9 + strength * 0.25 });
  }

  splash(chain: number, fruit: Fruit): void {
    if (!this.canPlay()) return;
    const capped = Math.min(4, chain);
    const fruitPitch = fruitPlaybackRate(fruit);
    this.playSfx("splash", { gain: 0.72 + capped * 0.05, playbackRate: fruitPitch * (0.88 + capped * 0.03) });
    if (chain >= 2) {
      this.playSfx("splashChain", { delay: 0.07, gain: 0.6 + capped * 0.04, playbackRate: fruitPitch * (0.94 + capped * 0.05) });
    }
    if (chain >= 3) {
      this.playSfx("sparkleChain", { delay: 0.17, gain: 0.5, playbackRate: fruitPitch * (1 + capped * 0.04) });
    }
  }

  sparkle(chain: number): void {
    if (!this.canPlay()) return;
    const count = Math.min(chain + 2, chain >= 3 ? 6 : 5);
    for (let index = 0; index < count; index += 1) {
      this.playSfx(chain >= 3 ? "sparkleChain" : "sparkle", {
        delay: index * (chain >= 3 ? 0.035 : 0.045),
        gain: 0.5,
        playbackRate: 0.88 + index * 0.08 + Math.min(chain, 4) * 0.03,
      });
    }
  }

  pour(): void {
    if (!this.canPlay()) return;
    this.playSfx("pour");
  }

  shipment(totalStock: number): void {
    if (!this.canPlay()) return;
    const boost = Math.min(0.12, totalStock * 0.012);
    this.playSfx("shipmentLow", { gain: 0.9 + boost });
    this.playSfx("shipmentHigh", { delay: 0.08, gain: 0.9 + boost, playbackRate: 1.03 });
    this.playSfx("shipmentHigh", { delay: 0.22, gain: 0.75 + boost, playbackRate: 1.24 });
  }

  fanfare(): void {
    if (!this.canPlay()) return;
    this.stopBgm();
    this.playSfx("fanfareLow", { gain: 0.95, playbackRate: 0.92 });
    this.playSfx("fanfareMid", { delay: 0.11, gain: 1, playbackRate: 1.05 });
    this.playSfx("fanfareHigh", { delay: 0.24, gain: 1.08, playbackRate: 1.12 });
    this.playSfx("sparkleChain", { delay: 0.42, gain: 0.82, playbackRate: 1.24 });
    this.playSfx("fanfareHigh", { delay: 0.58, gain: 0.9, playbackRate: 1.34 });
  }

  gameOver(): void {
    if (!this.canPlay()) return;
    this.playSfx("gameOver");
    this.playSfx("gameOver", { delay: 0.14, gain: 0.85, playbackRate: 0.76 });
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
    if (this.sfxOutput && this.bgmPreview) return;

    this.sfxContext ??= new AudioContext();
    this.sfxOutput ??= this.sfxContext.createGain();
    this.sfxOutput.connect(this.sfxContext.destination);
    this.cacheSfxBuffers();
    this.bgmPreview ??= new BgmPreview(this.bgmVolume);
    this.bgmPreview.setStage(this.bgmStage);
    this.applyVolumes();
  }

  private startBgm(): void {
    if (!this.enabled || !this.unlocked) return;
    this.ensureNodes();
    this.bgmPreview?.start();
  }

  private stopBgm(): void {
    this.bgmPreview?.stop();
  }

  private applyVolumes(): void {
    if (this.sfxOutput) this.sfxOutput.gain.value = this.sfxVolume <= 0 ? 0 : 0.52 * clamp01(this.sfxVolume);
    this.bgmPreview?.setVolume(this.bgmVolume);
  }

  private cacheSfxBuffers(): void {
    if (!this.sfxContext) return;
    for (const key of Object.keys(SFX_DEFINITIONS) as SfxKey[]) {
      if (this.sfxBuffers[key]) continue;
      this.sfxBuffers[key] = sfxr.toWebAudio(SFX_DEFINITIONS[key], this.sfxContext).buffer ?? undefined;
    }
  }

  private playSfx(key: SfxKey, options: { delay?: number; gain?: number; playbackRate?: number } = {}): void {
    if (!this.sfxContext || !this.sfxOutput) return;
    const buffer = this.sfxBuffers[key];
    if (!buffer) return;

    const source = this.sfxContext.createBufferSource();
    const gain = this.sfxContext.createGain();
    const startTime = this.sfxContext.currentTime + (options.delay ?? 0);
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(options.playbackRate ?? 1, startTime);
    gain.gain.setValueAtTime(options.gain ?? 1, startTime);
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

function fruitPlaybackRate(fruit: Fruit): number {
  if (fruit === "apple") return 0.92;
  if (fruit === "orange") return 0.98;
  if (fruit === "lemon") return 1.08;
  if (fruit === "grape") return 0.86;
  if (fruit === "melon") return 0.9;
  return 1.14;
}
