import fs from "fs";
import path from "path";
import { resolveChildContextDir } from "../utils/contextRoot";

export type ContentFeedbackLesson = {
  ts: string;
  childId: string;
  contentId?: string;
  theoryId?: string;
  experimentId?: string;
  engagementDimensions?: string[];
  mechanic?: string;
  theme?: string;
  domain?: string;
  decision?: "approve" | "revise" | "reject" | "regenerate" | "vitality";
  reason?: string;
  plays?: number;
  completionRate?: number;
  attentionScore?: number;
  banditPickRate?: number;
  verdict?: "strong" | "weak" | "revise" | "retire";
  source: "human_review" | "vitality" | "parent_note" | "child_choice";
};

export function contentFeedbackPath(rootDir: string, childId: string): string {
  return path.join(resolveChildContextDir(childId, { rootDir }), "content_feedback.ndjson");
}

export function appendContentFeedbackLesson(
  rootDir: string,
  childId: string,
  lesson: Omit<ContentFeedbackLesson, "ts" | "childId"> & { ts?: string; childId?: string },
): ContentFeedbackLesson {
  const record: ContentFeedbackLesson = {
    ts: lesson.ts ?? new Date().toISOString(),
    childId: (lesson.childId ?? childId).trim().toLowerCase(),
    contentId: lesson.contentId,
    theoryId: lesson.theoryId,
    experimentId: lesson.experimentId,
    engagementDimensions: lesson.engagementDimensions,
    mechanic: lesson.mechanic,
    theme: lesson.theme,
    domain: lesson.domain,
    decision: lesson.decision,
    reason: lesson.reason,
    plays: lesson.plays,
    completionRate: lesson.completionRate,
    attentionScore: lesson.attentionScore,
    banditPickRate: lesson.banditPickRate,
    verdict: lesson.verdict,
    source: lesson.source,
  };
  const file = contentFeedbackPath(rootDir, childId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`, "utf8");
  console.log(
    `🎮 [content-feedback] [append] child=${record.childId} source=${record.source} decision=${record.decision ?? record.verdict ?? "note"}`,
  );
  return record;
}

export function readContentFeedbackLessons(rootDir: string, childId: string): ContentFeedbackLesson[] {
  const file = contentFeedbackPath(rootDir, childId);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ContentFeedbackLesson);
}

export function distillContentFeedbackSummary(
  lessons: ContentFeedbackLesson[],
  options: { maxRecent?: number } = {},
): string {
  const maxRecent = options.maxRecent ?? 12;
  const recent = lessons.slice(-maxRecent);
  if (recent.length === 0) return "No prior generated-content feedback yet.";

  const rejectedMechanics = new Map<string, number>();
  const approvedMechanics = new Map<string, number>();
  const rejectedThemes = new Map<string, number>();
  const routePickMechanics = new Map<string, number>();
  const reasons: string[] = [];

  for (const lesson of recent) {
    const mechanic = lesson.mechanic?.trim();
    const theme = lesson.theme?.trim();
    if (lesson.source === "child_choice" && lesson.decision === "approve") {
      if (mechanic) routePickMechanics.set(mechanic, (routePickMechanics.get(mechanic) ?? 0) + 1);
      if (mechanic) approvedMechanics.set(mechanic, (approvedMechanics.get(mechanic) ?? 0) + 1);
      if (theme) {
        for (const trait of theme.split(",").map((part) => part.trim()).filter(Boolean)) {
          approvedMechanics.set(trait, (approvedMechanics.get(trait) ?? 0) + 1);
        }
      }
    }
    if (lesson.decision === "reject" || lesson.decision === "revise" || lesson.verdict === "retire") {
      if (mechanic) rejectedMechanics.set(mechanic, (rejectedMechanics.get(mechanic) ?? 0) + 1);
      if (theme) rejectedThemes.set(theme, (rejectedThemes.get(theme) ?? 0) + 1);
      if (lesson.reason) reasons.push(lesson.reason);
    }
    if (lesson.decision === "approve" || lesson.verdict === "strong") {
      if (mechanic) approvedMechanics.set(mechanic, (approvedMechanics.get(mechanic) ?? 0) + 1);
    }
  }

  const lines = [
    `Recent lessons: ${recent.length}`,
    rejectedMechanics.size
      ? `Avoid mechanics: ${[...rejectedMechanics.entries()].map(([k, v]) => `${k} (${v})`).join("; ")}`
      : "Avoid mechanics: none recorded",
    approvedMechanics.size
      ? `Lean into mechanics: ${[...approvedMechanics.entries()].map(([k, v]) => `${k} (${v})`).join("; ")}`
      : "Lean into mechanics: none recorded yet",
    routePickMechanics.size
      ? `Board route picks: ${[...routePickMechanics.entries()].map(([k, v]) => `${k} (${v})`).join("; ")}`
      : "",
    rejectedThemes.size
      ? `Avoid themes: ${[...rejectedThemes.entries()].map(([k, v]) => `${k} (${v})`).join("; ")}`
      : "Avoid themes: none recorded",
    reasons.length ? `Recent reasons: ${reasons.slice(-4).join(" | ")}` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

function normalizeFeedbackToken(value: string | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function briefMatchesFeedbackToken(briefText: string, token: string): boolean {
  const haystack = normalizeFeedbackToken(briefText);
  const needle = normalizeFeedbackToken(token);
  if (!needle) return false;
  return haystack.includes(needle) || needle.includes(haystack.slice(0, Math.min(haystack.length, needle.length)));
}

/** Bias baseline shell brief selection from human review, vitality, and board route picks. */
export function pickBaselineBriefIndexFromFeedback<T extends { mechanic: string; theme: string; title?: string }>(
  briefs: T[],
  lessons: ContentFeedbackLesson[],
  explicit?: number,
): number {
  if (typeof explicit === "number") return explicit;
  if (briefs.length === 0) return 0;

  const summary = distillContentFeedbackSummary(lessons);
  let bestIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < briefs.length; index += 1) {
    const brief = briefs[index]!;
    let score = 0;

    for (const lesson of lessons) {
      const mechanic = lesson.mechanic?.trim();
      const theme = lesson.theme?.trim();
      if (lesson.source === "child_choice" && lesson.decision === "approve") {
        if (mechanic && briefMatchesFeedbackToken(brief.mechanic, mechanic)) score += 4;
        if (mechanic && brief.title && briefMatchesFeedbackToken(brief.title, mechanic)) score += 2;
        if (theme) {
          for (const trait of theme.split(",").map((part) => part.trim()).filter(Boolean)) {
            if (briefMatchesFeedbackToken(`${brief.theme} ${brief.mechanic}`, trait)) score += 2;
          }
        }
      }
      if (lesson.decision === "reject" || lesson.verdict === "retire") {
        if (mechanic && briefMatchesFeedbackToken(`${brief.mechanic} ${brief.theme}`, mechanic)) score -= 6;
        if (theme && briefMatchesFeedbackToken(brief.theme, theme)) score -= 3;
      }
      if (lesson.decision === "revise" || lesson.verdict === "revise") {
        if (mechanic && briefMatchesFeedbackToken(brief.mechanic, mechanic)) score -= 2;
      }
      if (lesson.verdict === "strong" || lesson.decision === "approve") {
        if (mechanic && briefMatchesFeedbackToken(brief.mechanic, mechanic)) score += 2;
      }
    }

    if (/timer|rush|rapid-fire|stressful/i.test(summary) && /timer|rush|rapid-fire/i.test(brief.mechanic)) {
      score -= 5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}
