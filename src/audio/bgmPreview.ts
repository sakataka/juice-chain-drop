import * as Tone from "tone";
import type { BgmMoment, GameModeId, ProgressionStage } from "../core";
import { BGM_BASS, BGM_DRUMS, BGM_JUICE, BGM_LOOP_BARS, BGM_MELODY, BGM_PAD, BGM_STAGE_BPMS, type BeatDuration, type BgmDrumHit, type BgmNote } from "./bgmComposition";

const MODE_MIX: Record<GameModeId, { tempo: number; melody: number; bass: number; drums: number }> = {
  normal: { tempo: 0, melody: -3, bass: -5, drums: -9 },
  scoreAttack: { tempo: 6, melody: -2, bass: -4, drums: -6 },
  chainChallenge: { tempo: 3, melody: -2, bass: -5, drums: -8 },
  waterCleanup: { tempo: -2, melody: -4, bass: -4, drums: -8 },
};

/** Light swing on eighth notes gives the workshop tune its easy, hand-played feel. */
const SWING = 0.14;

export class BgmPreview {
  private readonly output = new Tone.Volume(volumeToDb(0.45)).toDestination();
  private readonly room = new Tone.Reverb({ decay: 2.4, preDelay: 0.02, wet: 0.22 }).connect(this.output);
  /** Warm FM mallet, somewhere between a marimba and a celesta. */
  private readonly melody = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 3.01,
    modulationIndex: 6,
    oscillator: { type: "sine" },
    modulation: { type: "sine" },
    envelope: { attack: 0.003, decay: 0.55, sustain: 0.06, release: 0.45 },
    modulationEnvelope: { attack: 0.002, decay: 0.18, sustain: 0, release: 0.2 },
  }).connect(this.room);
  private readonly padFilter = new Tone.Filter({ type: "lowpass", frequency: 1400, Q: 0.4 }).connect(this.room);
  private readonly pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "fattriangle", count: 3, spread: 18 },
    envelope: { attack: 0.35, decay: 0.4, sustain: 0.55, release: 1.1 },
  }).connect(this.padFilter);
  private readonly bass = new Tone.MonoSynth({
    oscillator: { type: "sine" },
    envelope: { attack: 0.006, decay: 0.25, sustain: 0.35, release: 0.12 },
    filterEnvelope: { attack: 0.004, decay: 0.12, sustain: 0.3, release: 0.1, baseFrequency: 180, octaves: 1.6 },
  }).connect(this.output);
  private readonly bubbleDelay = new Tone.FeedbackDelay({ delayTime: "8n.", feedback: 0.22, wet: 0.25 }).connect(this.room);
  private readonly juice = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
    envelope: { attack: 0.002, decay: 0.14, sustain: 0, release: 0.2 },
  }).connect(this.bubbleDelay);
  private readonly kick = new Tone.MembraneSynth({
    pitchDecay: 0.03,
    octaves: 4,
    envelope: { attack: 0.001, decay: 0.22, sustain: 0, release: 0.05 },
  }).connect(this.output);
  /** Short woody click standing in for a snare. */
  private readonly rim = new Tone.MembraneSynth({
    pitchDecay: 0.004,
    octaves: 1.5,
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
  }).connect(this.room);
  private readonly shakerFilter = new Tone.Filter({ type: "highpass", frequency: 6500 }).connect(this.output);
  private readonly shaker = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.004, decay: 0.04, sustain: 0, release: 0.02 },
  }).connect(this.shakerFilter);
  private readonly melodyPart = new Tone.Part<[string, BgmNote]>((time, note) => {
    this.melody.triggerAttackRelease(note.pitch, beatsToTone(note.duration), time, note.velocity);
  }, BGM_MELODY.map((note) => [beatToTone(note.beat), note]));
  private readonly padPart = new Tone.Part<[string, BgmNote]>((time, note) => {
    this.pad.triggerAttackRelease(note.pitch, beatsToTone(note.duration), time, note.velocity);
  }, BGM_PAD.map((note) => [beatToTone(note.beat), note]));
  private readonly bassPart = new Tone.Part<[string, BgmNote]>((time, note) => {
    this.bass.triggerAttackRelease(note.pitch, beatsToTone(note.duration), time, note.velocity);
  }, BGM_BASS.map((note) => [beatToTone(note.beat), note]));
  private readonly drumPart = new Tone.Part<[string, BgmDrumHit]>((time, hit) => {
    this.playDrum(hit, time);
  }, BGM_DRUMS.map((hit) => [beatToTone(hit.beat), hit]));
  private readonly juicePart = new Tone.Part<[string, BgmNote]>((time, note) => {
    this.juice.triggerAttackRelease(note.pitch, beatsToTone(note.duration), time, note.velocity);
  }, BGM_JUICE.map((note) => [beatToTone(note.beat), note]));
  private readonly parts = [this.melodyPart, this.padPart, this.bassPart, this.drumPart, this.juicePart];
  private started = false;
  private stage: ProgressionStage = 0;
  private mode: GameModeId = "normal";
  private moment: BgmMoment = "flow";

  constructor(volume: number) {
    this.setVolume(volume);
    for (const part of this.parts) {
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
    Tone.getTransport().bpm.value = this.targetBpm();
    Tone.getTransport().swing = SWING;
    Tone.getTransport().swingSubdivision = "8n";
    Tone.getTransport().position = 0;
    for (const part of this.parts) part.start(0);
    if (Tone.getTransport().state !== "started") {
      Tone.getTransport().start();
    }
  }

  stop(): void {
    this.started = false;
    for (const part of this.parts) part.stop();
    this.pad.releaseAll();
    Tone.getTransport().stop();
    Tone.getTransport().position = 0;
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
      this.kick.triggerAttackRelease("A1", beatsToTone(hit.duration), time, hit.velocity);
      return;
    }
    if (hit.drum === "rim") {
      this.rim.triggerAttackRelease("E5", beatsToTone(hit.duration), time, hit.velocity * 0.7);
      return;
    }
    this.shaker.triggerAttackRelease(beatsToTone(hit.duration), time, hit.velocity * 0.4);
  }

  private applyTempo(): void {
    const bpm = this.targetBpm();
    if (this.started) {
      Tone.getTransport().bpm.rampTo(bpm, 0.3);
    } else {
      Tone.getTransport().bpm.value = bpm;
    }
  }

  private targetBpm(): number {
    const momentBoost = this.moment === "juiceDrop" ? 4 : this.moment === "pressReady" ? 2 : 0;
    return BGM_STAGE_BPMS[this.stage] + MODE_MIX[this.mode].tempo + momentBoost;
  }

  private applyMix(immediate: boolean): void {
    const mix = MODE_MIX[this.mode];
    // A ready bottle adds the bubbling arpeggio; a falling one also pushes the rhythm forward.
    const juiceVolume = this.moment === "juiceDrop" ? -8 : this.moment === "pressReady" ? -16 : -100;
    const melodyVolume = mix.melody + (this.moment === "flow" ? 0 : 1);
    const padVolume = mix.melody - 10 + (this.moment === "juiceDrop" ? -2 : 0);
    const drumsVolume = mix.drums + (this.moment === "juiceDrop" ? 4 : this.moment === "pressReady" ? 1.5 : 0);
    const levels: Array<[{ volume: Tone.Param<"decibels"> }, number]> = [
      [this.melody, melodyVolume],
      [this.pad, padVolume],
      [this.bass, mix.bass],
      [this.kick, drumsVolume],
      [this.rim, drumsVolume - 3],
      [this.shaker, drumsVolume - 4],
      [this.juice, juiceVolume],
    ];
    for (const [node, level] of levels) {
      if (immediate) node.volume.value = level;
      else node.volume.rampTo(level, 0.3);
    }
  }
}

function beatToTone(value: number): string {
  const bar = Math.floor(value / 4);
  const beat = value % 4;
  const quarter = Math.floor(beat);
  const sixteenth = Math.round((beat - quarter) * 4);
  return `${bar}:${quarter}:${sixteenth}`;
}

/** Beat lengths as bars:quarters:sixteenths so dotted and tied values stay exact. */
function beatsToTone(beats: BeatDuration): string {
  const sixteenths = Math.max(1, Math.round(beats * 4));
  return `${Math.floor(sixteenths / 16)}:${Math.floor((sixteenths % 16) / 4)}:${sixteenths % 4}`;
}

function volumeToDb(value: number): number {
  if (value <= 0) return -100;
  return -34 + 20 * Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
