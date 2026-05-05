import fs from "fs";
import path from "path";
import { planSession } from "../engine/learningEngine";
import { readChildMeta } from "../profiles/childrenConfig";
import { daysUntilHomeworkTest, selectHomeworkSessionWords } from "../shared/homeworkWordSelection";
import { readWordBank } from "../utils/wordBankIO";
import {
  buildHomeworkCarePlan,
  type HomeworkCarePlan,
  type HomeworkCarePlanIntervention,
} from "../engine/homeworkCarePlan";

export type HomeworkType =
  | "spelling_test"
  | "reading"
  | "math"
  | "coins"
  | "clocks"
  | "generic";

export type PracticeDomain =
  | "spelling"
  | "reading"
  | "math"
  | "writing"
  | "generic";

export type ContentDomain =
  | "science"
  | "social_studies"
  | "language_arts"
  | "math"
  | "generic";

export type ContentProfile = {
  practiceDomain: PracticeDomain;
  contentDomain: ContentDomain;
  topic: string;
  primarySkill: string;
  assignmentFormat: string;
  concepts: string[];
  sourceEvidence: string[];
};

export type CapturedHomeworkContent = {
  title: string;
  type: HomeworkType;
  rawText: string;
  words: string[];
  questions: unknown[];
  sourceDocuments: Array<{
    filename: string;
    mediaType?: string;
  }>;
  contentProfile: ContentProfile;
};

export type BaselineActivityRecommendation = {
  id: "reading-mode" | "countdown-comprehension";
  sourcePrototype: "Reading Mode Standalone.html" | "Countdown Standalone.html";
  reason: string;
};

export type LearningStruggleSignal = {
  skill: string;
  evidence: string;
  severity: 1 | 2 | 3;
};

export type DynamicContentBrief = {
  childId: string;
  assignment: {
    title: string;
    type: HomeworkType;
    topic: string;
    practiceDomain: PracticeDomain;
    contentDomain: ContentDomain;
    concepts: string[];
    sourceDocuments: CapturedHomeworkContent["sourceDocuments"];
  };
  sourceText: string;
  reviewWords: string[];
  questions: unknown[];
  flowHooks: string[];
  gapPlan: LearningStruggleSignal[];
  allowedActivities: BaselineActivityRecommendation[];
  generationGoals: string[];
};

export type VariableRewardEvidence = {
  completedBaselineActivities: Array<BaselineActivityRecommendation["id"]>;
  latestAccuracy: number;
  recoveredAfterMiss: boolean;
  streakCount: number;
};

export type VariableRewardStep = {
  type:
    | "story-image-finale"
    | "mystery-reward"
    | "targeted-support"
    | "generate-quest"
    | "boss-teaser";
  reason: string;
  targetSkills?: string[];
};

export type VariableRewardPlan = {
  nextSteps: VariableRewardStep[];
  variableReward: {
    triggered: boolean;
    chance: number;
    roll: number;
    reason: string;
  };
  questDecision: {
    status: "generate" | "hold" | "not_applicable";
    reason: string;
  };
  rationale: string[];
};

export type PlannedHomeworkNode = {
  id: string;
  type:
    | "word-radar"
    | "spell-check"
    | "pronunciation"
    | "karaoke"
    | "word-builder"
    | "quest"
    | "boss"
    | "wheel-of-fortune";
  words: string[];
  wordRadarItems?: Array<{
    display: string;
    acceptedResponses: string[];
    label?: string;
    subject?: string;
  }>;
  difficulty: 1 | 2 | 3;
  rationale: string;
  gameFile?: string | null;
  storyFile?: string | null;
  storyText?: string;
  storyTitle?: string;
  storyImagePrompt?: string;
  carePlan?: {
    interventionId: string;
    role: HomeworkCarePlanIntervention["type"];
    targetSkills: string[];
    targetConcepts: string[];
    targetWords: string[];
    algorithmTargets: string[];
    measures: string[];
    reason: string;
  };
  date?: string;
};

