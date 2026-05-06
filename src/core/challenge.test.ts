import { describe, expect, it } from "vitest";
import { GAME_MODE_CONFIGS } from "./modes";
import { createChallengeState, getChallengeSnapshot, updateChallenge } from "./challenge";
import type { GameSettings } from "./types";

const settings: GameSettings = {
  difficulty: "normal",
  mode: "normal",
  aiSpeed: "normal",
  shippingIntervalSeconds: 45,
  waterEnabled: true,
  reducedMotion: false,
  sfxVolume: 0.8,
  bgmVolume: 0.45,
};

describe("challenge rules", () => {
  it("keeps score attack active until the million point target is reached", () => {
    const result = updateChallenge(
      createChallengeState("scoreAttack", "Active"),
      { kind: "tick", deltaMs: 120_000, score: 999_999, gameState: "playing", mode: "scoreAttack" },
      GAME_MODE_CONFIGS.scoreAttack,
    );

    expect(result.shouldEndGame).toBe(false);
    expect(result.state.result).toBe("Active");
    expect(result.state.elapsedMs).toBe(120_000);
  });

  it("ends score attack when the million point target is reached", () => {
    const result = updateChallenge(
      createChallengeState("scoreAttack", "Active"),
      { kind: "tick", deltaMs: 1_250, score: 1_000_000, gameState: "playing", mode: "scoreAttack" },
      GAME_MODE_CONFIGS.scoreAttack,
    );

    expect(result.shouldEndGame).toBe(true);
    expect(result.state.result).toBe("Success");
    expect(result.state.completedMs).toBe(1_250);
    const snapshot = getChallengeSnapshot(result.state, 1_000_000, "gameover", { ...settings, mode: "scoreAttack" });
    expect(snapshot.progress).toBe("1,000,000 / 1,000,000 pts, 1.3s");
    expect(snapshot.resultTitle).toBe("Score Attack Clear");
    expect(snapshot.resultDetailLabel).toBe("Clear Time");
    expect(snapshot.resultDetailValue).toBe("1.3s");
  });

  it("ends chain challenge after 60 seconds with the best chain preserved", () => {
    let state = updateChallenge(createChallengeState("chainChallenge", "Active"), { kind: "chain", chain: 3 }, GAME_MODE_CONFIGS.chainChallenge).state;
    state = updateChallenge(state, { kind: "chain", chain: 5 }, GAME_MODE_CONFIGS.chainChallenge).state;

    const result = updateChallenge(
      state,
      { kind: "tick", deltaMs: 60_000, score: 0, gameState: "playing", mode: "chainChallenge" },
      GAME_MODE_CONFIGS.chainChallenge,
    );

    expect(result.shouldEndGame).toBe(true);
    expect(result.state.result).toBe("Success");
    expect(result.state.runBestChain).toBe(5);
    const snapshot = getChallengeSnapshot(result.state, 0, "gameover", { ...settings, mode: "chainChallenge" });
    expect(snapshot.progress).toBe("Best 5 chain, 0s left");
    expect(snapshot.resultTitle).toBe("Chain Result");
    expect(snapshot.resultDetailLabel).toBe("Best Chain");
    expect(snapshot.resultDetailValue).toBe("5 chain");
  });

  it("keeps chain challenge active before 60 seconds", () => {
    const result = updateChallenge(
      createChallengeState("chainChallenge", "Active"),
      { kind: "tick", deltaMs: 59_999, score: 0, gameState: "playing", mode: "chainChallenge" },
      GAME_MODE_CONFIGS.chainChallenge,
    );

    expect(result.shouldEndGame).toBe(false);
    expect(result.state.result).toBe("Active");
  });

  it("ends water cleanup when all starting water is cleared", () => {
    const elapsed = updateChallenge(
      createChallengeState("waterCleanup", "Active"),
      { kind: "tick", deltaMs: 30_000, score: 0, gameState: "playing", mode: "waterCleanup" },
      GAME_MODE_CONFIGS.waterCleanup,
    );
    const result = updateChallenge(elapsed.state, { kind: "waterProgress", cleared: 30 }, GAME_MODE_CONFIGS.waterCleanup);

    expect(result.shouldEndGame).toBe(true);
    expect(result.state.result).toBe("Success");
    expect(result.state.completedMs).toBe(30_000);
    const snapshot = getChallengeSnapshot(result.state, 0, "gameover", { ...settings, mode: "waterCleanup" });
    expect(snapshot.progress).toBe("0 / 30 water, 30.0s");
    expect(snapshot.resultTitle).toBe("Water Cleanup Clear");
    expect(snapshot.resultDetailLabel).toBe("Clear Time");
    expect(snapshot.resultDetailValue).toBe("30.0s");
  });

  it("keeps top-out result copy for failed challenges", () => {
    const state = { ...createChallengeState("scoreAttack", "Active"), result: "Failed" as const };
    const snapshot = getChallengeSnapshot(state, 2400, "gameover", { ...settings, mode: "scoreAttack" });

    expect(snapshot.resultKicker).toBe("Top out");
    expect(snapshot.resultTitle).toBe("Game Over");
    expect(snapshot.resultDetailLabel).toBe("Score");
    expect(snapshot.resultDetailValue).toBe("2,400");
  });
});
