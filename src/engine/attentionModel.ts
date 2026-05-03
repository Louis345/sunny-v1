import type { AttentionModel, LearningProfile } from "../context/schemas/learningProfile";

export type AttentionBand = "short" | "moderate" | "long";

export type ResolvedAttentionModel = AttentionModel & {
  label: AttentionBand;
  legacyDemographicLabel: LearningProfile["demographics"]["attentionSpan"];
};

export function attentionBandFromWindow(windowMs: number): AttentionBand {
  if (windowMs < 180_000) return "short";
  if (windowMs <= 360_000) return "moderate";
  return "long";
}

function legacyWindowMs(label: LearningProfile["demographics"]["attentionSpan"]): number {
  if (label === "short") return 150_000;
  if (label === "long") return 420_000;
  return 300_000;
}

export function resolveAttentionModel(profile: LearningProfile): ResolvedAttentionModel {
  const legacyLabel = profile.demographics.attentionSpan;
  const measured = profile.attentionModel;
  if (measured && Number.isFinite(measured.currentWindow_ms)) {
    return {
      ...measured,
      label: attentionBandFromWindow(measured.currentWindow_ms),
      legacyDemographicLabel: legacyLabel,
    };
  }

  const estimated = legacyWindowMs(legacyLabel);
  return {
    source: "legacy_demographic",
    status: "insufficient-data",
    currentWindow_ms: estimated,
    bestWindow_ms: estimated,
    trend: "unknown",
    confidence: 0.1,
    evidence: ["Fallback from legacy demographics.attentionSpan until vitals exist."],
    label: legacyLabel,
    legacyDemographicLabel: legacyLabel,
  };
}
