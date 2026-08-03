import { GameModel } from "../core";
import type { AiSpeed, DifficultyId, GameModeId, GameSettings } from "../core";
import { GameSession } from "../session/gameSession";
import { DEFAULT_GAME_SETTINGS } from "../storage/settings";
import { DEFAULT_PLAYER_STATS } from "../storage/stats";
import { getBoardMetrics } from "./evaluation";
import { heuristicAiStrategy } from "./heuristicStrategy";
import { AiRunner, getAiIntervalMs } from "./runner";
import { createAiGameSnapshot } from "./snapshot";
import type { AiCommand, AiPhase } from "./types";

export type AiSimulationOptions = {
  mode?: GameModeId;
  difficulty?: DifficultyId;
  speed?: AiSpeed;
  rounds?: number;
  seed?: number;
  tickMs?: number;
  maxSimulatedMs?: number;
  maxDecisionMs?: number;
};

export type AiSimulationCheckpoint = {
  simulatedMs: number;
  bestChain: number;
  score: number;
  phase: AiPhase | null;
  maxHeight: number;
};

export type AiSimulationChainEvent = {
  simulatedMs: number;
  bestChain: number;
  reason: string;
  board: string[];
};

export type AiSimulationRound = {
  round: number;
  seed: number;
  result: "challengeComplete" | "topOut" | "durationComplete";
  simulatedMs: number;
  wallMs: number;
  ticks: number;
  pieces: number;
  decisions: number;
  score: number;
  bestChain: number;
  maxDecisionMs: number;
  p95DecisionMs: number;
  maxChainPotentialEvaluations: number;
  phaseCounts: Record<AiPhase, number>;
  checkpoints: AiSimulationCheckpoint[];
  chainEvents: AiSimulationChainEvent[];
  finalBoard: string[];
  lastReason: string;
  slowDecisionCount: number;
};

export type AiSimulationReport = {
  options: Required<AiSimulationOptions>;
  rounds: AiSimulationRound[];
  summary: {
    completedRounds: number;
    topOuts: number;
    durationCompletions: number;
    bestChain: number;
    medianBestChain: number;
    maxDecisionMs: number;
    p95DecisionMs: number;
    totalWallMs: number;
  };
};

const DEFAULT_OPTIONS: Required<AiSimulationOptions> = {
  mode: "chainChallenge",
  difficulty: "normal",
  speed: "fast",
  rounds: 10,
  seed: 1,
  tickMs: 16,
  maxSimulatedMs: 120_000,
  maxDecisionMs: 250,
};

export function runAiSimulation(options: AiSimulationOptions = {}): AiSimulationReport {
  const resolved = normalizeOptions(options);
  const rounds = Array.from({ length: resolved.rounds }, (_, index) => runRound(resolved, index));
  const decisionTimes = rounds.flatMap((round) => round.decisionTimes);
  const publicRounds = rounds.map(({ decisionTimes: _decisionTimes, ...round }) => round);
  const bestChains = publicRounds.map((round) => round.bestChain).sort((a, b) => a - b);
  return {
    options: resolved,
    rounds: publicRounds,
    summary: {
      completedRounds: publicRounds.filter((round) => round.result === "challengeComplete").length,
      topOuts: publicRounds.filter((round) => round.result === "topOut").length,
      durationCompletions: publicRounds.filter((round) => round.result === "durationComplete").length,
      bestChain: Math.max(0, ...bestChains),
      medianBestChain: percentile(bestChains, 0.5),
      maxDecisionMs: Math.max(0, ...decisionTimes),
      p95DecisionMs: percentile(decisionTimes, 0.95),
      totalWallMs: publicRounds.reduce((total, round) => total + round.wallMs, 0),
    },
  };
}

type InternalRound = AiSimulationRound & { decisionTimes: number[] };