type NormalizableExtraction = {
  title: string;
  type: HomeworkType | string;
  words: string[];
  questions: unknown[];
  contentProfile?: Partial<ContentProfile> | null;
};

function cleanList(values: unknown[] | undefined): string[] {
  return [...new Set(
    (values ?? [])
      .map((v) => String(v ?? "").trim())
      .filter(Boolean),
  )];
}

function evidenceText(extraction: NormalizableExtraction): string {
  return [
    extraction.title,
    extraction.words.join(" "),
    extraction.questions
      .map((q) => JSON.stringify(q))
      .join(" "),
  ].join(" ").toLowerCase();
}

function practiceDomainFor(type: string): PracticeDomain {
  if (type === "spelling_test" || type === "spelling") return "spelling";
  if (type === "reading" || type === "comprehension") return "reading";
  if (type === "math" || type === "coins" || type === "clocks") return "math";
  return "generic";
}

function inferPrimarySkill(extraction: NormalizableExtraction): string {
  const words = extraction.words.map((w) => w.toLowerCase());
  const hasErEstPairs = words.some((w) => w.endsWith("er")) && words.some((w) => w.endsWith("est"));
  if (hasErEstPairs) return "comparative_and_superlative_adjectives";
  if (practiceDomainFor(String(extraction.type)) === "spelling") return "spelling_production";
  return "content_understanding";
}

function inferAssignmentFormat(extraction: NormalizableExtraction): string {
  const text = evidenceText(extraction);
  if (text.includes("picture code") || text.includes("decode")) return "picture_code_decode";
  if (text.includes("multiple_choice")) return "multiple_choice";
  return "worksheet";
}

function inferContentDomainAndTopic(extraction: NormalizableExtraction): Pick<ContentProfile, "contentDomain" | "topic" | "concepts" | "sourceEvidence"> {
  const text = evidenceText(extraction);
  const scienceConcepts = [
    "erosion",
    "weathering",
    "sediment",
    "landform",
    "landforms",
    "soil",
    "rocks",
    "water",
    "wind",
  ];
  const hits = scienceConcepts.filter((term) => text.includes(term));
  if (hits.length > 0) {
    return {
      contentDomain: "science",
      topic: hits.includes("erosion") ? "erosion" : hits[0]!,
      concepts: cleanList(hits),
      sourceEvidence: hits.map((term) => `matched science term: ${term}`),
    };
  }
  return {
    contentDomain: practiceDomainFor(String(extraction.type)) === "math" ? "math" : "language_arts",
    topic: extraction.title || String(extraction.type || "homework"),
    concepts: [],
    sourceEvidence: ["No explicit cross-domain topic detected."],
  };
}

export function normalizeContentProfile(extraction: NormalizableExtraction): ContentProfile {
  const inferred = inferContentDomainAndTopic(extraction);
  const raw = extraction.contentProfile ?? {};
  const practiceDomain = raw.practiceDomain ?? practiceDomainFor(String(extraction.type));
  const contentDomain = raw.contentDomain ?? inferred.contentDomain;
  const topic = String(raw.topic ?? inferred.topic ?? extraction.title).trim() || "homework";
  const primarySkill =
    String(raw.primarySkill ?? inferPrimarySkill(extraction)).trim() || "content_understanding";
  const assignmentFormat =
    String(raw.assignmentFormat ?? inferAssignmentFormat(extraction)).trim() || "worksheet";
  const concepts = cleanList([
    ...inferred.concepts,
    ...cleanList(raw.concepts),
  ]);
  const sourceEvidence = cleanList([
    ...inferred.sourceEvidence,
    ...cleanList(raw.sourceEvidence),
  ]);
  return {
    practiceDomain,
    contentDomain,
    topic,
    primarySkill,
    assignmentFormat,
    concepts,
    sourceEvidence,
  };
}

