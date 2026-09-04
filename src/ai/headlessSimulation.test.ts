import { describe, expect, it } from "bun:test";
import { runAiSimulation } from "./headlessSimulation";
import { DEFAULT_AI_POLICY } from "./policy";

describe("headless AI simulation", () => {
  it("replays the same seed deterministically without a browser", () => {
    const options = { mode: "chainChallenge" as const, rounds: 1, seed: 41, maxSimulatedMs: 5_000 };

    const first = runAiSimulation(options).rounds[0];
    const second = runAiSimulation(options).rounds[0];

    expect(second).toMatchObject({
      result: first.result,
      simulatedMs: first.simulatedMs,
      ticks: first.ticks,
      pieces: first.pieces,
      decisions: first.decisions,
      score: first.score,
      bestChain: first.bestChain,
      phaseCounts: first.phaseCounts,
      checkpoints: first.checkpoints,
      chainEvents: first.chainEvents,
      finalBoard: first.finalBoard,
      lastReason: first.lastReason,
    });
  });

  it("completes the former top-out seed with bounded search and a useful chain", () => {
    const report = runAiSimulation({ mode: "chainChallenge", rounds: 1, seed: 2 });
    const round = report.rounds[0];

    expect(round.result).toBe("challengeComplete");
    expect(round.simulatedMs).toBe(60_000);
    expect(round.bestChain).toBeGreaterThanOrEqual(4);
    expect(round.maxChainPotentialEvaluations).toBeLessThanOrEqual(DEFAULT_AI_POLICY.chainPotentialBudget);
    expect(round.slowDecisionCount).toBe(0);
    expect(round.chainEvents.at(-1)?.bestChain).toBe(round.bestChain);
  }, 20_000);
});
