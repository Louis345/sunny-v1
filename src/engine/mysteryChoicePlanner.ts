import type { LearningProfile } from "../context/schemas/learningProfile";
import type {
  ChoiceEventSource,
  MysteryChoiceOption,
  MysteryMode,
  NodeConfig,
  NodeType,
} from "../shared/adventureTypes";
import {
  buildMysteryChoiceSet,
  thumbnailUrlForActivity,
  type MysteryChoiceCandidate,
} from "./choiceEvents";

type GeneratedMysteryCandidate = MysteryChoiceCandidate & {
  catalogStatus?: "candidate" | "reuse" | "revise" | "retire" | string;
  evidenceGated?: boolean;
};

export type MysteryChoiceNodeDataInput = {
  childId: string;
  nodeId: string;
  sessionId?: string;
  domain: string;
  words: string[];
  profile?: LearningProfile | null;
  dopamineGames: string[];
  domainValidNodes: NodeConfig[];
  generatedContentOptions?: GeneratedMysteryCandidate[];
  allowSurpriseDrop?: boolean;
  now?: Date;
};

export type MysteryChoiceNodeData = {
  mysteryMode: MysteryMode;
  choiceSetId: string;
  choiceOptions: MysteryChoiceOption[];
  surpriseOption?: MysteryChoiceOption;
  choiceSource: ChoiceEventSource;
};

const DOPAMINE_LABELS: Record<string, { label: string; purposeLabel: string }> = {
  asteroid: { label: "Asteroids", purposeLabel: "SURPRISE GAME" },
  "space-invaders": { label: "Space Invaders", purposeLabel: "SURPRISE GAME" },
  "space-frogger": { label: "Space Frogger", purposeLabel: "SURPRISE GAME" },
  "bubble-pop": { label: "Bubble Pop", purposeLabel: "BRAIN BREAK" },
  "wheel-of-fortune": { label: "Wheel of Fortune", purposeLabel: "SPIN REWARD" },
};

const LEARNING_LABELS: Partial<Record<NodeType, { label: string; purposeLabel: string }>> = {
  "monster-stampede": { label: "Monster Stampede", purposeLabel: "FAST GAME" },
  pronunciation: { label: "Say it out loud", purposeLabel: "VOICE CHALLENGE" },
  karaoke: { label: "Tiny story", purposeLabel: "STORY MISSION" },
  "word-radar": { label: "Word Radar", purposeLabel: "WORD HUNT" },
  "spell-check": { label: "Spell Check", purposeLabel: "SPELL CHECK" },
  "letter-rush": { label: "Letter Rush", purposeLabel: "LETTER RUSH" },
  wordle: { label: "Word Puzzle", purposeLabel: "WORD PUZZLE" },
};

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_") || "general";
}

function domainBucket(value: string): string {
  const domain = normalizeDomain(value);
  if (domain.includes("spell")) return "spelling";
  if (domain.includes("read")) return "reading";
  if (domain.includes("science")) return "science";
  if (domain.includes("math")) return "math";
  if (domain.includes("pronunciation") || domain.includes("fluency")) return "pronunciation";
  if (domain.includes("vocab")) return "vocabulary";
  return domain;
}

const DOMAIN_LEARNING_NODE_GATE: Record<string, ReadonlySet<NodeType>> = {
  spelling: new Set([
    "word-radar",
    "spell-check",
    "letter-rush",
    "monster-stampede",
    "word-builder",
    "wordle",
    "wheel-of-fortune",
    "pronunciation",
    "karaoke",
  ]),
  reading: new Set([
    "concept-check",
    "visual-explainer",
    "karaoke",
    "pronunciation",
    "word-radar",
  ]),
  science: new Set([
    "concept-check",
    "visual-explainer",
    "karaoke",
    "pronunciation",
    "word-radar",
  ]),
  math: new Set([
    "concept-check",
    "visual-explainer",
    "clock-game",
    "coin-counter",
  ]),
  pronunciation: new Set(["pronunciation", "karaoke", "word-radar"]),
  vocabulary: new Set([
    "concept-check",
    "visual-explainer",
    "word-radar",
    "spell-check",
    "letter-rush",
    "monster-stampede",
    "word-builder",
    "wordle",
    "wheel-of-fortune",
    "karaoke",
    "pronunciation",
  ]),
};

function learningNodeBelongsToDomain(node: NodeConfig, domain: string): boolean {
  const gate = DOMAIN_LEARNING_NODE_GATE[domainBucket(domain)];
  if (!gate) return true;
  return gate.has(node.type);
}

function scoreActivity(profile: LearningProfile | null | undefined, activityId: string): number {
  const model = profile?.activityModel?.[activityId];
  if (!model) return 0;
  return (
    model.engagementScore +
    model.completionRate * 0.5 +
    (model.likedCount ?? 0) * 0.15 -
    model.frustrationScore -
    (model.dislikedCount ?? 0) * 0.2
  );
}

function hasStrongPreferenceEvidence(profile: LearningProfile | null | undefined): boolean {
  return Object.values(profile?.activityModel ?? {}).some((entry) => {
    const likes = entry.likedCount ?? 0;
    const dislikes = entry.dislikedCount ?? 0;
    return (
      entry.plays >= 3 &&
      entry.completionRate >= 0.7 &&
      entry.engagementScore >= 0.65 &&
      entry.frustrationScore < 0.35 &&
      likes > dislikes
    );
  });
}

function mentalLoadAllowsSurprise(
  profile: LearningProfile | null | undefined,
  domain: string,
): boolean {
  const load = profile?.adaptiveLoadState?.[normalizeDomain(domain)];
  if (!load) return false;
  return (
    load.lastLoadEvidence.strongEvidence === true ||
    load.challengeRecommendation === "expand_cohort" ||
    load.challengeRecommendation === "maintain"
  );
}