export function buildCapturedHomeworkContent(args: {
  title: string;
  type: HomeworkType | string;
  rawText?: string | null;
  words: string[];
  questions: unknown[];
  sourceDocuments?: Array<{
    filename: string;
    mediaType?: string;
  }>;
  contentProfile?: ContentProfile | Partial<ContentProfile> | null;
}): CapturedHomeworkContent {
  const type = practiceDomainFor(String(args.type)) === "spelling"
    ? "spelling_test"
    : normalizeHomeworkContentType(String(args.type));
  const words = cleanList(args.words);
  const questions = Array.isArray(args.questions) ? [...args.questions] : [];
  const contentProfile = normalizeContentProfile({
    title: args.title,
    type,
    words,
    questions,
    contentProfile: args.contentProfile,
  });
  return {
    title: String(args.title ?? "Untitled Homework").trim() || "Untitled Homework",
    type,
    rawText: String(args.rawText ?? "").trim(),
    words,
    questions,
    sourceDocuments: cleanSourceDocuments(args.sourceDocuments),
    contentProfile,
  };
}

function normalizeHomeworkContentType(type: string): HomeworkType {
  const t = type.trim().toLowerCase();
  if (t === "spelling_test" || t === "reading" || t === "math" || t === "coins" || t === "clocks") {
    return t;
  }
  return "generic";
}

function cleanSourceDocuments(
  docs: Array<{ filename: string; mediaType?: string }> | undefined,
): CapturedHomeworkContent["sourceDocuments"] {
  const byName = new Map<string, { filename: string; mediaType?: string }>();
  for (const doc of docs ?? []) {
    const filename = String(doc.filename ?? "").trim();
    if (!filename) continue;
    byName.set(filename, {
      filename,
      ...(doc.mediaType ? { mediaType: String(doc.mediaType) } : {}),
    });
  }
  return [...byName.values()].sort((a, b) => a.filename.localeCompare(b.filename));
}

export function recommendBaselineActivities(
  captured: CapturedHomeworkContent,
): BaselineActivityRecommendation[] {
  const profile = captured.contentProfile;
  const topic = profile.topic || captured.title || "homework";
  const hasQuestions = captured.questions.length > 0;
  const hasReadableText = captured.rawText.trim().length > 0;
  const isMathDomain =
    profile.practiceDomain === "math" ||
    profile.contentDomain === "math" ||
    captured.type === "math" ||
    captured.type === "coins" ||
    captured.type === "clocks";
  if (isMathDomain) {
    return [];
  }
  const isReadingFlow =
    profile.practiceDomain === "reading" ||
    profile.primarySkill.toLowerCase().includes("comprehension");
  const isConceptReview =
    profile.contentDomain === "science" ||
    profile.contentDomain === "social_studies" ||
    profile.concepts.length > 0;

  if (!isReadingFlow && !isConceptReview) {
    return [];
  }

  const recommendations: BaselineActivityRecommendation[] = [];
  if (hasReadableText) {
    recommendations.push({
      id: "reading-mode",
      sourcePrototype: "Reading Mode Standalone.html",
      reason: `Reading Mode fits ${topic} because the captured homework has passage text to read and reveal.`,
    });
  }
  if (hasQuestions && (isReadingFlow || isConceptReview)) {
    recommendations.push({
      id: "countdown-comprehension",
      sourcePrototype: "Countdown Standalone.html",
      reason: `Countdown fits ${topic} because the captured homework has comprehension or concept-check questions.`,
    });
  }
  return recommendations;
}

