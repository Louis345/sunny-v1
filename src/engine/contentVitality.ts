import type { AIContentCatalogItem } from "../context/schemas/learningProfile";
import { appendContentFeedbackLesson } from "./contentFeedbackMemory";

export type ContentVitalityInput = {
  rootDir: string;
  childId: string;
  contentId: string;
  mechanic: string;
  theme: string;
  plays: number;
  completionRate: number;
  attentionScore: number;
  banditPickRate: number;
  instrumentQuality: number;
  helpSpikeRate: number;
};

export type ContentVitalityVerdict = {
  verdict: "strong" | "weak" | "revise" | "retire";
  reuseStatus: AIContentCatalogItem["reuseStatus"];
  reason: string;
};

export function scoreContentVitality(input: ContentVitalityInput): ContentVitalityVerdict {
  if (input.plays < 3) {
    return {
      verdict: "weak",
      reuseStatus: "candidate",
      reason: `Only ${input.plays} play(s) — need at least 3 before demotion.`,
    };
  }

  const engagement =
    input.completionRate * 0.35 +
    input.attentionScore * 0.25 +
    input.banditPickRate * 0.15 +
    input.instrumentQuality * 0.25 -
    input.helpSpikeRate * 0.2;

  if (engagement >= 0.72 && input.instrumentQuality >= 0.6) {
    return {
      verdict: "strong",
      reuseStatus: "reuse",
      reason: `Strong engagement (${engagement.toFixed(2)}) with usable instrument evidence.`,
    };
  }

  if (input.instrumentQuality < 0.35) {
    return {
      verdict: "retire",
      reuseStatus: "retire",
      reason: `Instrument quality too low (${input.instrumentQuality.toFixed(2)}) after ${input.plays} plays.`,
    };
  }

  if (engagement < 0.45) {
    return {
      verdict: "revise",
      reuseStatus: "revise",
      reason: `Weak engagement (${engagement.toFixed(2)}) after ${input.plays} plays.`,
    };
  }

  return {
    verdict: "weak",
    reuseStatus: "candidate",
    reason: `Mixed signals (${engagement.toFixed(2)}) — keep observing.`,
  };
}

export function applyContentVitalityVerdict(input: ContentVitalityInput): ContentVitalityVerdict {
  const verdict = scoreContentVitality(input);
  appendContentFeedbackLesson(input.rootDir, input.childId, {
    contentId: input.contentId,
    mechanic: input.mechanic,
    theme: input.theme,
    verdict: verdict.verdict,
    reason: verdict.reason,
    plays: input.plays,
    completionRate: input.completionRate,
    attentionScore: input.attentionScore,
    banditPickRate: input.banditPickRate,
    source: "vitality",
  });
  console.log(
    `🎮 [content-vitality] [verdict] content=${input.contentId} verdict=${verdict.verdict} reuse=${verdict.reuseStatus}`,
  );
  return verdict;
}
