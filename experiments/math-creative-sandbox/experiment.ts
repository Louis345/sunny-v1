import path from "node:path";

export type ScenarioId =
  | "scenario-1-concept-only"
  | "scenario-2-profile"
  | "scenario-3-profile-and-spelling";

export type ScenarioPacket = {
  id: ScenarioId;
  label: string;
  concept: string;
  context: Record<string, unknown>;
};

export type QualityScores = {
  designQuality: number;
  originality: number;
  craft: number;
  functionality: number;
  learningIntegration: number;
  replayAppeal: number;
};

export type CandidateReview = {
  candidateId: string;
  verdict: "exceptional" | "promising" | "mediocre" | "reject";
  scores: QualityScores;
  evidence: string[];
  critique: string;
  nextMove: "refine" | "pivot" | "stop";
};

type ProfileLike = Record<string, unknown>;

const GENERATED_DIRECTIVE_KEYS = new Set([
  "preferredDimensions",
  "avoidedDimensions",
  "promptDirectives",
  "nextPromptDirectives",
  "preserve",
  "change",
  "explore",
  "avoid",
]);

const PROFILE_FACT_KEYS = new Set([
  "identity",
  "demographics",
  "accommodations",
  "iepTargets",
  "readingProfile",
  "rewardPreferences",
  "companion",
]);

const SPELLING_ACTIVITY_IDS = new Set([
  "wheel-of-fortune",
  "pronunciation",
  "mystery",
  "monster-stampede",
  "word-radar",
  "spell-check",
]);

const FACTUAL_ACTIVITY_FIELDS = new Set([
  "activityId",
  "plays",
  "completions",
  "completionRate",
  "averageAccuracy",
  "averageTimePerTarget_ms",
  "engagementScore",
  "frustrationScore",
  "likedCount",
  "dislikedCount",
  "lastRating",
  "lastPlayed",
  "domains",
  "missedWords",
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function factualProfile(profile: ProfileLike): Record<string, unknown> {
  const learningProfile = record(profile.learningProfile);
  const source = Object.keys(learningProfile).length > 0 ? learningProfile : profile;
  const output: Record<string, unknown> = {};

  for (const key of PROFILE_FACT_KEYS) {
    const value = key in profile ? profile[key] : source[key];
    if (value !== undefined) output[key] = stripGeneratedDirectives(value);
  }

  return output;
}

function stripGeneratedDirectives(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripGeneratedDirectives);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !GENERATED_DIRECTIVE_KEYS.has(key))
      .map(([key, child]) => [key, stripGeneratedDirectives(child)]),
  );
}

function spellingSuccessFacts(profile: ProfileLike): Record<string, unknown> {
  const learningProfile = record(profile.learningProfile);
  const activityModel = record(
    learningProfile.activityModel ?? profile.activityModel,
  );
  const observations: Record<string, unknown> = {};

  for (const [activityId, raw] of Object.entries(activityModel)) {
    if (!SPELLING_ACTIVITY_IDS.has(activityId)) continue;
    const activity = record(raw);
    observations[activityId] = Object.fromEntries(
      Object.entries(activity).filter(([key]) => FACTUAL_ACTIVITY_FIELDS.has(key)),
    );
  }

  return {
    source: "child_chart_activity_observations",
    interpretation: "none",
    observations,
  };
}

export function buildScenarioPackets(input: {
  concept: string;
  profile: ProfileLike;
  factualProfileEvidence?: Record<string, unknown>;
}): ScenarioPacket[] {
  const profileFacts = {
    ...factualProfile(input.profile),
    ...(input.factualProfileEvidence ?? {}),
  };
  return [
    {
      id: "scenario-1-concept-only",
      label: "Scenario 1 — concept only",
      concept: input.concept,
      context: {},
    },
    {
      id: "scenario-2-profile",
      label: "Scenario 2 — concept plus factual child profile",
      concept: input.concept,
      context: { childProfileFacts: profileFacts },
    },
    {
      id: "scenario-3-profile-and-spelling",
      label: "Scenario 3 — profile plus factual spelling success",
      concept: input.concept,
      context: {
        childProfileFacts: profileFacts,
        priorActivityFacts: spellingSuccessFacts(input.profile),
      },
    },
  ];
}

export function weightedScore(review: CandidateReview): number {
  const scores = review.scores;
  return (
    scores.designQuality * 1.35
    + scores.originality * 1.35
    + scores.craft
    + scores.functionality
    + scores.learningIntegration * 1.2
    + scores.replayAppeal * 1.2
  );
}

export function chooseStrongestCandidate(reviews: CandidateReview[]): {
  review: CandidateReview;
  candidateId: string;
  allRejected: boolean;
} {
  if (reviews.length === 0) throw new Error("sandbox_reviews_missing");
  const ranked = [...reviews].sort((a, b) => weightedScore(b) - weightedScore(a));
  return {
    review: ranked[0],
    candidateId: ranked[0].candidateId,
    allRejected: reviews.every((review) => review.verdict === "reject"),
  };
}

export function explorationTurnAllowed(turn: number, maximumTurns = 8): boolean {
  return Number.isInteger(turn)
    && Number.isInteger(maximumTurns)
    && turn >= 0
    && maximumTurns > 0
    && turn < maximumTurns;
}

export function buildRefactorPrompt(input: {
  concept: string;
  originalPrompt: string;
  critique: string;
  html: string;
  move: "refine" | "pivot";
}): string {
  const common = `Create one complete standalone HTML learning experience.

Mathematical concept:
${input.concept}

The prior result received this skeptical quality critique:
${input.critique}

The objective is not checklist compliance. Produce work that is genuinely coherent,
original, crafted, usable, mathematically integrated, and worth replaying.
Return raw complete HTML only.`;

  if (input.move === "pivot") {
    return `${common}

PIVOT. Abandon the prior core interaction and visual direction. The rejected HTML
is intentionally withheld. Reconsider the experience from the original request:
${input.originalPrompt}`;
  }

  return `${common}

REFINE. Preserve the strongest idea while materially repairing the cited weakness.
This must improve the experience itself, not merely colors or wording.

Original request:
${input.originalPrompt}

Existing HTML:
${input.html}`;
}

export function resolveSandboxOutput(root: string, runId: string): string {
  const base = path.resolve(root, "outputs", "math-creative-sandbox");
  const resolved = path.resolve(base, runId);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    throw new Error("sandbox_output_escape");
  }
  return resolved;
}

export function parseGeneratedHtml(text: string):
  | { ok: true; html: string }
  | { ok: false; reason: "sandbox_creator_returned_incomplete_html" } {
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i)?.[1];
  const source = (fenced ?? text).trim();
  const start = source.search(/<!doctype html|<html\b/i);
  const end = source.toLowerCase().lastIndexOf("</html>");
  if (start < 0 || end < 0) {
    return { ok: false, reason: "sandbox_creator_returned_incomplete_html" };
  }
  return {
    ok: true,
    html: source.slice(start, end + "</html>".length),
  };
}

export function sanitizeForModel(value: unknown): unknown {
  return stripGeneratedDirectives(value);
}
