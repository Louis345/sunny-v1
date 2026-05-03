import type { CompanionReadiness } from "../../../src/shared/companionCareTypes";

export type CompanionReadinessNudge = {
  show: boolean;
  message: string;
  canContinueTired: boolean;
  primaryAction: "feed" | "warmup" | "none";
  secondaryAction: "warmup" | "none";
};

const HIGH_ENERGY_TWO_PLAYER_NODES = new Set([
  "wheel-of-fortune",
  "word-builder",
  "space-invaders",
  "asteroid",
  "space-frogger",
]);

function displayNodeType(nodeType: string): string {
  if (nodeType === "wheel-of-fortune") return "Wheel of Fortune";
  return nodeType
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getCompanionReadinessNudge(opts: {
  nodeType: string;
  companionName: string;
  readiness?: CompanionReadiness | null;
}): CompanionReadinessNudge {
  const readiness = opts.readiness;
  if (!readiness?.highEnergyReluctance) {
    return {
      show: false,
      message: "",
      canContinueTired: true,
      primaryAction: "none",
      secondaryAction: "none",
    };
  }
  if (!HIGH_ENERGY_TWO_PLAYER_NODES.has(opts.nodeType)) {
    return {
      show: false,
      message: "",
      canContinueTired: true,
      primaryAction: "none",
      secondaryAction: "none",
    };
  }
  const game = displayNodeType(opts.nodeType);
  const repair =
    readiness.suggestedRepair === "feed"
      ? "feed me"
      : "do one quick warmup";
  return {
    show: true,
    message: `${opts.companionName} is low-energy for ${game}. You can ${repair} first, warm up, or continue gently.`,
    canContinueTired: readiness.canContinueTired,
    primaryAction: readiness.suggestedRepair === "feed" ? "feed" : "warmup",
    secondaryAction: readiness.suggestedRepair === "feed" ? "warmup" : "none",
  };
}
