import { getDifficultyConfig } from "../core";
import type { PairPiece } from "../core";
import { evaluatePlacement, evaluateTerminal, getBoardMetrics, getChainPotential } from "./evaluation";
import type { AiEvaluationContext } from "./evaluation";
import { AI_MODE_OBJECTIVES, DEFAULT_AI_POLICY } from "./policy";
import {
  cloneBoard,
  cloneFruitRecord,
  clonePreview,
  enumeratePlacements,
  nextActiveFromPreviews,
  simulatePlacement,
} from "./simulation";
import type { PlacementCandidate, SimState } from "./simulation";
import type { AiCommand, AiDecision, AiGameSnapshot, AiPhase, AiStrategy } from "./types";

type SearchResult = {
  score: number;
  first: PlacementCandidate | null;
  evaluated: number;
};

export { enumeratePlacements };

export const heuristicAiStrategy: AiStrategy = {
  id: "sustainable-lookahead",
  choose(snapshot) {
    const objective = AI_MODE_OBJECTIVES[snapshot.settings.mode];
    if (snapshot.state !== "playing" || !snapshot.active) {
      return decision(snapshot.settings.mode, objective.defaultPhase, [{ kind: "wait" }], 0, "AI idle", 0, 0);
    }

    const difficulty = getDifficultyConfig(snapshot.settings.difficulty);
    const policy = { ...DEFAULT_AI_POLICY, beamWidth: objective.beamWidth };
    const state = createSimState(snapshot);
    const rootCandidates = enumeratePlacements(state.board, snapshot.active, difficulty);
    const chainPotentialCache = new Map();
    const metrics = getBoardMetrics(snapshot.board);
    const bestImmediateChain = Math.max(0, ...rootCandidates.map((candidate) => candidate.chain));
    const bestBuildPotential =
      snapshot.settings.mode === "chainChallenge"
        ? Math.max(
            0,
            ...rootCandidates
              .filter((candidate) => candidate.chain === 0)
              .map((candidate) => getChainPotential(candidate.board, difficulty, chainPotentialCache).bestTriggerChain),
          )
        : 0;
    const phase = objective.resolvePhase({ snapshot, topRisk: metrics.topRisk, maxHeight: metrics.maxHeight, bestImmediateChain, bestBuildPotential }, policy);
    const evaluation: AiEvaluationContext = { snapshot, policy, phase, difficulty, chainPotentialCache };
    const placement = searchPlacements(state, snapshot.active, evaluation, 0, rootCandidates);

    if (!placement.first) return decision(snapshot.settings.mode, phase, [{ kind: "hardDrop" }], -10_000, "No legal AI placement", placement.evaluated, chainPotentialCache.size);

    const resultMetrics = getBoardMetrics(placement.first.board);
    const potential = snapshot.settings.mode === "chainChallenge" ? getChainPotential(placement.first.board, difficulty, chainPotentialCache) : { bestTriggerChain: 0, triggerOptions: 0 };
    const action = snapshot.active.kind === "juiceDrop" ? `Juice Drop ${snapshot.active.axis.fruit}` : `Lookahead d${DEFAULT_AI_POLICY.searchDepth}`;
    const reason = `${snapshot.settings.mode}/${phase} ${action} c${placement.first.chain} r${placement.first.removed} potential${potential.bestTriggerChain} risk${resultMetrics.topRisk}`;
    return decision(snapshot.settings.mode, phase, placement.first.commands, placement.score, reason, placement.evaluated, chainPotentialCache.size);
  },
};

function searchPlacements(
  state: SimState,
  active: PairPiece,
  context: AiEvaluationContext,
  depth: number,
  knownCandidates?: PlacementCandidate[],
): SearchResult {
  const candidates = knownCandidates ?? enumeratePlacements(state.board, active, context.difficulty);
  if (candidates.length === 0) {
    return { score: -10_000 - getBoardMetrics(state.board).topRisk * 400, first: null, evaluated: 0 };
  }

  const ranked = candidates
    .map((candidate) => ({ candidate, score: evaluatePlacement(candidate, state, context, depth) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, context.policy.beamWidth);

  let best: SearchResult = { score: Number.NEGATIVE_INFINITY, first: null, evaluated: candidates.length };
  for (const entry of ranked) {
    const nextState = simulatePlacement(state, entry.candidate, context.difficulty);
    let total = entry.score;
    const nextActive = depth + 1 < context.policy.searchDepth ? nextActiveFromPreviews(state.nextPreviews) : null;
    if (nextActive) {
      const future = searchPlacements(nextState, nextActive, context, depth + 1);
      total += future.score * context.policy.futureDiscount;
      best.evaluated += future.evaluated;
    } else {
      total += evaluateTerminal(entry.candidate.board, nextState, context) * context.policy.futureDiscount;
    }
    if (total > best.score) {
      best = { score: total, first: entry.candidate, evaluated: best.evaluated };
    }
  }
  return best;
}

function createSimState(snapshot: AiGameSnapshot): SimState {
  return {
    board: cloneBoard(snapshot.board),
    nextPreviews: snapshot.nextPreviews.map(clonePreview),
    juiceStock: cloneFruitRecord(snapshot.juiceStock),
    juiceProgress: cloneFruitRecord(snapshot.juiceProgress),
    featuredFruit: snapshot.featuredFruit,
    score: snapshot.score,
    bestChain: snapshot.challenge.runBestChain,
    waterClears: snapshot.challenge.runWaterClears,
  };
}

function decision(
  mode: AiGameSnapshot["settings"]["mode"],
  phase: AiPhase,
  commands: AiCommand[],
  score: number,
  reason: string,
  evaluatedMoves: number,
  chainPotentialEvaluations: number,
): AiDecision {
  return { commands, score, reason, evaluatedMoves, chainPotentialEvaluations, mode, phase };
}
