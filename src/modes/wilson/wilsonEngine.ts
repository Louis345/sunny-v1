import type { WordEntry, MasteryGateResult, MasteryParams, StepSessionRecord } from "../../algorithms/types";
import { evaluateMasteryGate } from "../../algorithms/masteryGating";
import { getStepByNumber } from "./wilsonSteps";

export function evaluateWilsonStep(
  currentStep: number,
  stepSessionHistory: StepSessionRecord[],
  params: MasteryParams,
): MasteryGateResult {
  return evaluateMasteryGate({ currentStep, stepSessionHistory, params });
}

export function getWordsForStep(step: number, wordBank: WordEntry[]): WordEntry[] {
  return wordBank.filter((w) => w.wilsonStep === step);
}

export function getSampleWordsForStep(step: number): string[] {
  const wilsonStep = getStepByNumber(step);
  return wilsonStep?.sampleWords ?? [];
}

export function getPatternsForStep(step: number): string[] {
  const wilsonStep = getStepByNumber(step);
  return wilsonStep?.patterns ?? [];
}
