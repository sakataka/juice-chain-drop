import { runAiSimulation } from "../src/ai/headlessSimulation";

const args = parseArgs(Bun.argv.slice(2));
const report = runAiSimulation({
  mode: readChoice(args.mode, ["normal", "scoreAttack", "chainChallenge", "waterCleanup"] as const, "chainChallenge"),
  difficulty: readChoice(args.difficulty, ["easy", "normal", "hard"] as const, "normal"),
  speed: readChoice(args.speed, ["slow", "normal", "fast"] as const, "fast"),
  rounds: readNumber(args.rounds, 10),
  seed: readNumber(args.seed, 1),
  maxSimulatedMs: readNumber(args["max-ms"], 120_000),
  maxDecisionMs: readNumber(args["max-decision-ms"], 250),
});

if (args.json === "true") {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`AI logic simulation: ${report.options.mode}, ${report.options.rounds} rounds, seed ${report.options.seed}`);
  for (const round of report.rounds) {
    const chainPath = round.chainEvents.map((event) => `${event.bestChain}@${(event.simulatedMs / 1000).toFixed(1)}s`).join(",") || "none";
    console.log(
      `#${round.round} seed=${round.seed} result=${round.result} sim=${(round.simulatedMs / 1000).toFixed(1)}s wall=${round.wallMs.toFixed(1)}ms pieces=${round.pieces} decisions=${round.decisions} best=${round.bestChain} chains=${chainPath} maxDecision=${round.maxDecisionMs.toFixed(1)}ms potential=${round.maxChainPotentialEvaluations}`,
    );
  }
  console.log(
    `summary completed=${report.summary.completedRounds}/${report.options.rounds} topOuts=${report.summary.topOuts} durationComplete=${report.summary.durationCompletions} best=${report.summary.bestChain} median=${report.summary.medianBestChain} p95Decision=${report.summary.p95DecisionMs.toFixed(1)}ms maxDecision=${report.summary.maxDecisionMs.toFixed(1)}ms wall=${report.summary.totalWallMs.toFixed(1)}ms`,
  );
}

if (report.rounds.some((round) => round.slowDecisionCount > 0) || (report.options.mode !== "normal" && report.summary.topOuts > 0)) process.exitCode = 1;

type CliArgs = Record<string, string>;

function parseArgs(values: string[]): CliArgs {
  const parsed: CliArgs = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const [rawKey, inlineValue] = value.slice(2).split("=", 2);
    const next = values[index + 1];
    parsed[rawKey] = inlineValue ?? (next && !next.startsWith("--") ? next : "true");
    if (!inlineValue && next && !next.startsWith("--")) index += 1;
  }
  return parsed;
}

function readNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Expected a number, received ${value}`);
  return parsed;
}

function readChoice<const Choice extends string>(value: string | undefined, choices: readonly Choice[], fallback: Choice): Choice {
  if (value === undefined) return fallback;
  if (choices.includes(value as Choice)) return value as Choice;
  throw new Error(`Expected one of ${choices.join(", ")}, received ${value}`);
}
