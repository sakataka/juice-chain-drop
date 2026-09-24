/**
 * "Rush at the Press": an upbeat, straight-eighths workshop tune in F major.
 * 24 bars in three sections: A (the presses start), B (the line gets busy, 16th hats),
 * C (a brighter turn through the borrowed B-flat minor before the loop).
 * Data only; `bgmPreview.ts` plays it with Tone.js and `scripts/generate-bgm.ts` exports MIDI.
 */
export const BGM_BPM = 128;
export const BGM_STAGE_BPMS = [128, 134, 140, 146] as const;
export const BGM_LOOP_BARS = 24;
export const BGM_TICKS_PER_BEAT = 480;
const BGM_BEATS_PER_BAR = 4;

/** Note length in beats (quarter notes). */
export type BeatDuration = number;
type DrumName = "kick" | "snare" | "hat";

export type BgmNote = {
  beat: number;
  pitch: string;
  duration: BeatDuration;
  velocity: number;
};

export type BgmDrumHit = {
  beat: number;
  drum: DrumName;
  duration: BeatDuration;
  velocity: number;
};

type Chord = {
  /** Bass root and fifth, low register. */
  bass: [string, string];
  /** Close voicing for the pad around middle C. */
  pad: string[];
  /** Chord tones for the bubbling juice arpeggio, high register. */
  bubbles: string[];
};

const CHORDS = {
  F: { bass: ["F2", "C3"], pad: ["F3", "A3", "C4", "E4"], bubbles: ["F6", "A6", "C7", "A6"] },
  Dm7: { bass: ["D2", "A2"], pad: ["F3", "A3", "C4", "D4"], bubbles: ["D6", "F6", "A6", "F6"] },
  Bbmaj7: { bass: ["Bb1", "F2"], pad: ["F3", "A3", "Bb3", "D4"], bubbles: ["D6", "F6", "Bb6", "F6"] },
  C7: { bass: ["C2", "G2"], pad: ["E3", "G3", "Bb3", "C4"], bubbles: ["E6", "G6", "Bb6", "G6"] },
  Am7: { bass: ["A1", "E2"], pad: ["E3", "G3", "A3", "C4"], bubbles: ["E6", "A6", "C7", "A6"] },
  Bb: { bass: ["Bb1", "F2"], pad: ["F3", "Bb3", "D4"], bubbles: ["D6", "F6", "Bb6", "F6"] },
  C: { bass: ["C2", "G2"], pad: ["E3", "G3", "C4"], bubbles: ["E6", "G6", "C7", "G6"] },
  Am: { bass: ["A1", "E2"], pad: ["E3", "A3", "C4"], bubbles: ["E6", "A6", "C7", "A6"] },
  Dm: { bass: ["D2", "A2"], pad: ["F3", "A3", "D4"], bubbles: ["D6", "F6", "A6", "F6"] },
  Gm7: { bass: ["G1", "D2"], pad: ["F3", "G3", "Bb3", "D4"], bubbles: ["D6", "G6", "Bb6", "G6"] },
  Fmaj7: { bass: ["F2", "C3"], pad: ["E3", "F3", "A3", "C4"], bubbles: ["E6", "A6", "C7", "A6"] },
  F7: { bass: ["F2", "C3"], pad: ["Eb3", "F3", "A3", "C4"], bubbles: ["Eb6", "F6", "A6", "C7"] },
  Bbm: { bass: ["Bb1", "F2"], pad: ["F3", "Bb3", "Db4"], bubbles: ["Db6", "F6", "Bb6", "F6"] },
  FoverA: { bass: ["A1", "C2"], pad: ["F3", "A3", "C4"], bubbles: ["F6", "A6", "C7", "A6"] },
} satisfies Record<string, Chord>;

type ChordName = keyof typeof CHORDS;

