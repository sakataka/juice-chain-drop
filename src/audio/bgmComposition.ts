export const BGM_BPM = 112;
export const BGM_STAGE_BPMS = [112, 120, 128, 136] as const;
export const BGM_LOOP_BARS = 24;
export const BGM_TICKS_PER_BEAT = 480;
const BGM_BEATS_PER_BAR = 4;

export type BeatDuration = 0.25 | 0.5 | 1 | 2;
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

const MELODY_PHRASES = [
  ["C5", "E5", "G5", "C6", "B5", "G5", "E5", "G5"],
  ["A4", "C5", "E5", "A5", "G5", "E5", "C5", "E5"],
  ["F4", "A4", "C5", "F5", "E5", "C5", "A4", "C5"],
  ["G4", "B4", "D5", "G5", "E5", "D5", "B4", "G4"],
  ["C5", "E5", "G5", "C6", "D6", "C6", "G5", "E5"],
  ["A4", "C5", "E5", "A5", "B5", "A5", "E5", "C5"],
  ["F4", "A4", "C5", "F5", "G5", "F5", "C5", "A4"],
  ["G4", "B4", "D5", "G5", "C6", "B5", "G5", "E5"],
  ["E5", "G5", "C6", "E6", "D6", "C6", "G5", "C6"],
  ["D5", "F5", "A5", "D6", "C6", "A5", "F5", "A5"],
  ["C5", "E5", "A5", "C6", "B5", "A5", "E5", "A5"],
  ["B4", "D5", "G5", "B5", "A5", "G5", "D5", "G5"],
  ["C5", "G5", "E6", "D6", "C6", "G5", "E5", "C5"],
  ["A4", "E5", "C6", "B5", "A5", "E5", "C5", "A4"],
  ["F4", "C5", "A5", "G5", "F5", "C5", "A4", "F4"],
  ["G4", "D5", "B5", "C6", "D6", "B5", "G5", "D5"],
  ["F5", "A5", "C6", "A5", "F5", "E5", "D5", "F5"],
  ["G5", "B5", "D6", "B5", "G5", "F5", "E5", "G5"],
  ["A5", "C6", "E6", "C6", "A5", "G5", "E5", "C5"],
  ["E5", "G5", "B5", "D6", "C6", "B5", "G5", "E5"],
  ["D5", "F5", "A5", "C6", "B5", "A5", "F5", "D5"],
  ["F5", "A5", "C6", "E6", "D6", "C6", "A5", "F5"],
  ["G5", "B5", "D6", "F6", "E6", "D6", "B5", "G5"],
  ["C6", "E6", "G6", "E6", "D6", "C6", "G5", "E5"],
];

const BASS_PATTERNS = [
  ["C2", "G2", "C3", "G2"],
  ["A1", "E2", "A2", "E2"],
  ["F1", "C2", "F2", "C2"],
  ["G1", "D2", "G2", "D2"],
  ["C2", "G2", "C3", "G2"],
  ["A1", "E2", "A2", "E2"],
  ["F1", "C2", "F2", "C2"],
  ["G1", "D2", "G2", "D2"],
  ["C2", "G2", "E3", "G2"],
  ["D2", "A2", "F3", "A2"],
  ["A1", "E2", "C3", "E2"],
  ["G1", "D2", "B2", "D2"],
  ["C2", "G2", "E3", "C3"],
  ["A1", "E2", "C3", "A2"],
  ["F1", "C2", "A2", "F2"],
  ["G1", "D2", "B2", "G2"],
  ["F1", "C2", "F2", "A2"],
  ["G1", "D2", "G2", "B2"],
  ["A1", "E2", "A2", "C3"],
  ["E1", "B1", "E2", "G2"],
  ["D2", "A2", "D3", "F3"],
  ["F1", "C2", "F2", "A2"],
  ["G1", "D2", "G2", "B2"],
  ["C2", "G2", "C3", "E3"],
];

export const BGM_MELODY: BgmNote[] = MELODY_PHRASES.flatMap((pitches, bar) => melodyBar(bar, pitches));
export const BGM_BASS: BgmNote[] = bassBars(BASS_PATTERNS);
export const BGM_DRUMS: BgmDrumHit[] = drumLoop();

function beat(bar: number, offset: number): number {
  return bar * BGM_BEATS_PER_BAR + offset;
}

function melodyBar(bar: number, pitches: string[]): BgmNote[] {
  const isBridge = bar >= 16;
  return pitches.map((pitch, index) => ({
    beat: beat(bar, index * 0.5),
    pitch,
    duration: 0.5,
    velocity: index === 3 || index === 4 ? (isBridge ? 0.78 : 0.72) : isBridge ? 0.66 : 0.62,
  }));
}

function bassBars(patterns: string[][]): BgmNote[] {
  return patterns.flatMap((pattern, bar) =>
    pattern.flatMap((pitch, index) => {
      const drive = bar >= 8 ? 0.05 : 0;
      return [
        { beat: beat(bar, index), pitch, duration: 0.5, velocity: 0.56 + drive },
        { beat: beat(bar, index + 0.5), pitch, duration: 0.5, velocity: 0.4 + drive },
      ];
    }),
  );
}

function drumLoop(): BgmDrumHit[] {
  const hits: BgmDrumHit[] = [];
  for (let bar = 0; bar < BGM_LOOP_BARS; bar += 1) {
    const sectionBoost = bar >= 16 ? 0.08 : bar >= 8 ? 0.04 : 0;
    for (let step = 0; step < 8; step += 1) {
      hits.push({ beat: beat(bar, step * 0.5), drum: "hat", duration: 0.25, velocity: (step % 2 === 0 ? 0.3 : 0.2) + sectionBoost * 0.5 });
    }
    hits.push({ beat: beat(bar, 0), drum: "kick", duration: 0.5, velocity: 0.6 + sectionBoost });
    hits.push({ beat: beat(bar, 2.5), drum: "kick", duration: 0.5, velocity: 0.44 + sectionBoost });
    hits.push({ beat: beat(bar, 1), drum: "snare", duration: 0.5, velocity: 0.44 + sectionBoost });
    hits.push({ beat: beat(bar, 3), drum: "snare", duration: 0.5, velocity: 0.48 + sectionBoost });
    if (bar >= 8 || bar % 2 === 1) {
      hits.push({ beat: beat(bar, 3.5), drum: "kick", duration: 0.5, velocity: 0.34 + sectionBoost });
    }
    if (bar >= 16 && bar % 4 === 3) {
      hits.push({ beat: beat(bar, 3.75), drum: "snare", duration: 0.25, velocity: 0.36 });
    }
  }
  return hits;
}