export function buildDynamicContentBrief(args: {
  childId: string;
  captured: CapturedHomeworkContent;
  childEngagementTags?: string[];
  struggleSignals?: LearningStruggleSignal[];
}): DynamicContentBrief {
  const profile = args.captured.contentProfile;
  const flowHooks = cleanList(args.childEngagementTags);
  const gapPlan = [...(args.struggleSignals ?? [])]
    .filter((signal) => String(signal.skill ?? "").trim() && String(signal.evidence ?? "").trim())
    .sort((a, b) => b.severity - a.severity);
  const topic = profile.topic || args.captured.title || "homework";
  const gapSkills = gapPlan.map((gap) => gap.skill);
  const generationGoals = [
    `Create engaging content about ${topic} that keeps the academic concept accurate.`,
    flowHooks.length > 0 || gapSkills.length > 0
      ? `Use ${flowHooks.length > 0 ? flowHooks.join(", ") : "the child profile"} as the flow-state wrapper, then target ${gapSkills.length > 0 ? gapSkills.join(", ") : profile.primarySkill} underneath.`
      : `Use the child profile as the flow-state wrapper, then target ${profile.primarySkill} underneath.`,
    "Only use baseline activities that match the homework domain and captured evidence.",
  ];
  return {
    childId: args.childId,
    assignment: {
      title: args.captured.title,
      type: args.captured.type,
      topic,
      practiceDomain: profile.practiceDomain,
      contentDomain: profile.contentDomain,
      concepts: [...profile.concepts],
      sourceDocuments: [...args.captured.sourceDocuments],
    },
    sourceText: args.captured.rawText,
    reviewWords: [...args.captured.words],
    questions: [...args.captured.questions],
    flowHooks,
    gapPlan,
    allowedActivities: recommendBaselineActivities(args.captured),
    generationGoals,
  };
}

