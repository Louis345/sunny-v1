import type { InterleavingInput, InterleavingResult, MathProblemType } from "./types";

export function selectNextProblemType(input: InterleavingInput): InterleavingResult {
  const { availableTypes, recentHistory, performanceByType, params } = input;

  if (availableTypes.length === 0) {
    throw new Error("No available problem types");
  }

  const typeAccuracies: Record<string, number> = {};
  for (const t of availableTypes) {
    const perf = performanceByType[t];
    typeAccuracies[t] = perf && perf.total > 0 ? perf.correct / perf.total : 0;
  }

  if (availableTypes.length === 1) {
    return { nextType: availableTypes[0], reason: "variety", typeAccuracies };
  }

  const lastType = recentHistory.length > 0 ? recentHistory[0].type : null;

  const eligible = availableTypes.filter((t) => t !== lastType);
  if (eligible.length === 0) {
    return { nextType: availableTypes[0], reason: "variety", typeAccuracies };
  }

  const sorted = [...eligible].sort((a, b) => typeAccuracies[a] - typeAccuracies[b]);

  const roll = Math.random();
  let chosen: MathProblemType;
  let reason: InterleavingResult["reason"];

  if (roll < params.weakestWeight) {
    chosen = sorted[0];
    reason = "weakest_type";
  } else if (roll < params.weakestWeight + params.secondWeight && sorted.length > 1) {
    chosen = sorted[1];
    reason = "variety";
  } else {
    chosen = sorted[Math.floor(Math.random() * sorted.length)];
    reason = "random";
  }

  return { nextType: chosen, reason, typeAccuracies };
}
