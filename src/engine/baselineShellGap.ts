import type { AIContentCatalogItem } from "../context/schemas/learningProfile";
import type { ChildChart } from "../profiles/childChart";
import { listActivityToolContracts } from "./activityToolCatalog";
import type { BaselineShellGapRequest } from "./baselineMechanicBrief";
import type { ContentFeedbackLesson } from "./contentFeedbackMemory";
import type { LearningCycleNodeContract } from "./learningCycleRepository";

export type BaselineShellMatch = {
  activityId: string;
  nodeType: string;
  source: "hand_built" | "generated_shell";
  contentId?: string;
  gameHtmlPath?: string;
  title?: string;
  skillTarget?: string;
  mechanic?: string;
  theme?: string;
  domain?: string;
  targetConcepts?: string[];
  validationPassed?: boolean;
  artworkStatus?: "generated" | "fallback" | "missing";
  sfxProfile?: string;
  companionPolicy?: string;
  evidenceHooks?: string[];
  experienceBrief?: import("./baselineMechanicBrief").BaselineMechanicBrief;
};

const MATH_TOPIC_SHELL_HINTS: Array<{
  keywords: RegExp;
  shells: string[];
  skillTarget: string;
}> = [
  {
    keywords: /\b(time|clock|hour|minute|o'clock)\b/i,
    shells: ["clock-game"],
    skillTarget: "time_telling",
  },
  {
    keywords: /\b(coin|coins|money|cent|dollar|quarter|nickel|dime|penny)\b/i,
    shells: ["coin-counter"],
    skillTarget: "money_reasoning",
  },
  {
    keywords: /\b(multiply|multiplication|times|product|array|equal groups|x\d)\b/i,
    shells: [],
    skillTarget: "multiplication_fluency",
  },
  {
    keywords: /\b(fraction|fractions|numerator|denominator|unit fraction|third|thirds|fourth|fourths|halves)\b/i,
    shells: [],
    skillTarget: "fraction_reasoning",
  },
];

/** "multiplication_fluency" and "multiplication fluency" must compare equal. */
function normalizeSkillText(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ");
}

function catalogGeneratedShells(catalog: AIContentCatalogItem[] | undefined): BaselineShellMatch[] {
  return (catalog ?? [])
    .filter(
      (item) =>
        item.type === "game" &&
        item.reuseStatus === "reuse" &&
        (item.reviewStatus === "approved_ready" || item.reviewDecision === "approve") &&
        Boolean(item.gameHtmlPath || item.contentId.includes("generated-baseline")),
    )
    .map((item) => ({
      activityId: item.activityId ?? "generated-baseline",
      nodeType: "generated-baseline",
      source: "generated_shell" as const,
      contentId: item.contentId,
      gameHtmlPath: item.gameHtmlPath,
      title: item.title,
      skillTarget: item.skillTarget,
      mechanic: item.mechanic,
      theme: item.theme,
      domain: item.domain,
      targetConcepts: item.targetConcepts,
      validationPassed: item.validationStatus === "passed" && item.validationReport?.passed !== false,
      artworkStatus: item.artworkStatus,
      sfxProfile: item.sfxProfile,
      companionPolicy: item.companionPolicy,
      evidenceHooks: item.algorithmTargets,
    }));
}

export function baselineShellMatchesNodeContract(
  shell: BaselineShellMatch,
  node: LearningCycleNodeContract,
): { matches: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const equal = (left: string | undefined, right: string) => left?.trim().toLowerCase() === right.trim().toLowerCase();
  if (!equal(shell.title, node.title)) reasons.push("title");
  if (!equal(shell.domain, node.academicTarget.domain)) reasons.push("domain");
  if (!equal(shell.skillTarget, node.academicTarget.skill)) reasons.push("skill");
  if (!equal(shell.mechanic, node.mechanic)) reasons.push("mechanic");
  if (!equal(shell.theme, node.theme)) reasons.push("theme");
  const concepts = new Set((shell.targetConcepts ?? []).map((value) => value.trim().toLowerCase()));
  if (!node.academicTarget.targets.every((target) => concepts.has(target.trim().toLowerCase()))) reasons.push("targets");
  if (shell.validationPassed !== true) reasons.push("runtime_validation");
  if (shell.artworkStatus !== "generated") reasons.push("artwork");
  const sfx = (shell.sfxProfile ?? "").toLowerCase();
  if (!node.sfxContract.every((event) => sfx.includes(event.toLowerCase()))) reasons.push("sfx");
  const companion = (shell.companionPolicy ?? "").toLowerCase();
  if (!node.companionContract.events.every((event) => companion.includes(event.toLowerCase()))) reasons.push("companion");
  const hooks = new Set((shell.evidenceHooks ?? []).map((value) => value.toLowerCase()));
  for (const [stream, required] of Object.entries(node.evidenceContract)) {
    if (required && !hooks.has(stream.toLowerCase())) reasons.push(`evidence:${stream}`);
  }
  return { matches: reasons.length === 0, reasons };
}

export function detectBaselineShellGap(input: {
  chart: ChildChart;
  homeworkId: string;
  domain: string;
  title: string;
  conceptText: string;
}): BaselineShellGapRequest {
  const text = `${input.title}\n${input.conceptText}`.toLowerCase();
  const matchedTopics = MATH_TOPIC_SHELL_HINTS.filter((hint) => hint.keywords.test(text));
  const topic =
    matchedTopics.length > 0
      ? {
          shells: [...new Set(matchedTopics.flatMap((item) => item.shells))],
          skillTarget: matchedTopics.map((item) => item.skillTarget).join("+"),
        }
      : {
          shells: [] as string[],
          skillTarget: `${input.domain}_practice`,
        };

  const handBuiltMatches = listActivityToolContracts()
    .filter((contract) => contract.domains.includes(input.domain as never))
    .filter((contract) => topic.shells.includes(contract.id))
    .map((contract) => ({
      activityId: contract.id,
      nodeType: contract.nodeType ?? contract.id,
      source: "hand_built" as const,
      title: contract.label,
    }));

  const wantedSkill = normalizeSkillText(topic.skillTarget);
  const generatedMatches = catalogGeneratedShells(input.chart.learningProfile.aiContentCatalog).filter((shell) =>
    [shell.title, shell.skillTarget, shell.contentId]
      .filter(Boolean)
      .some((value) => normalizeSkillText(value ?? "").includes(wantedSkill)),
  );

  const matched = [...handBuiltMatches, ...generatedMatches];
  const needsGeneration = matched.length === 0;

  return {
    childId: input.chart.childId,
    homeworkId: input.homeworkId,
    domain: input.domain,
    skillTarget: topic.skillTarget,
    title: input.title,
    reason: needsGeneration
      ? `No fun baseline shell for ${topic.skillTarget}`
      : `Matched existing baseline shells: ${matched.map((item) => item.activityId).join(", ")}`,
    matchedShells: matched.map((item) => item.activityId),
    needsGeneration,
  };
}

export function resolveBaselineShellMatches(input: {
  chart: ChildChart;
  gap: BaselineShellGapRequest;
}): BaselineShellMatch[] {
  if (input.gap.needsGeneration) return [];
  const text = `${input.gap.title} ${input.gap.skillTarget}`.toLowerCase();
  const handBuilt = listActivityToolContracts()
    .filter((contract) => input.gap.matchedShells.includes(contract.id))
    .map((contract) => ({
      activityId: contract.id,
      nodeType: contract.nodeType ?? contract.id,
      source: "hand_built" as const,
      title: contract.label,
    }));

  const generated = catalogGeneratedShells(input.chart.learningProfile.aiContentCatalog).filter((shell) => {
    const haystack = normalizeSkillText(`${shell.title ?? ""} ${shell.skillTarget ?? ""} ${shell.contentId ?? ""}`);
    return haystack.includes(normalizeSkillText(input.gap.skillTarget)) ||
      text.includes("multiplication") || text.includes("fraction");
  });

  return [...handBuilt, ...generated];
}

/**
 * Preference-weighted shell pick: vitality verdicts and child choice lessons
 * decide which approved shell wins the lane. Retired/rejected shells never
 * fill a lane; revise-flagged shells only fill when nothing better exists.
 */
export function selectPreferredBaselineShell(
  shells: BaselineShellMatch[],
  lessons: ContentFeedbackLesson[],
): BaselineShellMatch | undefined {
  const generated = shells.filter((shell) => shell.source === "generated_shell" && shell.gameHtmlPath);
  if (generated.length === 0) return undefined;

  const scored = generated.map((shell) => {
    const shellLessons = lessons.filter(
      (lesson) => lesson.contentId && lesson.contentId === shell.contentId,
    );
    const latestVerdict = [...shellLessons].reverse().find((lesson) => lesson.verdict)?.verdict;
    const latestDecision = [...shellLessons].reverse().find((lesson) => lesson.decision)?.decision;
    if (latestVerdict === "retire" || latestDecision === "reject") {
      return { shell, score: Number.NEGATIVE_INFINITY };
    }
    let score = 0;
    if (latestVerdict === "strong") score += 2;
    if (latestVerdict === "revise" || latestDecision === "revise") score -= 1;
    if (latestDecision === "approve") score += 1;
    const childPicks = shellLessons.filter((lesson) => lesson.source === "child_choice").length;
    score += Math.min(3, childPicks);
    return { shell, score };
  });

  const eligible = scored.filter((entry) => Number.isFinite(entry.score));
  if (eligible.length === 0) return undefined;
  eligible.sort((a, b) => b.score - a.score);
  const winner = eligible[0]!;
  console.log(
    `🎮 [baseline-factory] [shell-pick] content=${winner.shell.contentId ?? "unknown"} score=${winner.score} candidates=${eligible.length}`,
  );
  return winner.shell;
}

export function formatBaselineShellGapMessage(gap: BaselineShellGapRequest): string {
  if (gap.needsGeneration) {
    return `🎮 [baseline-factory] [gap] ${gap.reason} — generating candidates`;
  }
  return `🎮 [baseline-factory] [reuse] ${gap.reason}`;
}