function runRound(options: Required<AiSimulationOptions>, roundIndex: number): InternalRound {
  const seed = options.seed + roundIndex;
  const rng = createSeededRandom(seed);
  const game = new GameModel(rng);
  const settings: GameSettings = {
    ...DEFAULT_GAME_SETTINGS,
    mode: options.mode,
    difficulty: options.difficulty,
    aiSpeed: options.speed,
    reducedMotion: true,
    sfxVolume: 0,
    bgmVolume: 0,
  };
  const session = new GameSession({
    game,
    settings,
    stats: { ...DEFAULT_PLAYER_STATS },
    soundEnabled: () => false,
    saveSettings: () => undefined,
    saveStats: () => undefined,
  });
  const runner = new AiRunner({
    getSnapshot: () => createAiGameSnapshot(session),
    executeCommand: (command) => executeAiCommand(session, command),
    strategy: heuristicAiStrategy,
  });
  runner.setIntervalMs(getAiIntervalMs(options.speed));
  runner.setEnabled(true);
  session.start();

  const startedAt = performance.now();
  const decisionTimes: number[] = [];
  const phaseCounts = createPhaseCounts();
  const checkpoints: AiSimulationCheckpoint[] = [];
  const chainEvents: AiSimulationChainEvent[] = [];
  let nextCheckpointMs = 0;
  let simulatedMs = 0;
  let ticks = 0;
  let pieces = 0;
  let lastDecisionCount = 0;
  let maxChainPotentialEvaluations = 0;
  let bestChain = 0;

  while (session.getRenderSnapshot().state === "playing" && simulatedMs < options.maxSimulatedMs) {
    const sessionResult = session.tick(options.tickMs);
    const aiResult = runner.tick(options.tickMs);
    if (sessionResult.gameOverRecorded || aiResult?.gameOverRecorded) runner.setEnabled(false);
    simulatedMs += options.tickMs;
    ticks += 1;
    if (aiResult?.sounds.some((cue) => cue.kind === "tap")) pieces += 1;

    const runnerState = runner.getState();
    if (runnerState.decisionCount > lastDecisionCount) {
      decisionTimes.push(runnerState.lastDecisionMs);
      if (runnerState.phase) phaseCounts[runnerState.phase] += 1;
      maxChainPotentialEvaluations = Math.max(maxChainPotentialEvaluations, runnerState.chainPotentialEvaluations);
      lastDecisionCount = runnerState.decisionCount;
    }
    const challenge = session.getAiChallengeContext();
    if (challenge.runBestChain > bestChain) {
      bestChain = challenge.runBestChain;
      chainEvents.push({ simulatedMs, bestChain, reason: runnerState.lastReason, board: formatBoard(session.getRenderSnapshot().board) });
    }

    if (simulatedMs >= nextCheckpointMs) {
      const snapshot = createAiGameSnapshot(session);
      checkpoints.push({
        simulatedMs,
        bestChain: snapshot.challenge.runBestChain,
        score: snapshot.score,
        phase: runnerState.phase,
        maxHeight: getBoardMetrics(snapshot.board).maxHeight,
      });
      nextCheckpointMs += 5_000;
    }
  }

  const wallMs = performance.now() - startedAt;
  const snapshot = createAiGameSnapshot(session);
  const challengeComplete = snapshot.challenge.result === "Success";
  return {
    round: roundIndex + 1,
    seed,
    result: challengeComplete ? "challengeComplete" : snapshot.state === "gameover" ? "topOut" : "durationComplete",
    simulatedMs,
    wallMs,
    ticks,
    pieces,
    decisions: runner.getState().decisionCount,
    score: snapshot.score,
    bestChain: snapshot.challenge.runBestChain,
    maxDecisionMs: Math.max(0, ...decisionTimes),
    p95DecisionMs: percentile(decisionTimes, 0.95),
    maxChainPotentialEvaluations,
    phaseCounts,
    checkpoints,
    chainEvents,
    finalBoard: formatBoard(snapshot.board),
    lastReason: runner.getState().lastReason,
    slowDecisionCount: decisionTimes.filter((duration) => duration > options.maxDecisionMs).length,
    decisionTimes,
  };
}

function normalizeOptions(options: AiSimulationOptions): Required<AiSimulationOptions> {
  return {
    mode: options.mode ?? DEFAULT_OPTIONS.mode,
    difficulty: options.difficulty ?? DEFAULT_OPTIONS.difficulty,
    speed: options.speed ?? DEFAULT_OPTIONS.speed,
    rounds: clampInteger(options.rounds ?? DEFAULT_OPTIONS.rounds, 1, 10_000),
    seed: Math.trunc(options.seed ?? DEFAULT_OPTIONS.seed),
    tickMs: clampInteger(options.tickMs ?? DEFAULT_OPTIONS.tickMs, 1, 1_000),
    maxSimulatedMs: clampInteger(options.maxSimulatedMs ?? DEFAULT_OPTIONS.maxSimulatedMs, 1_000, 3_600_000),
    maxDecisionMs: Math.max(1, options.maxDecisionMs ?? DEFAULT_OPTIONS.maxDecisionMs),
  };
}

function executeAiCommand(session: GameSession, command: AiCommand) {
  if (command.kind === "move") return session.move(command.dx);
  if (command.kind === "rotate") return session.rotate();
  if (command.kind === "hardDrop") return session.hardDrop();
  if (command.kind === "useJuice") return session.useJuice(command.fruit);
  return null;
}

function createPhaseCounts(): Record<AiPhase, number> {
  return { balanced: 0, scoreRush: 0, chainBuild: 0, chainTrigger: 0, waterClear: 0, survive: 0 };
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function formatBoard(board: GameModel["board"]): string[] {
  return board.map((row) => row.map((cell) => cell?.[0].toUpperCase() ?? ".").join(""));
}
