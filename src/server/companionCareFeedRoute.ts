import type { LearningProfile } from "../context/schemas/learningProfile";
import { companionCareToTamagotchi } from "../engine/companionCareEngine";
import type { CompanionCarePlan } from "../shared/companionCareTypes";
import type { SunnyRuntimeConfig } from "../shared/runtimeConfig";

export function companionCareFeedShouldPersist(
  runtime: Pick<SunnyRuntimeConfig, "persistenceMode">,
): boolean {
  return runtime.persistenceMode === "live";
}

export function previewCompanionCareMirror(plan: CompanionCarePlan): {
  tamagotchi: LearningProfile["tamagotchi"];
  companionCurrency: number;
} {
  return {
    tamagotchi: companionCareToTamagotchi(plan),
    companionCurrency: Math.max(0, Math.floor(Number(plan.economy.coins) || 0)),
  };
}
