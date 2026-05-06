import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import MidiWriter from "midi-writer-js";
import { BGM_BASS, BGM_BPM, BGM_DRUMS, BGM_MELODY, BGM_TICKS_PER_BEAT, type BeatDuration, type BgmDrumHit, type BgmNote } from "../src/audio/bgmComposition";

const OUTPUT_PATH = resolve("output/bgm-main.mid");

const melody = createTrack("melody", 1, 81);
melody.setTempo(BGM_BPM);
melody.setTimeSignature(4, 4, 24, 8);
for (const note of BGM_MELODY) addNote(melody, note, 1);

const bass = createTrack("bass", 2, 38);
for (const note of BGM_BASS) addNote(bass, note, 2);

const drums = new MidiWriter.Track();
drums.addTrackName("drums");
for (const hit of BGM_DRUMS) addDrum(drums, hit);

const writer = new MidiWriter.Writer([melody, bass, drums], { ticksPerBeat: BGM_TICKS_PER_BEAT });
mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, writer.buildFile());
console.log(`Generated ${OUTPUT_PATH}`);

function createTrack(name: string, channel: number, instrument: number): MidiWriter.Track {
  const track = new MidiWriter.Track();
  track.addTrackName(name);
  track.addEvent(new MidiWriter.ProgramChangeEvent({ channel, instrument }));
  return track;
}

function addNote(track: MidiWriter.Track, note: BgmNote, channel: number): void {
  track.addEvent(
    new MidiWriter.NoteEvent({
      pitch: [note.pitch],
      duration: tickDuration(note.duration),
      tick: beatTick(note.beat),
      channel,
      velocity: midiVelocity(note.velocity),
    }),
  );
}

function addDrum(track: MidiWriter.Track, hit: BgmDrumHit): void {
  const pitch = hit.drum === "kick" ? "C2" : hit.drum === "snare" ? "D2" : "F#2";
  track.addEvent(
    new MidiWriter.NoteEvent({
      pitch: [pitch],
      duration: tickDuration(hit.duration),
      tick: beatTick(hit.beat),
      channel: 10,
      velocity: midiVelocity(hit.velocity),
    }),
  );
}

function beatTick(beat: number): number {
  return Math.round(beat * BGM_TICKS_PER_BEAT);
}

function tickDuration(duration: BeatDuration): string {
  return `T${Math.round(duration * BGM_TICKS_PER_BEAT)}`;
}

function midiVelocity(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value * 100)));
}
