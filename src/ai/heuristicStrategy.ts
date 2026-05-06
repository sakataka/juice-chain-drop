import { getDifficultyConfig, FRUITS } from "../core";
import type { DifficultyConfig, PairPiece } from "../core";
import { evaluateJuice, evaluatePlacement, evaluateTerminal, getBoardMetrics, shouldHoldJuice } from "./evaluation";
import { DEFAULT_AI_POLICY } from "./policy";
import type { AiPolicy } from "./policy";
import {
  cloneBoard,
  cloneFruitRecord,
  clonePair,
  enumeratePlacements,
  nextActiveFromQueue,
  simulateJuice,
  simulatePlacement,
} from "./simulation";
import type { PlacementCandidate, SimState } from "./simulation";
import type { AiCommand, AiDecision, AiGameSnapshot, AiPlan, AiStrategy } from "./types";

type SearchResult = {
  score: number;
  first: PlacementCandidate | null;
  evaluated: number;
};

export { enumeratePlacements };

export const heuristicAiStrategy: AiStrategy = {
  id: "sustainable-lookahead",
  choose(snapshot) {
    if (snapshot.state !== "playing" || !snapshot.active) {
      return decision([{ kind: "wait" }], 0, "AI idle", 0);
    }

    const difficulty = getDifficultyConfig(snapshot.settings.difficulty);
    const state = createSimState(snapshot);
    const placement = searchPlacements(state, snapshot.active, snapshot, difficulty, DEFAULT_AI_POLICY, 0);
    const juicePlan = chooseJuice(snapshot, state, difficulty, DEFAULT_AI_POLICY, placement.first);

    if (!placement.first && juicePlan) return decision(juicePlan.commands, juicePlan.score, juicePlan.reason, placement.evaluated);
    if (!placement.first) return decision([{ kind: "hardDrop" }], -10_000, "No legal AI placement", placement.evaluated);
    if (juicePlan && juicePlan.score > placement.score) return decision(juicePlan.commands, juicePlan.score, juicePlan.reason, placement.evaluated);

    const metrics = getBoardMetrics(placement.first.board);
    const reason = `Lookahead d${DEFAULT_AI_POLICY.searchDepth} c${placement.first.chain} r${placement.first.removed} setup${metrics.readyTriples} safe${Math.max(0, 9 - metrics.topRisk)}`;
    return decision(placement.first.commands, placement.score, reason, placement.evaluated);
  },
};

function searchPlacements(
  state: SimState,
  active: PairPiece,
  snapshot: AiGameSnapshot,
  difficulty: DifficultyConfig,
  policy: AiPolicy,
  depth: number,
): SearchResult {
  const candidates = enumeratePlacements(state.board, active, difficulty);
  if (candidates.length === 0) {
    return { score: -10_000 - getBoardMetrics(state.board).topRisk * 400, first: null, evaluated: 0 };
  }

  const ranked = candidates
    .map((candidate) => ({ candidate, score: evaluatePlacement(candidate, state, snapshot, policy) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, policy.beamWidth);

  let best: SearchResult = { score: Number.NEGATIVE_INFINITY, first: null, evaluated: candidates.length };
  for (const entry of ranked) {
    const nextState = simulatePlacement(state, entry.candidate, difficulty);
    let total = entry.score;
    const nextActive = depth + 1 < policy.searchDepth ? nextActiveFromQueue(state.nextQueue) : null;
    if (nextActive) {
      const future = searchPlacements(nextState, nextActive, snapshot, difficulty, policy, depth + 1);
      total += future.score * policy.futureDiscount;
      best.evaluated += future.evaluated;
    } else {
      total += evaluateTerminal(entry.candidate.board, nextState, snapshot, policy) * policy.futureDiscount;
    }
    if (total > best.score) {
      best = { score: total, first: entry.candidate, evaluated: best.evaluated };
    }
  }
  return best;
}

function chooseJuice(
  snapshot: AiGameSnapshot,
  state: SimState,
  difficulty: DifficultyConfig,
  policy: AiPolicy,
  bestPlacement: PlacementCandidate | null,
): AiPlan | null {
  const danger = getBoardMetrics(snapshot.board).topRisk;
  const holdJuice = shouldHoldJuice(snapshot, policy);
  const plans = FRUITS.filter((fruit) => snapshot.juiceStock[fruit] > 0)
    .map((fruit) => {
      const summary = simulateJuice(state, snapshot.active, fruit, difficulty);
      const dangerBonus = danger >= policy.dangerJuiceThreshold ? danger * 130 : 0;
      const holdPenalty = holdJuice && danger < policy.dangerJuiceThreshold ? 280 : 0;
      const score = evaluateJuice(summary, fruit, snapshot, policy) + dangerBonus - holdPenalty;
      return { fruit, score, summary };
    })
    .sort((a, b) => b.score - a.score);

  const best = plans[0];
  if (!best) return null;
  if (snapshot.settings.mode === "waterCleanup") {
    const placementScore = bestPlacement ? bestPlacement.score : 0;
    if (best.score >= 180 && best.score > placementScore - 120) {
      return { commands: [{ kind: "useJuice", fruit: best.fruit }], score: best.score + 360, reason: `Use ${best.fruit} juice water${Math.round(best.score)}` };
    }
  }
  if (danger >= policy.dangerJuiceThreshold && best.score > 120) {
    return { commands: [{ kind: "useJuice", fruit: best.fruit }], score: best.score + 900, reason: `Use ${best.fruit} juice danger${danger}` };
  }
  const placementScore = bestPlacement ? bestPlacement.score : 0;
  const threshold = policy.juiceUseThreshold + (holdJuice ? policy.shipmentHoldBonus : 0);
  if (best.score >= threshold && best.score > placementScore + 160) {
    return { commands: [{ kind: "useJuice", fruit: best.fruit }], score: best.score, reason: `Use ${best.fruit} juice score${Math.round(best.score)}` };
  }
  return null;
}

function createSimState(snapshot: AiGameSnapshot): SimState {
  return {
    board: cloneBoard(snapshot.board),
    nextQueue: snapshot.nextQueue.map(clonePair),
    juiceStock: cloneFruitRecord(snapshot.juiceStock),
    juiceProgress: cloneFruitRecord(snapshot.juiceProgress),
    featuredFruit: snapshot.featuredFruit,
  };
}

function decision(commands: AiCommand[], score: number, reason: string, evaluatedMoves: number): AiDecision {
  return { commands, score, reason, evaluatedMoves };
}
