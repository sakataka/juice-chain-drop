import type { AiCommand, AiDecision, AiGameSnapshot, AiRunnerState, AiStrategy } from "./types";
import type { GameSessionCommandResult } from "../session/gameSession";

type AiRunnerOptions = {
  getSnapshot: () => AiGameSnapshot;
  executeCommand: (command: AiCommand) => GameSessionCommandResult | null;
  strategy: AiStrategy;
  now?: () => number;
};

const DEFAULT_INTERVAL_MS = 120;
const MAX_STALLED_COMMANDS = 2;

export class AiRunner {
  private enabled = false;
  private elapsedMs = 0;
  private intervalMs = DEFAULT_INTERVAL_MS;
  private queue: AiCommand[] = [];
  private lastDecision: AiDecision | null = null;
  private stalledCommands = 0;
  private decisionCount = 0;
  private lastDecisionMs = 0;
  private maxDecisionMs = 0;

  constructor(private readonly options: AiRunnerOptions) {}

  setEnabled(enabled: boolean): void {
    if (enabled && !this.enabled) {
      this.decisionCount = 0;
      this.lastDecisionMs = 0;
      this.maxDecisionMs = 0;
    }
    this.enabled = enabled;
    if (!enabled) {
      this.queue = [];
      this.elapsedMs = 0;
      this.stalledCommands = 0;
    }
  }

  toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  setIntervalMs(intervalMs: number): void {
    this.intervalMs = Math.max(40, Math.min(800, Math.round(intervalMs)));
  }

  tick(deltaMs: number): GameSessionCommandResult | null {
    if (!this.enabled) return null;
    const render = this.options.getSnapshot();
    if (render.state === "gameover" || render.state === "paused") {
      this.queue = [];
      this.stalledCommands = 0;
      return null;
    }
    if (render.state !== "playing" || !render.active) return null;

    if (this.lastDecision && this.lastDecision.mode !== render.settings.mode) {
      this.queue = [];
      this.lastDecision = null;
      this.stalledCommands = 0;
    }

    this.elapsedMs += deltaMs;
    if (this.elapsedMs < this.intervalMs) return null;
    this.elapsedMs = 0;

    if (this.queue.length === 0) {
      const startedAt = this.now();
      this.lastDecision = this.options.strategy.choose(this.createSnapshot());
      this.lastDecisionMs = Math.max(0, this.now() - startedAt);
      this.maxDecisionMs = Math.max(this.maxDecisionMs, this.lastDecisionMs);
      this.decisionCount += 1;
      this.queue = [...this.lastDecision.commands];
    }

    const command = this.queue.shift();
    if (!command || command.kind === "wait") return null;
    const result = this.options.executeCommand(command);
    if (commandMadeProgress(command, result)) {
      this.stalledCommands = 0;
      return result;
    }

    this.stalledCommands += 1;
    if (this.stalledCommands >= MAX_STALLED_COMMANDS) {
      this.queue = [];
      this.stalledCommands = 0;
      this.lastDecision = {
        commands: [{ kind: "hardDrop" }],
        score: -1,
        reason: "AI unstuck hard drop",
        evaluatedMoves: 0,
        chainPotentialEvaluations: 0,
        mode: render.settings.mode,
        phase: "survive",
      };
      return this.options.executeCommand({ kind: "hardDrop" });
    }
    return result;
  }

  getState(): AiRunnerState {
    return {
      enabled: this.enabled,
      intervalMs: this.intervalMs,
      pendingCommands: this.queue.length,
      lastReason: this.lastDecision?.reason ?? "AI standby",
      mode: this.lastDecision?.mode ?? null,
      phase: this.lastDecision?.phase ?? null,
      decisionCount: this.decisionCount,
      lastDecisionMs: this.lastDecisionMs,
      maxDecisionMs: this.maxDecisionMs,
      chainPotentialEvaluations: this.lastDecision?.chainPotentialEvaluations ?? 0,
    };
  }

  private createSnapshot(): AiGameSnapshot {
    return this.options.getSnapshot();
  }

  private now(): number {
    return this.options.now?.() ?? performance.now();
  }
}

function commandMadeProgress(command: AiCommand, result: GameSessionCommandResult | null): boolean {
  if (!result) return false;
  if (command.kind === "hardDrop") return result.sounds.some((cue) => cue.kind === "tap" || cue.kind === "whoosh") || result.gameOverRecorded;
  if (command.kind === "move") return result.sounds.some((cue) => cue.kind === "tick");
  if (command.kind === "rotate") return result.sounds.some((cue) => cue.kind === "pop");
  if (command.kind === "useJuice") return result.sounds.some((cue) => cue.kind === "pour");
  return true;
}