function optionId(activityId: string, suffix: string): string {
  return `${activityId.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}-${suffix}`;
}

function dopamineGamesForDomain(domain: string, dopamineGames: string[]): string[] {
  const out = [...dopamineGames];
  if (
    (domain === "spelling" || domain === "vocabulary") &&
    !out.includes("wheel-of-fortune")
  ) {
    out.unshift("wheel-of-fortune");
  }
  return [...new Set(out)];
}

function dopamineCandidate(activityId: string, idx: number): MysteryChoiceCandidate {
  const copy = DOPAMINE_LABELS[activityId] ?? {
    label: activityId
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" "),
    purposeLabel: "SURPRISE GAME",
  };
  return {
    optionId: optionId(activityId, `dopamine-${idx}`),
    activityId,
    label: copy.label,
    purposeLabel: copy.purposeLabel,
    nodeType: activityId === "wheel-of-fortune" ? "wheel-of-fortune" : undefined,
    gameFile:
      activityId === "wheel-of-fortune"
        ? "WheelOfFortune.html"
        : `${activityId}.html`,
    activityKind: "dopamine_game",
  };
}

function learningCandidate(node: NodeConfig, idx: number, domain: string): MysteryChoiceCandidate | null {
  if (node.type === "mystery" || node.type === "quest" || node.type === "boss") return null;
  const copy = LEARNING_LABELS[node.type] ?? {
    label: node.type
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" "),
    purposeLabel: "LEARNING",
  };
  return {
    optionId: optionId(node.type, `learning-${idx}`),
    activityId: node.type,
    nodeType: node.type,
    label: copy.label,
    purposeLabel: copy.purposeLabel,
    gameFile: node.gameFile,
    domain,
    activityKind: "learning_activity",
  };
}

function generatedCandidate(candidate: GeneratedMysteryCandidate): MysteryChoiceCandidate | null {
  if (candidate.activityKind !== "generated_learning") return null;
  if (candidate.evidenceGated !== true) return null;
  if (candidate.catalogStatus !== "reuse" && candidate.catalogStatus !== "candidate") return null;
  return candidate;
}

function uniqueCandidates(candidates: MysteryChoiceCandidate[]): MysteryChoiceCandidate[] {
  const seen = new Set<string>();
  const out: MysteryChoiceCandidate[] = [];
  for (const candidate of candidates) {
    const key = candidate.optionId ?? candidate.activityId;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

function rankCandidates(
  profile: LearningProfile | null | undefined,
  candidates: MysteryChoiceCandidate[],
): MysteryChoiceCandidate[] {
  return [...candidates].sort(
    (a, b) => scoreActivity(profile, b.activityId) - scoreActivity(profile, a.activityId),
  );
}

function choiceLabCandidates(input: {
  profile?: LearningProfile | null;
  learning: MysteryChoiceCandidate[];
  dopamine: MysteryChoiceCandidate[];
  generated: MysteryChoiceCandidate[];
}): MysteryChoiceCandidate[] {
  const learning =
    hasStrongPreferenceEvidence(input.profile)
      ? rankCandidates(input.profile, input.learning)
      : input.learning;
  const dopamine = rankCandidates(input.profile, input.dopamine);
  const generated = rankCandidates(input.profile, input.generated);
  return uniqueCandidates([
    ...dopamine.slice(0, 1),
    ...learning.slice(0, 2),
    ...generated.slice(0, 1),
    ...dopamine.slice(1),
    ...learning.slice(2),
    ...generated.slice(1),
  ]);
}

export function buildMysteryChoiceNodeData(
  input: MysteryChoiceNodeDataInput,
): MysteryChoiceNodeData {
  const domain = normalizeDomain(input.domain);
  const learning = input.domainValidNodes
    .filter((node) => learningNodeBelongsToDomain(node, domain))
    .map((node, idx) => learningCandidate(node, idx, domain))
    .filter((candidate): candidate is MysteryChoiceCandidate => candidate != null);
  const dopamine = dopamineGamesForDomain(domain, input.dopamineGames).map(dopamineCandidate);
  const generated = (input.generatedContentOptions ?? [])
    .map(generatedCandidate)
    .filter((candidate): candidate is MysteryChoiceCandidate => candidate != null);

  const surpriseCandidates = uniqueCandidates([
    ...learning,
    ...dopamine,
    ...generated,
  ]);
  const useSurprise =
    input.allowSurpriseDrop === true &&
    hasStrongPreferenceEvidence(input.profile) &&
    mentalLoadAllowsSurprise(input.profile, domain) &&
    surpriseCandidates.length > 0;
  const ordered = useSurprise
    ? rankCandidates(input.profile, surpriseCandidates)
    : choiceLabCandidates({
        profile: input.profile,
        learning,
        dopamine,
        generated,
      });
  const choiceSet = buildMysteryChoiceSet({
    childId: input.childId,
    sessionId: input.sessionId,
    nodeId: input.nodeId,
    domain,
    candidates: ordered,
    maxOptions: 3,
    now: input.now,
  });

  const mode: MysteryMode = useSurprise ? "surprise_drop" : "choice_lab";
  const choiceSource: ChoiceEventSource = useSurprise ? "system_recommendation" : "child_choice";
  return {
    mysteryMode: mode,
    choiceSetId: choiceSet.choiceSetId,
    choiceOptions: choiceSet.shownOptions,
    ...(useSurprise ? { surpriseOption: choiceSet.shownOptions[0] } : {}),
    choiceSource,
  };
}
