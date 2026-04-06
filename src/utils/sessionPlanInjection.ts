import { shouldLoadPersistedHistory } from "./runtimeMode";
import {
  readPersistedTodaysPlan,
  type PsychologistStructuredOutput,
} from "../agents/psychologist/today-plan";
import { buildCarePlanSection } from "../agents/prompts/buildCarePlanSection";

/** @deprecated Prefer buildCarePlanSection; childDisplayName ignored. */
export function formatTodaysPlanInjection(
  plan: PsychologistStructuredOutput,
  _childDisplayName?: string,
): string {
  return buildCarePlanSection(plan);
}

/**
 * Suffix to append to companion / session system prompts when a persisted plan exists.
 */
export function getTodaysPlanInjectionSuffix(
  childName: "Ila" | "Reina" | "creator",
  planFilePath?: string,
): string {
  if (childName === "creator") {
    return "";
  }
  if (!planFilePath && !shouldLoadPersistedHistory()) {
    return "";
  }
  const plan = readPersistedTodaysPlan(childName, planFilePath);
  if (!plan) return "";
  return buildCarePlanSection(plan);
}

export function appendPlanSuffixToSessionPrompt(
  prompt: string,
  suffix: string,
): string {
  if (!suffix.trim()) return prompt;
  return `${prompt}\n\n${suffix}`;
}
