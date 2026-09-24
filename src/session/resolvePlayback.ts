import type { Board, FallMove, ResolveFrame } from "../core";
import type { SoundCue, VisualEffectCue } from "./gameSession";

/** How long each resolve frame stays on screen before the next one. */
export const PLAYBACK_TIMING_MS: Record<ResolveFrame["kind"], number> = {
  settle: 90,
  burst: 300,
  pop: 320,
  collapse: 230,
};

export type PlaybackStep = {
  atMs: number;
  board: Board;
  falls: FallMove[];
  sounds: SoundCue[];
  effects: VisualEffectCue[];
};

export type ResolvePlayback = {
  steps: PlaybackStep[];
  durationMs: number;
};

/**
 * Turns the rule engine's instant resolve into a timed sequence. Only resolves that clear
 * or burst something are replayed; a quiet landing returns null so play continues at once.
 * The first step's cues are left to the caller, which already emits them with the landing.
 */
export function buildResolvePlayback(frames: ResolveFrame[]): ResolvePlayback | null {
  if (!frames.some((frame) => frame.kind === "pop" || frame.kind === "burst")) return null;
  const steps: PlaybackStep[] = [];
  let atMs = 0;
  for (const frame of frames) {
    steps.push({ atMs, board: frame.board, falls: frame.kind === "settle" || frame.kind === "collapse" ? frame.falls : [], ...cuesFor(frame) });
    atMs += PLAYBACK_TIMING_MS[frame.kind];
  }
  return { steps, durationMs: atMs };
}

function cuesFor(frame: ResolveFrame): Pick<PlaybackStep, "sounds" | "effects"> {
  if (frame.kind !== "pop") return { sounds: [], effects: [] };
  const sounds: SoundCue[] = [{ kind: "squish", chain: frame.chain, fruit: frame.pops[0].fruit }];
  const effects: VisualEffectCue[] = frame.pops.map((pop) => ({ kind: "clearPop", cells: pop.cells, fruit: pop.fruit, chain: pop.chain }));
  if (frame.waterClears.length > 0) {
    effects.push({ kind: "waterClear", cells: frame.waterClears });
    sounds.push({ kind: "waterClear" });
  }
  if (frame.chain >= 2) sounds.push({ kind: "chainChime", chain: frame.chain });
  return { sounds, effects };
}