/** One chord per bar, or two when a bar changes halfway. */
const PROGRESSION: Array<ChordName | [ChordName, ChordName]> = [
  "F", "Dm7", "Bbmaj7", "C7", "F", "Am7", ["Bb", "C"], "F",
  "Bb", "C", "Am", "Dm", "Gm7", "C7", "Fmaj7", "F7",
  "Bb", "Bbm", "FoverA", "Dm", "Gm7", "C", "F", "C7",
];

/** Melody as [beat within bar, pitch, length in beats]. */
type Phrase = Array<[number, string, number]>;

const MELODY: Phrase[] = [
  // A: the workshop wakes
  [[0, "C5", 1], [1, "A4", 0.5], [1.5, "C5", 0.5], [2, "F5", 1.5], [3.5, "E5", 0.5]],
  [[0, "D5", 1], [1, "C5", 0.5], [1.5, "A4", 0.5], [2, "D5", 2]],
  [[0, "Bb4", 0.5], [0.5, "D5", 0.5], [1, "F5", 1], [2, "E5", 0.5], [2.5, "D5", 0.5], [3, "C5", 1]],
  [[0, "E5", 1.5], [1.5, "G5", 0.5], [2, "Bb5", 1], [3, "G5", 1]],
  [[0, "A5", 1], [1, "G5", 0.5], [1.5, "F5", 0.5], [2, "C5", 1.5], [3.5, "A4", 0.5]],
  [[0, "C5", 1], [1, "E5", 1], [2, "G5", 1], [3, "E5", 1]],
  [[0, "F5", 1], [1, "D5", 1], [2, "E5", 1], [3, "G5", 1]],
  [[0, "F5", 3]],
  // B: the presses get busy
  [[0, "F5", 0.5], [0.5, "G5", 0.5], [1, "A5", 1], [2, "Bb5", 1], [3, "A5", 1]],
  [[0, "G5", 1.5], [1.5, "E5", 0.5], [2, "C5", 2]],
  [[0, "E5", 0.5], [0.5, "F5", 0.5], [1, "G5", 1], [2, "A5", 1], [3, "C6", 1]],
  [[0, "A5", 2], [2, "F5", 1], [3, "D5", 1]],
  [[0, "Bb5", 1], [1, "A5", 0.5], [1.5, "G5", 0.5], [2, "F5", 1], [3, "D5", 1]],
  [[0, "E5", 1], [1, "G5", 1], [2, "C6", 1], [3, "Bb5", 1]],
  [[0, "A5", 1.5], [1.5, "G5", 0.5], [2, "E5", 1], [3, "F5", 1]],
  [[0, "A5", 2], [2, "F5", 1], [3, "Eb5", 1]],
  // C: a dreamy turn
  [[0, "D5", 1], [1, "F5", 1], [2, "Bb5", 2]],
  [[0, "Db5", 1], [1, "F5", 1], [2, "Bb5", 2]],
  [[0, "A5", 1], [1, "G5", 0.5], [1.5, "F5", 0.5], [2, "C5", 2]],
  [[0, "D5", 0.5], [0.5, "E5", 0.5], [1, "F5", 1], [2, "A5", 2]],
  [[0, "G5", 1], [1, "F5", 0.5], [1.5, "D5", 0.5], [2, "Bb4", 2]],
  [[0, "C5", 1], [1, "E5", 1], [2, "G5", 1], [3, "C6", 1]],
  [[0, "A5", 1], [1, "F5", 1], [2, "C5", 1], [3, "F5", 1]],
  [[0, "E5", 1], [1, "G5", 1], [2, "Bb5", 1], [3, "G5", 1]],
];

export const BGM_MELODY: BgmNote[] = MELODY.flatMap((phrase, bar) =>
  phrase.map(([offset, pitch, duration], index) => ({
    beat: beat(bar, offset),
    pitch,
    duration,
    // Downbeats and long notes sing a little louder; section B leans forward.
    velocity: (offset % 1 === 0 ? 0.66 : 0.54) + (duration >= 2 ? 0.06 : 0) + (bar >= 8 && bar < 16 ? 0.05 : 0) + (index === 0 ? 0.03 : 0),
  })),
);

