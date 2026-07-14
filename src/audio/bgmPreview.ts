import * as Tone from "tone";
import type { BgmMoment, GameModeId, ProgressionStage } from "../core";
import { BGM_BASS, BGM_DRUMS, BGM_JUICE, BGM_LOOP_BARS, BGM_MELODY, BGM_STAGE_BPMS, type BeatDuration, type BgmDrumHit, type BgmNote } from "./bgmComposition";

const MODE_MIX: Record<GameModeId, { tempo: number; melody: number; bass: number; drums: number }> = {
  normal: { tempo: 0, melody: -4, bass: -4, drums: -7 },
  scoreAttack: { tempo: 6, melody: -3, bass: -3, drums: -4 },
  chainChallenge: { tempo: 3, melody: -2, bass: -4, drums: -6 },
  waterCleanup: { tempo: -2, melody: -5, bass: -2, drums: -5 },
};

export class BgmPreview {
  private readonly output = new Tone.Volume(volumeToDb(0.45)).toDestination();
  private readonly melody = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "square" },
    envelope: { attack: 0.004, decay: 0.06, sustain: 0.18, release: 0.08 },
  }).connect(this.output);
  private readonly bass = new Tone.MonoSynth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.004, decay: 0.08, sustain: 0.15, release: 0.08 },
    filterEnvelope: { attack: 0.004, decay: 0.08, sustain: 0.25, release: 0.08, baseFrequency: 140, octaves: 2 },
  }).connect(this.output);
  private readonly juice = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
    envelope: { attack: 0.003, decay: 0.12, sustain: 0.05, release: 0.18 },
  }).connect(this.output);
  private readonly kick = new Tone.MembraneSynth({
    pitchDecay: 0.022,
    octaves: 3,
    envelope: { attack: 0.001, decay: 0.11, sustain: 0, release: 0.04 },
  }).connect(this.output);
  private readonly snare = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.002, decay: 0.07, sustain: 0, release: 0.025 },
  }).connect(this.output);
  private readonly hat = new Tone.NoiseSynth({
    noise: { type: "pink" },
    envelope: { attack: 0.001, decay: 0.025, sustain: 0, release: 0.012 },
  }).connect(this.output);
  private readonly melodyPart = new Tone.Part<[string, BgmNote]>((time, note) => {
    this.melody.triggerAttackRelease(note.pitch, durationToTone(note.duration), time, note.velocity);
  }, BGM_MELODY.map((note) => [beatToTone(note.beat), note]));
  private readonly bassPart = new Tone.Part<[string, BgmNote]>((time, note) => {
    this.bass.triggerAttackRelease(note.pitch, durationToTone(note.duration), time, note.velocity);
  }, BGM_BASS.map((note) => [beatToTone(note.beat), note]));
  private readonly drumPart = new Tone.Part<[string, BgmDrumHit]>((time, hit) => {
    this.playDrum(hit, time);
  }, BGM_DRUMS.map((hit) => [beatToTone(hit.beat), hit]));
  private readonly juicePart = new Tone.Part<[string, BgmNote]>((time, note) => {
    this.juice.triggerAttackRelease(note.pitch, durationToTone(note.duration), time, note.velocity);
  }, BGM_JUICE.map((note) => [beatToTone(note.beat), note]));
  private started = false;
  private stage: ProgressionStage = 0;
  private mode: GameModeId = "normal";
  private moment: BgmMoment = "flow";

  constructor(volume: number) {
    this.setVolume(volume);
    for (const part of [this.melodyPart, this.bassPart, this.drumPart, this.juicePart]) {
      part.loop = true;
      part.loopEnd = `${BGM_LOOP_BARS}:0:0`;
    }
    this.applyMix(true);
  }

  async unlock(): Promise<void> {
    await Tone.start();
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    Tone.Transport.bpm.value = this.targetBpm();
    Tone.Transport.position = 0;
    this.melodyPart.start(0);
    this.bassPart.start(0);
    this.drumPart.start(0);
    this.juicePart.start(0);
    if (Tone.Transport.state !== "started") {
      Tone.Transport.start();
    }
  }

  stop(): void {
    this.started = false;
    this.melodyPart.stop();
    this.bassPart.stop();
    this.drumPart.stop();
    this.juicePart.stop();
    Tone.Transport.stop();
    Tone.Transport.position = 0;
  }

  setVolume(volume: number): void {
    this.output.volume.value = volumeToDb(volume);
  }

  setStage(stage: ProgressionStage): void {
    this.stage = stage;
    this.applyTempo();
  }

  setContext(mode: GameModeId, moment: BgmMoment): void {
    this.mode = mode;
    this.moment = moment;
    this.applyTempo();
    this.applyMix(false);
  }

  private playDrum(hit: BgmDrumHit, time: number): void {
    if (hit.drum === "kick") {
      this.kick.triggerAttackRelease("C2", durationToTone(hit.duration), time, hit.velocity);
      return;
    }
    if (hit.drum === "snare") {
      this.snare.triggerAttackRelease(durationToTone(hit.duration), time, hit.velocity * 0.55);
      return;
    }
    this.hat.triggerAttackRelease(durationToTone(hit.duration), time, hit.velocity * 0.35);
  }

  private applyTempo(): void {
    const bpm = this.targetBpm();
    if (this.started) {
      Tone.Transport.bpm.rampTo(bpm, 0.3);
    } else {
      Tone.Transport.bpm.value = bpm;
    }
  }

  private targetBpm(): number {
    const momentBoost = this.moment === "juiceDrop" ? 4 : this.moment === "pressReady" ? 2 : 0;
    return BGM_STAGE_BPMS[this.stage] + MODE_MIX[this.mode].tempo + momentBoost;
  }

  private applyMix(immediate: boolean): void {
    const mix = MODE_MIX[this.mode];
    const juiceVolume = this.moment === "juiceDrop" ? -4 : this.moment === "pressReady" ? -15 : -100;
    const melodyVolume = mix.melody + (this.moment === "flow" ? 0 : 1.5);
    const drumsVolume = mix.drums + (this.moment === "juiceDrop" ? 3 : this.moment === "pressReady" ? 1 : 0);
    if (immediate) {
      this.melody.volume.value = melodyVolume;
      this.bass.volume.value = mix.bass;
      this.kick.volume.value = drumsVolume;
      this.snare.volume.value = drumsVolume;
      this.hat.volume.value = drumsVolume;
      this.juice.volume.value = juiceVolume;
      return;
    }
    this.melody.volume.rampTo(melodyVolume, 0.22);
    this.bass.volume.rampTo(mix.bass, 0.22);
    this.kick.volume.rampTo(drumsVolume, 0.22);
    this.snare.volume.rampTo(drumsVolume, 0.22);
    this.hat.volume.rampTo(drumsVolume, 0.22);
    this.juice.volume.rampTo(juiceVolume, 0.22);
  }
}

function beatToTone(value: number): string {
  const bar = Math.floor(value / 4);
  const beat = value % 4;
  const quarter = Math.floor(beat);
  const sixteenth = Math.round((beat - quarter) * 4);
  return `${bar}:${quarter}:${sixteenth}`;
}

function durationToTone(duration: BeatDuration): string {
  if (duration === 0.25) return "16n";
  if (duration === 0.5) return "8n";
  if (duration === 1) return "4n";
  return "2n";
}

function volumeToDb(value: number): number {
  if (value <= 0) return -100;
  return -34 + 20 * Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
