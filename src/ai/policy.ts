export type AiPolicy = {
  searchDepth: number;
  beamWidth: number;
  futureDiscount: number;
  immediateClearWeight: number;
  chainWeight: number;
  chainSetupWeight: number;
  survivalWeight: number;
  heightWeight: number;
  holeWeight: number;
  topRiskWeight: number;
  stockValueWeight: number;
  shipmentHoldSeconds: number;
  shipmentHoldBonus: number;
  juiceUseThreshold: number;
  dangerJuiceThreshold: number;
};

export const DEFAULT_AI_POLICY: AiPolicy = {
  searchDepth: 3,
  beamWidth: 6,
  futureDiscount: 0.64,
  immediateClearWeight: 1,
  chainWeight: 210,
  chainSetupWeight: 38,
  survivalWeight: 520,
  heightWeight: 7,
  holeWeight: 28,
  topRiskWeight: 85,
  stockValueWeight: 95,
  shipmentHoldSeconds: 8,
  shipmentHoldBonus: 360,
  juiceUseThreshold: 260,
  dangerJuiceThreshold: 4,
};