/** Short off-beat chord stabs keep the harmony moving instead of holding it. */
export const BGM_PAD: BgmNote[] = chordSpans().flatMap(({ chord, start, length }) =>
  [0.5, 1.5, 2.5, 3.5]
    .filter((offset) => offset < length)
    .flatMap((offset) => CHORDS[chord].pad.map((pitch) => ({ beat: start + offset, pitch, duration: 0.25, velocity: offset === 1.5 || offset === 3.5 ? 0.4 : 0.32 }))),
);

/** Bouncing eighth-note bass: root, octave, fifth, with a pickup into the next chord. */
export const BGM_BASS: BgmNote[] = chordSpans().flatMap(({ chord, start, length }, index, spans) => {
  const [root, fifth] = CHORDS[chord].bass;
  const octave = raiseOctave(root);
  const pattern = length < 4 ? [root, root, fifth, octave] : [root, root, octave, root, fifth, root, octave, CHORDS[spans[(index + 1) % spans.length].chord].bass[1]];
  return pattern.map((pitch, step) => ({ beat: start + step * 0.5, pitch, duration: 0.5, velocity: step % 2 === 0 ? 0.66 : 0.46 }));
});

/** High glassy bubbles on the off-beats; only mixed in while a bottle is ready or falling. */
export const BGM_JUICE: BgmNote[] = chordSpans().flatMap(({ chord, start, length }) =>
  CHORDS[chord].bubbles.slice(0, length === 4 ? 4 : 2).map((pitch, index) => ({
    beat: start + 0.5 + index * 1,
    pitch,
    duration: 0.25,
    velocity: index === 2 ? 0.5 : 0.4,
  })),
);

export const BGM_DRUMS: BgmDrumHit[] = drumLoop();

function beat(bar: number, offset: number): number {
  return bar * BGM_BEATS_PER_BAR + offset;
}

function chordSpans(): Array<{ chord: ChordName; start: number; length: number }> {
  return PROGRESSION.flatMap((entry, bar) =>
    Array.isArray(entry)
      ? [
          { chord: entry[0], start: beat(bar, 0), length: 2 },
          { chord: entry[1], start: beat(bar, 2), length: 2 },
        ]
      : [{ chord: entry, start: beat(bar, 0), length: 4 }],
  );
}

function raiseOctave(pitch: string): string {
  const match = /^([A-G][b#]?)(\d)$/.exec(pitch);
  return match ? `${match[1]}${Number(match[2]) + 1}` : pitch;
}

function drumLoop(): BgmDrumHit[] {
  const hits: BgmDrumHit[] = [];
  for (let bar = 0; bar < BGM_LOOP_BARS; bar += 1) {
    const busy = bar >= 8 && bar < 16;
    const hatStep = busy ? 0.25 : 0.5;
    for (let offset = 0; offset < 4; offset += hatStep) {
      const onBeat = offset % 1 === 0;
      hits.push({ beat: beat(bar, offset), drum: "hat", duration: 0.25, velocity: onBeat ? 0.36 : offset % 0.5 === 0 ? 0.28 : 0.18 });
    }
    for (const offset of [0, 1.5, 2, 3.25]) hits.push({ beat: beat(bar, offset), drum: "kick", duration: 0.5, velocity: offset === 0 ? 0.72 : 0.54 });
    hits.push({ beat: beat(bar, 1), drum: "snare", duration: 0.25, velocity: 0.6 });
    hits.push({ beat: beat(bar, 3), drum: "snare", duration: 0.25, velocity: 0.64 });
    // Fill into each new section.
    if (bar % 8 === 7) for (const offset of [3.5, 3.75]) hits.push({ beat: beat(bar, offset), drum: "snare", duration: 0.25, velocity: 0.48 });
  }
  return hits;
}
