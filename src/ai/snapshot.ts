import type { GameSession } from "../session/gameSession";
import type { AiGameSnapshot } from "./types";

export function createAiGameSnapshot(session: GameSession): AiGameSnapshot {
  const render = session.getRenderSnapshot();
  const hud = session.getHudSnapshot();
  return {
    board: render.board.map((row) => [...row]),
    active: render.active ? { kind: render.active.kind, axis: { ...render.active.axis }, satellite: { ...render.active.satellite } } : null,
    nextPreviews: render.nextPreviews.map((preview) =>
      preview.kind === "juiceDrop" ? { kind: "juiceDrop", fruit: preview.fruit } : { kind: "fruitPair", pair: [preview.pair[0], preview.pair[1]] },
    ),
    state: render.state,
    score: hud.score,
    lastChain: hud.lastChain,
    featuredFruit: hud.featuredFruit,
    juiceStock: { ...hud.juiceStock },
    juiceProgress: { ...hud.juiceProgress },
    shipment: { ...hud.shipment },
    settings: {
      mode: hud.settings.mode,
      difficulty: hud.settings.difficulty,
      shippingIntervalSeconds: hud.settings.shippingIntervalSeconds,
    },
    challenge: session.getAiChallengeContext(),
  };
}