function clampRewardNumber(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function variableRewardChance(evidence: VariableRewardEvidence): number {
  const accuracy = clampRewardNumber(evidence.latestAccuracy, 0);
  let chance = 0.15;
  if (accuracy >= 0.85) chance += 0.2;
  if (evidence.recoveredAfterMiss) chance += 0.2;
  if (evidence.streakCount >= 2) chance += 0.15;
  if (evidence.completedBaselineActivities.length >= 2) chance += 0.1;
  return clampRewardNumber(chance, 0.15);
}

export function buildVariableRewardPlan(args: {
  brief: DynamicContentBrief;
  evidence: VariableRewardEvidence;
  rewardRoll?: number;
}): VariableRewardPlan {
  const topic = args.brief.assignment.topic;
  const allowedIds = new Set(args.brief.allowedActivities.map((activity) => activity.id));
  const completed = new Set(args.evidence.completedBaselineActivities);
  const readingPathApplies =
    allowedIds.has("reading-mode") || allowedIds.has("countdown-comprehension");
  const roll = clampRewardNumber(args.rewardRoll ?? Math.random(), 1);
  const chance = readingPathApplies ? variableRewardChance(args.evidence) : 0;
  const rewardTriggered = readingPathApplies && roll <= chance;
  const weakPerformance = args.evidence.latestAccuracy < 0.65 && !args.evidence.recoveredAfterMiss;
  const targetSkills = args.brief.gapPlan.slice(0, 2).map((gap) => gap.skill);
  const completedEnoughBaseline =
    completed.has("reading-mode") &&
    (completed.has("countdown-comprehension") || args.brief.questions.length === 0);
  const canGenerateQuest =
    readingPathApplies &&
    completedEnoughBaseline &&
    !weakPerformance &&
    (
      args.evidence.latestAccuracy >= 0.75 ||
      args.evidence.recoveredAfterMiss ||
      args.evidence.streakCount >= 2
    );

  const nextSteps: VariableRewardStep[] = [];
  const rationale = [
    `Topic ${topic} routed through ${args.brief.assignment.practiceDomain}/${args.brief.assignment.contentDomain}.`,
  ];

  if (readingPathApplies && completed.has("reading-mode")) {
    nextSteps.push({
      type: "story-image-finale",
      reason: `Reward the completed ${topic} reading with a visual finale before asking for more work.`,
    });
  }

  if (rewardTriggered) {
    nextSteps.push({
      type: "mystery-reward",
      reason: `Variable reward triggered at roll ${roll.toFixed(2)} against chance ${chance.toFixed(2)}.`,
    });
  }

  let questDecision: VariableRewardPlan["questDecision"];
  if (!readingPathApplies) {
    questDecision = {
      status: "not_applicable",
      reason: "No domain-valid reading/comprehension baseline activity is available for this homework.",
    };
  } else if (canGenerateQuest) {
    questDecision = {
      status: "generate",
      reason: `Generate an adaptive quest from captured ${topic} evidence and the latest successful baseline performance.`,
    };
    nextSteps.push({
      type: "generate-quest",
      reason: questDecision.reason,
      targetSkills: targetSkills.length > 0 ? targetSkills : [args.brief.assignment.practiceDomain],
    });
  } else {
    questDecision = {
      status: "hold",
      reason: weakPerformance
        ? "Hold quest generation until targeted support improves the current gap."
        : "Hold quest generation until enough baseline activities are completed.",
    };
    if (targetSkills.length > 0) {
      nextSteps.push({
        type: "targeted-support",
        reason: questDecision.reason,
        targetSkills,
      });
    }
  }

  nextSteps.push({
    type: "boss-teaser",
    reason: "Keep boss as the mastery-gated finale; unlock only after generated quest evidence exists.",
  });

  rationale.push(questDecision.reason);
  if (rewardTriggered) {
    rationale.push(`Variable reward supports flow without making ${topic} practice feel fixed or predictable.`);
  }
  return {
    nextSteps,
    variableReward: {
      triggered: rewardTriggered,
      chance,
      roll,
      reason: rewardTriggered
        ? "Reward triggered by accuracy, recovery, streak, or baseline completion."
        : "Reward held for a later variable interval.",
    },
    questDecision,
    rationale,
  };
}

function wordRadarItemsFromWordList(wordList: string[]): NonNullable<PlannedHomeworkNode["wordRadarItems"]> {
  return wordList.map((w) => ({
    display: w,
    acceptedResponses: [w.toLowerCase()],
    label: "Spelling",
    subject: "spelling",
  }));
}

function conceptCheckItems(concepts: string[]): NonNullable<PlannedHomeworkNode["wordRadarItems"]> {
  return concepts.map((concept) => ({
    display: concept,
    acceptedResponses: [concept.toLowerCase()],
    label: "Concept Check",
    subject: "reading",
  }));
}

function contentPracticeTerms(profile: ContentProfile, fallbackWords: string[]): string[] {
  const terms = cleanList([
    ...profile.concepts,
    profile.topic,
    ...fallbackWords,
  ]).filter((term) => term.length > 1);
  return terms.slice(0, 5);
}

function buildContentSupportNodes(args: {
  carePlan: HomeworkCarePlan;
}): PlannedHomeworkNode[] {
  const idSuffix = args.carePlan.homeworkId.replace(/[^a-zA-Z0-9-_]/g, "-");
  return args.carePlan.interventions
    .filter((intervention) => intervention.id !== "story")
    .filter((intervention) =>
      ["baseline-evaluator", "pronunciation", "concept-builder", "exit-evaluator"].includes(
        intervention.type,
      ),
    )
    .map((intervention): PlannedHomeworkNode => {
      const words = intervention.targetWords;
      const base = {
        id: `n-${intervention.id}-${idSuffix}`,
        type: intervention.nodeType,
        words,
        difficulty: intervention.type === "exit-evaluator" ? 2 : 1,
        rationale: intervention.reason,
        gameFile: null,
        storyFile: null,
        carePlan: {
          interventionId: intervention.id,
          role: intervention.type,
          targetSkills: intervention.targetSkills,
          targetConcepts: intervention.targetConcepts,
          targetWords: intervention.targetWords,
          algorithmTargets: intervention.algorithmTargets,
          measures: intervention.measures,
          reason: intervention.reason,
        },
      } satisfies PlannedHomeworkNode;
      if (intervention.nodeType === "word-radar") {
        return {
          ...base,
          wordRadarItems: conceptCheckItems(words),
        };
      }
      return base;
    });
}

function tokenizeStory(story: string): string[] {
  return story
    .replace(/[^A-Za-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

function childStoryName(childId: string): string {
  const id = childId.trim().toLowerCase();
  if (id === "ila") return "Ila";
  if (id === "reina") return "Reina";
  if (id === "creator") return "Creator";
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : "the learner";
}

function sm2ReinforcementWords(childId: string, fallbackWords: string[]): string[] {
  if (fallbackWords.length > 0) return fallbackWords.slice(0, 3);
  try {
    const plan = planSession(childId, "spelling", {
      homeworkFallbackWords: [],
    });
    return [...plan.reviewWords, ...plan.newWords].slice(0, 3);
  } catch {
    return [];
  }
}

function readChildContextSummary(childId: string): string {
  const id = childId.trim().toLowerCase();
  if (!id) return "";
  const file = path.join(process.cwd(), "src", "context", id, `${id}_context.md`);
  try {
    return fs.existsSync(file) ? fs.readFileSync(file, "utf-8").slice(0, 6000) : "";
  } catch {
    return "";
  }
}

function childInterestTags(childId: string, childContextSummary: string): string[] {
  const id = childId.trim().toLowerCase();
  const text = childContextSummary.toLowerCase();
  const tags: string[] = [];
  if (text.includes("wrestling")) tags.push("wrestling");
  if (text.includes("competition") || text.includes("competitive")) tags.push("competition");
  if (text.includes("challenge") || text.includes("high-challenge")) tags.push("challenge");
  if (text.includes("strategy")) tags.push("strategy");
  if (text.includes("personal best") || text.includes("streak")) tags.push("personal bests");

  const childMeta = readChildMeta(id);
  if (childMeta?.games) tags.push(...Object.keys(childMeta.games));

  return [...new Set(tags)];
}

function practiceWordsSentence(name: string, words: string[]): string | null {
  const selected = words.slice(0, 8).filter(Boolean);
  if (selected.length === 0) return null;
  return `${name} also spotted the review words ${selected.join(", ")} and used them as clue cards for the next challenge.`;
}

function moodPhraseForStoryImage(tags: string[], fallback: string): string {
  const selected = tags.slice(0, 3).filter(Boolean);
  if (selected.length === 0) return fallback;
  return `${selected.join(", ")} adventure mood`;
}

function childHookLine(name: string, tags: string[]): string {
  const interestText = tags.join(" ").toLowerCase();
  const isReina = name.trim().toLowerCase() === "reina";
  if (isReina && interestText.includes("wrestling")) {
    return `${name} treated it like a wrestling challenge and looked for the smartest next move.`;
  }
  if (interestText.includes("strategy")) {
    return `${name} turned it into a strategy challenge and searched for the strongest clue first.`;
  }
  if (interestText.includes("competition")) {
    return `${name} treated it like a competition and tried to beat the challenge with careful thinking.`;
  }
  if (interestText.includes("personal best")) {
    return `${name} focused on beating a personal best by explaining the idea more clearly each round.`;
  }
  return `${name} turned it into a focused learning challenge.`;
}

function capturedQuestionAnswers(captured: CapturedHomeworkContent | undefined): string[] {
  const questions = Array.isArray(captured?.questions) ? captured.questions : [];
  return cleanList(
    questions.flatMap((question) => {
      if (!question || typeof question !== "object") return [];
      const record = question as Record<string, unknown>;
      return [record.correctAnswer, record.hint, record.question];
    }),
  );
}

function storyEvidenceLines(args: {
  profile: ContentProfile;
  capturedContent?: CapturedHomeworkContent;
}): string[] {
  const { profile, capturedContent } = args;
  const rawParts = cleanList([
    ...(capturedContent?.rawText ? capturedContent.rawText.split(/[\n.]+/) : []),
    ...capturedQuestionAnswers(capturedContent),
    ...profile.sourceEvidence,
  ]);
  const normalized = rawParts.map((part) => part.replace(/\s+/g, " ").trim());
  const matches: string[] = [];
  for (const line of normalized) {
    const lower = line.toLowerCase();
    if (
      profile.topic.toLowerCase().includes("erosion") &&
      lower.includes("wear away rocks and soil")
    ) {
      matches.push("Erosion happens when wind, water, or ice wear away rocks and soil.");
      continue;
    }
    if (profile.topic.toLowerCase().includes("erosion") && lower.includes("downhill")) {
      matches.push("Rivers and water flow downhill, often from mountains toward lakes, beaches, or oceans.");
      continue;
    }
    if (profile.topic.toLowerCase().includes("erosion") && lower.includes("sand")) {
      matches.push("Sand and soil can move to new places when water keeps carrying them along.");
      continue;
    }
  }
  return cleanList(matches).slice(0, 3);
}

function storyForContent(args: {
  childId: string;
  profile: ContentProfile;
  words: string[];
  childInterests: string[];
  childContextSummary: string;
  capturedContent?: CapturedHomeworkContent;
}): {
  title: string;
  text: string;
  imagePrompt: string;
} {
  const { childId, profile, words, childInterests, capturedContent } = args;
  const topic = profile.topic || "today's homework";
  const conceptLine = profile.concepts.slice(0, 5).join(", ") || topic;
  const name = childStoryName(childId);
  const practiceSentence = practiceWordsSentence(name, words);
  const evidenceLines = storyEvidenceLines({ profile, capturedContent });
  if (capturedContent && evidenceLines.length > 0) {
    const text = [
      `${name} opened the homework like a real mission and searched for the most important clues first.`,
      childHookLine(name, childInterests),
      ...evidenceLines,
      `${name} used those clues to explain ${topic} in a way that matched the worksheet evidence.`,
      practiceSentence,
    ].filter(Boolean).join(" ");
    return {
      title: `${name} and ${topic}`,
      text,
      imagePrompt:
        `A child-friendly illustrated scene of ${name} as the central visible character learning about ${topic}. Use a homework-relevant background that shows ${conceptLine}. Keep the child recognizable and visually distinct with strong foreground/background contrast. Mood: ${moodPhraseForStoryImage(childInterests, "curious learning mood")}.`,
    };
  }
  const interestLine = childHookLine(name, childInterests);
  const text = [
    `${name} is learning about ${topic}.`,
    `Key ideas include ${conceptLine}.`,
    interestLine,
    practiceSentence,
    `${name} read each sentence carefully, then used the clues in the next challenge.`,
  ].filter(Boolean).join(" ");
  return {
    title: `${name} and ${topic}`,
    text,
    imagePrompt: `A child-friendly illustration of ${name} as the central visible character learning about ${topic}, showing ${conceptLine}.`,
  };
}

function buildSpellingNodes(args: {
  childId: string;
  homeworkId: string;
  words: string[];
  testDate?: string | null;
  missedWords?: string[];
}): PlannedHomeworkNode[] {
  const childMeta = readChildMeta(args.childId);
  const maxWords =
    childMeta?.games?.["word-radar"]?.maxWords ??
    childMeta?.games?.["spell-check"]?.maxWords ??
    5;
  const today = new Date().toISOString().slice(0, 10);
  const bank = readWordBank(args.childId);
  const sm2Plan = planSession(args.childId, "spelling", {
    homeworkFallbackWords: args.words,
  });
  const selected = selectHomeworkSessionWords({
    wordList: args.words,
    sm2Plan,
    missedWords: args.missedWords ?? [],
    testDate: args.testDate ?? null,
    maxWords,
    testImminent: daysUntilHomeworkTest(args.testDate ?? null, today) <= 5,
    wordBankWords: bank.words,
    todayIso: today,
  });
  const idSuffix = args.homeworkId.replace(/[^a-zA-Z0-9-_]/g, "-");
  return [
    {
      id: `n-word-radar-${idSuffix}`,
      type: "word-radar",
      words: [...selected],
      wordRadarItems: wordRadarItemsFromWordList(selected),
      difficulty: 1,
      rationale: "Word radar warms up recognition for the spelling-list words.",
      gameFile: null,
      storyFile: null,
    },
    {
      id: `n-spell-check-${idSuffix}`,
      type: "spell-check",
      words: [...selected],
      difficulty: 2,
      rationale: "Spell-check captures spelling production attempts for diagnostics.",
      gameFile: null,
      storyFile: null,
    },
    {
      id: `n-wheel-${idSuffix}`,
      type: "wheel-of-fortune",
      words: [...selected],
      difficulty: 2,
      rationale: "Wheel of Fortune gives competitive retrieval practice with the same list.",
      gameFile: null,
      storyFile: null,
    },
  ];
}

export function buildContentAwareHomeworkNodes(args: {
  type: HomeworkType;
  words: string[];
  homeworkId: string;
  childId: string;
  testDate?: string | null;
  missedWords?: string[];
  contentProfile?: ContentProfile | null;
  capturedContent?: CapturedHomeworkContent;
}): PlannedHomeworkNode[] {
  const spellingNodes =
    args.type === "spelling_test"
      ? buildSpellingNodes(args)
      : [];
  const profile = args.contentProfile;
  const hasContentContext =
    profile &&
    profile.contentDomain !== "language_arts" &&
    profile.contentDomain !== "generic" &&
    profile.topic.trim().length > 0 &&
    profile.topic !== "homework" &&
    profile.topic !== "spelling_test";

  if (!hasContentContext) {
    return spellingNodes;
  }

  const carePlan = buildHomeworkCarePlan({
    homeworkId: args.homeworkId,
    childId: args.childId,
    title: profile.topic,
    type: args.type,
    words: args.words,
    contentProfile: profile,
    reinforcementWords: sm2ReinforcementWords(args.childId, args.words),
  });
  const childContextSummary = readChildContextSummary(args.childId);
  const storyIntervention = carePlan.interventions.find((i) => i.id === "story");
  const story = storyForContent({
    childId: args.childId,
    profile,
    words: args.words.length > 0 ? args.words : carePlan.reinforcementWords,
    childInterests: childInterestTags(args.childId, childContextSummary),
    childContextSummary,
    capturedContent: args.capturedContent,
  });
  return [
    ...(args.type === "spelling_test"
      ? []
      : buildContentSupportNodes({ carePlan }).filter(
          (node) => node.carePlan?.role === "baseline-evaluator",
        )),
    {
      id: `n-karaoke-${args.homeworkId.replace(/[^a-zA-Z0-9-_]/g, "-")}`,
      type: "karaoke",
      words: tokenizeStory(story.text),
      difficulty: 1,
      rationale: `Build background knowledge for ${profile.topic} before practicing ${profile.practiceDomain}.`,
      gameFile: null,
      storyFile: null,
      storyText: story.text,
      storyTitle: story.title,
      storyImagePrompt: story.imagePrompt,
      carePlan: storyIntervention
        ? {
            interventionId: storyIntervention.id,
            role: storyIntervention.type,
            targetSkills: storyIntervention.targetSkills,
            targetConcepts: storyIntervention.targetConcepts,
            targetWords: storyIntervention.targetWords,
            algorithmTargets: storyIntervention.algorithmTargets,
            measures: storyIntervention.measures,
            reason: storyIntervention.reason,
          }
        : undefined,
    },
    ...(args.type === "spelling_test"
      ? []
      : buildContentSupportNodes({ carePlan }).filter(
          (node) => node.carePlan?.role !== "baseline-evaluator",
        )),
    ...spellingNodes,
  ];
}
