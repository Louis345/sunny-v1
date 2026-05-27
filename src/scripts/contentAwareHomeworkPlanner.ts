import fs from "fs";
import path from "path";
import { readChildMeta } from "../profiles/childrenConfig";
import {
  daysUntilHomeworkTest,
  homeworkOnlySelectionPlan,
  selectHomeworkSessionWords,
} from "../shared/homeworkWordSelection";
import { readWordBank } from "../utils/wordBankIO";
import {
  buildHomeworkCarePlan,
  type HomeworkCarePlan,
  type HomeworkCarePlanIntervention,
} from "../engine/homeworkCarePlan";
import {
  buildAdaptiveHomeworkPlan,
  type AdaptiveHomeworkPlan,
  type AdaptivePlanNode,
} from "../engine/adaptiveHomeworkPlan";
import type {
  ActivityEvidenceKind,
  ActivityEngineConfig,
  LetterRushConfig,
  LetterRushMode,
  LetterRushWord,
} from "../engine/activityEngineConfig";
import { buildConceptCheckConfigFromCapturedHomework } from "../engine/activityEngineConfig";
import type {
  AdaptiveArtifactValidationReport,
  ChoiceEventSource,
  MasteryUnlockState,
  WordRadarNodeConfig,
} from "../shared/adventureTypes";
import { readLearningProfile } from "../utils/learningProfileIO";

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

export type HomeworkTargetPurpose =
  | "spell_from_memory"
  | "recognize"
  | "read_fluently"
  | "pronounce"
  | "define"
  | "unknown";

export type HomeworkWordGroup = {
  id: string;
  wordGroupId?: string;
  label: string;
  purpose: HomeworkTargetPurpose;
  words: string[];
  homeworkWordIds?: string[];
  confidence: number;
  evidence: string[];
  scheduleAfter?: "spelling_measured";
};

export type HomeworkWordOccurrence = {
  homeworkWordId: string;
  text: string;
  normalizedText: string;
  wordGroupId?: string;
  wordBankEntryId?: string;
  purpose: HomeworkTargetPurpose;
  positionIndex: number;
};

export type AssignmentInterpretationStatus =
  | "ready"
  | "needs_clarification"
  | "human_confirmed"
  | "low_confidence_probe";

export type HomeworkClarificationQuestion = {
  id: string;
  prompt: string;
  options: HomeworkTargetPurpose[];
  targetGroupIds: string[];
  reason: string;
  confidenceBefore: number;
};

export type HomeworkClarificationAnswer = {
  questionId: string;
  answer: HomeworkTargetPurpose;
  answeredBy: string;
  answeredAt: string;
};

export type HomeworkReviewRecommendation = {
  id: string;
  severity: "info" | "confirm";
  reason: string;
  targetGroupIds: string[];
};

export type HomeworkInterpretationMemoryMatch = {
  patternKey: string;
  confirmedAt: string;
  useCount: number;
  confidenceBoost: number;
  evidence: string[];
};

export type HomeworkInterpretationAssertion = {
  id: string;
  claim: string;
  confidence: number;
  evidence: string[];
};

export type AssignmentInterpretation = {
  schemaVersion: 1;
  status: AssignmentInterpretationStatus;
  wordGroups: HomeworkWordGroup[];
  assertions: HomeworkInterpretationAssertion[];
  selectedTargets: HomeworkWordGroup[];
  heldTargets: HomeworkWordGroup[];
  clarificationQuestions: HomeworkClarificationQuestion[];
  reviewRecommendations?: HomeworkReviewRecommendation[];
  humanAnswers: HomeworkClarificationAnswer[];
  memoryMatches: HomeworkInterpretationMemoryMatch[];
};

export type CapturedHomeworkContent = {
  title: string;
  type: HomeworkType;
  rawText: string;
  words: string[];
  homeworkWords?: HomeworkWordOccurrence[];
  questions: unknown[];
  wordGroups?: HomeworkWordGroup[];
  assignmentInterpretation?: AssignmentInterpretation;
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
    | "concept-check"
    | "letter-rush"
    | "monster-stampede"
    | "mystery"
    | "speed-catcher"
    | "wordle"
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
  wordRadarConfig?: WordRadarNodeConfig;
  choiceMode?: "choice_lab" | "surprise_drop";
  choiceSource?: ChoiceEventSource;
  masteryUnlockState?: MasteryUnlockState;
  locked?: boolean;
  difficulty: 1 | 2 | 3;
  rationale: string;
  gameFile?: string | null;
  storyFile?: string | null;
  activityId?: string;
  activityMode?: string;
  activityConfigPath?: string;
  activityConfig?: unknown;
  adaptivePlan?: AdaptiveHomeworkPlan;
  adaptiveArtifact?: {
    artifactId: string;
    contentId: string;
    homeworkId: string;
    theoryId: string;
    generationStage: "quest" | "boss";
    targetGroupIds: string[];
    homeworkWordIds: string[];
    baselineEvidenceIds: string[];
    generatedPath?: string;
    validationStatus?: "passed" | "failed" | "warning";
    validationReport?: AdaptiveArtifactValidationReport;
  };
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
  wordGroups?: HomeworkWordGroup[];
  interpretationMemoryMatches?: HomeworkInterpretationMemoryMatch[];
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

function normalizeWordKey(word: string): string {
  return String(word).trim().toLowerCase();
}

function safeWordId(word: string): string {
  return normalizeWordKey(word)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "word";
}

function safeGroupId(label: string, fallback: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

function buildHomeworkWordOccurrences(args: {
  title: string;
  words: string[];
  wordGroups: HomeworkWordGroup[];
}): { homeworkWords: HomeworkWordOccurrence[]; wordGroups: HomeworkWordGroup[] } {
  const assignmentScope = safeGroupId(args.title, "homework");
  const groupedWordKeys = new Set<string>();
  const homeworkWords: HomeworkWordOccurrence[] = [];
  const pushOccurrence = (word: string, positionIndex: number, group?: HomeworkWordGroup): void => {
    const groupId = group?.wordGroupId ?? group?.id;
    homeworkWords.push({
      homeworkWordId: `${assignmentScope}:${groupId ?? "ungrouped"}:${safeWordId(word)}:${positionIndex}`,
      text: word,
      normalizedText: normalizeWordKey(word),
      ...(groupId ? { wordGroupId: groupId } : {}),
      purpose: group?.purpose ?? "unknown",
      positionIndex,
    });
  };

  for (const group of args.wordGroups) {
    for (const word of group.words) {
      groupedWordKeys.add(normalizeWordKey(word));
      pushOccurrence(word, homeworkWords.length, group);
    }
  }
  for (const word of args.words) {
    if (groupedWordKeys.has(normalizeWordKey(word))) continue;
    pushOccurrence(word, homeworkWords.length);
  }
  const byGroup = new Map<string, string[]>();
  for (const item of homeworkWords) {
    if (!item.wordGroupId) continue;
    const list = byGroup.get(item.wordGroupId) ?? [];
    list.push(item.homeworkWordId);
    byGroup.set(item.wordGroupId, list);
  }
  const wordGroups = args.wordGroups.map((group) => {
    const wordGroupId = group.wordGroupId ?? group.id;
    return {
      ...group,
      wordGroupId,
      homeworkWordIds: byGroup.get(wordGroupId) ?? [],
    };
  });
  return { homeworkWords, wordGroups };
}

function memoryBoost(matches: HomeworkInterpretationMemoryMatch[]): number {
  return Math.max(0, ...matches.map((match) => Number(match.confidenceBoost) || 0));
}

function applyInterpretationMemory(
  groups: HomeworkWordGroup[],
  matches: HomeworkInterpretationMemoryMatch[],
): HomeworkWordGroup[] {
  const boost = memoryBoost(matches);
  if (boost <= 0) return groups;
  const evidence = matches.flatMap((match) => match.evidence).slice(0, 3);
  return groups.map((group) => ({
    ...group,
    confidence: Math.min(0.99, group.confidence + boost),
    evidence: cleanList([...group.evidence, ...evidence]),
  }));
}

function textBlob(parts: Array<unknown>): string {
  return parts
    .flatMap((part) => {
      if (Array.isArray(part)) return part;
      return [part];
    })
    .filter((part) => part != null)
    .map((part) => String(part))
    .join(" ")
    .toLowerCase();
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

type PurposeInferenceRule = {
  id: string;
  purpose: HomeworkTargetPurpose;
  confidence: number;
  scheduleAfter?: "spelling_measured";
  matches: (input: {
    group: HomeworkWordGroup;
    extraction: NormalizableExtraction;
    groupText: string;
    contextText: string;
  }) => boolean;
  evidence: string;
};

const PURPOSE_INFERENCE_RULES: PurposeInferenceRule[] = [
  {
    id: "define-vocabulary-heading",
    purpose: "define",
    confidence: 0.88,
    matches: ({ groupText }) =>
      hasAny(groupText, ["definition", "define", "meaning", "vocabulary"]),
    evidence:
      "Source wording describes vocabulary meaning/definition work, so Sunny routes the group to definition practice.",
  },
  {
    id: "pronunciation-heading",
    purpose: "pronounce",
    confidence: 0.9,
    scheduleAfter: "spelling_measured",
    matches: ({ groupText }) =>
      hasAny(groupText, ["pronounce", "pronunciation", "say aloud", "oral reading"]),
    evidence:
      "Source wording describes oral pronunciation work, so Sunny routes the group to pronunciation evidence.",
  },
  {
    id: "high-frequency-fluency-heading",
    purpose: "read_fluently",
    confidence: 0.86,
    scheduleAfter: "spelling_measured",
    matches: ({ groupText }) =>
      hasAny(groupText, [
        "high frequency",
        "high-frequency",
        "sight word",
        "sight-word",
        "heart word",
        "read fluently",
        "fluency target",
        "fluency words",
      ]),
    evidence:
      "Source heading names high-frequency/fluency words, so Sunny holds the group for recognition or fluent reading instead of silently mixing it into spelling production.",
  },
  {
    id: "recognition-heading",
    purpose: "recognize",
    confidence: 0.84,
    scheduleAfter: "spelling_measured",
    matches: ({ groupText }) =>
      hasAny(groupText, ["recognition target", "recognition only", "recognize", "recognizing"]),
    evidence:
      "Source wording describes recognition, so Sunny routes the group to recognition before production.",
  },
  {
    id: "spelling-pattern-heading",
    purpose: "spell_from_memory",
    confidence: 0.88,
    matches: ({ group, groupText, contextText, extraction }) =>
      practiceDomainFor(String(extraction.type)) === "spelling" &&
      !groupTextHasFluencySignal(groupText) &&
      (hasAny(groupText, [
          "spelling word",
          "spelling production",
          "spell from memory",
          "word spelling pattern",
          "spelling pattern",
          "phonics",
          "vowel sound",
          "schwa",
          "suffix",
          "prefix",
          "ending",
          "endings",
        ]) ||
        (group.purpose === "unknown" &&
          hasAny(contextText, [
            "spelling word",
            "spelling production",
            "word spelling pattern",
            "spelling pattern",
            "phonics",
            "vowel sound",
            "schwa",
            "suffix",
            "prefix",
          ]))),
    evidence:
      "Source wording describes spelling patterns or spelling production, so Sunny routes the group to spelling recall evidence.",
  },
];

function inferPurposeForGroup(
  extraction: NormalizableExtraction,
  group: HomeworkWordGroup,
): HomeworkWordGroup {
  const groupText = textBlob([group.id, group.label, group.evidence]);
  const contextText = textBlob([
    extraction.contentProfile?.primarySkill,
    extraction.contentProfile?.assignmentFormat,
    extraction.contentProfile?.concepts,
    extraction.contentProfile?.sourceEvidence,
  ]);
  const match = PURPOSE_INFERENCE_RULES.find((rule) =>
    rule.matches({ group, extraction, groupText, contextText }),
  );
  if (!match) return group;
  if (group.purpose === match.purpose && group.confidence >= match.confidence) {
    return group;
  }
  const shouldOverride =
    group.purpose === "unknown" ||
    group.confidence < match.confidence ||
    (group.purpose === "spell_from_memory" && match.purpose !== "spell_from_memory") ||
    (group.purpose !== "spell_from_memory" && match.purpose === "spell_from_memory");
  if (!shouldOverride) return group;
  return {
    ...group,
    purpose: match.purpose,
    confidence: Math.max(group.confidence, match.confidence),
    ...(match.scheduleAfter ? { scheduleAfter: group.scheduleAfter ?? match.scheduleAfter } : {}),
    evidence: cleanList([...group.evidence, match.evidence]),
  };
}

function isLikelyFluencyGroup(group: HomeworkWordGroup): boolean {
  return ["recognize", "read_fluently", "pronounce"].includes(group.purpose);
}

function groupTextHasFluencySignal(groupText: string): boolean {
  return hasAny(groupText, [
    "high frequency",
    "high-frequency",
    "sight word",
    "sight-word",
    "heart word",
    "read fluently",
    "fluency target",
    "fluency words",
    "recognition target",
    "recognition only",
    "recognize",
    "recognizing",
    "pronounce",
    "pronunciation",
  ]);
}

function hasExplicitRecognitionOnlyEvidence(extraction: NormalizableExtraction): boolean {
  const text = textBlob([
    extraction.contentProfile?.primarySkill,
    extraction.contentProfile?.assignmentFormat,
    extraction.contentProfile?.sourceEvidence,
  ]);
  return hasAny(text, [
    "recognition target",
    "recognition only",
    "recognizing",
    "read fluently",
    "reading high-frequency",
    "reading high frequency",
  ]) && !hasAny(text, ["spell from memory", "spelling production"]);
}

function hasSpellingProductionEvidence(extraction: NormalizableExtraction): boolean {
  const text = textBlob([
    extraction.contentProfile?.primarySkill,
    extraction.contentProfile?.assignmentFormat,
    extraction.contentProfile?.concepts,
    extraction.contentProfile?.sourceEvidence,
  ]);
  return hasAny(text, [
    "spelling word",
    "spelling production",
    "spell from memory",
    "word spelling pattern",
    "spelling pattern",
    "phonics",
    "vowel sound",
    "schwa",
    "suffix",
    "prefix",
  ]);
}

function repairSpellingTestGroups(
  extraction: NormalizableExtraction,
  groups: HomeworkWordGroup[],
): HomeworkWordGroup[] {
  if (practiceDomainFor(String(extraction.type)) !== "spelling") return groups;
  if (String(extraction.type) !== "spelling_test") return groups;
  const normalizedGroups = groups.map((group) => inferPurposeForGroup(extraction, group));
  if (normalizedGroups.some((group) => group.purpose === "spell_from_memory")) {
    return normalizedGroups;
  }
  if (hasExplicitRecognitionOnlyEvidence(extraction)) return groups;
  if (!hasSpellingProductionEvidence(extraction)) return groups;

  let repaired = 0;
  const next = normalizedGroups.map((group) => {
    if (isLikelyFluencyGroup(group)) {
      return {
        ...group,
        ...(group.scheduleAfter ? {} : { scheduleAfter: "spelling_measured" as const }),
      };
    }
    repaired += 1;
    return {
      ...group,
      purpose: "spell_from_memory" as const,
      confidence: Math.min(group.confidence, 0.82),
      evidence: cleanList([
        ...group.evidence,
        "Sunny repaired assignment purpose: spelling_test plus pattern-focused evidence requires a spelling-recall diagnostic before fluency-only practice.",
      ]),
    };
  });
  return repaired > 0 ? next : groups;
}

function reviewRecommendationsFor(
  groups: HomeworkWordGroup[],
  spellingDomain: boolean,
): HomeworkReviewRecommendation[] {
  if (!spellingDomain || groups.length <= 1) return [];
  const purposes = new Set(groups.map((group) => group.purpose));
  if (purposes.size <= 1) return [];
  return [{
    id: "confirm-mixed-target-purposes",
    severity: "confirm",
    reason:
      "The worksheet has multiple target groups with different purposes; parent review should confirm Sunny's routing before the lesson plan is approved.",
    targetGroupIds: groups.map((group) => group.id),
  }];
}

function clarificationQuestionsFor(
  groups: HomeworkWordGroup[],
  spellingDomain: boolean,
): HomeworkClarificationQuestion[] {
  if (!spellingDomain) return [];
  return groups
    .filter((group) => group.purpose === "unknown" || group.confidence < 0.6 || group.evidence.length === 0)
    .map((group) => ({
      id: `clarify-${group.id}-purpose`,
      prompt: `What should Sunny do with "${group.label}"?`,
      options: ["spell_from_memory", "read_fluently", "pronounce", "recognize", "define", "unknown"],
      targetGroupIds: [group.id],
      reason:
        group.purpose === "unknown"
          ? "Sunny could not prove whether this group should be spelled from memory or used for fluency/recognition."
          : "Sunny has a low-confidence assignment-purpose inference.",
      confidenceBefore: group.confidence,
    }));
}

function statusForInterpretation(args: {
  selectedTargets: HomeworkWordGroup[];
  clarificationQuestions: HomeworkClarificationQuestion[];
  humanAnswers?: HomeworkClarificationAnswer[];
}): AssignmentInterpretationStatus {
  if ((args.humanAnswers ?? []).length > 0) return "human_confirmed";
  if (args.clarificationQuestions.length > 0) {
    return args.selectedTargets.length > 0 ? "low_confidence_probe" : "needs_clarification";
  }
  return "ready";
}

function buildAssignmentInterpretation(args: {
  wordGroups: HomeworkWordGroup[];
  assertions: HomeworkInterpretationAssertion[];
  spellingDomain: boolean;
  humanAnswers?: HomeworkClarificationAnswer[];
  memoryMatches?: HomeworkInterpretationMemoryMatch[];
}): AssignmentInterpretation {
  const selectedTargets = args.wordGroups.filter((group) => group.purpose === "spell_from_memory");
  const heldTargets = args.wordGroups.filter((group) => group.purpose !== "spell_from_memory");
  const clarificationQuestions = clarificationQuestionsFor(args.wordGroups, args.spellingDomain);
  const reviewRecommendations = reviewRecommendationsFor(args.wordGroups, args.spellingDomain);
  return {
    schemaVersion: 1,
    status: statusForInterpretation({
      selectedTargets,
      clarificationQuestions,
      humanAnswers: args.humanAnswers,
    }),
    wordGroups: args.wordGroups,
    assertions: args.assertions,
    selectedTargets,
    heldTargets,
    clarificationQuestions,
    reviewRecommendations,
    humanAnswers: args.humanAnswers ?? [],
    memoryMatches: args.memoryMatches ?? [],
  };
}

export function interpretHomeworkAssignment(
  extraction: NormalizableExtraction,
): AssignmentInterpretation {
  // LEGACY_TEST_ONLY_ASSIGNMENT_INTERPRETER:
  // Kept for historical tests and old worksheet fallback paths. Real homework ingestion should pass
  // AI-planner word groups into buildCapturedHomeworkContent instead of relying on this interpreter.
  const words = cleanList(extraction.words);
  const spellingDomain = practiceDomainFor(String(extraction.type)) === "spelling";
  const memoryMatches = (extraction.interpretationMemoryMatches ?? []).filter((match) =>
    String(match?.patternKey ?? "").trim(),
  );
  const explicitGroups = repairSpellingTestGroups(extraction, applyInterpretationMemory((extraction.wordGroups ?? [])
    .filter((group) => group && Array.isArray(group.words) && group.words.length > 0)
    .map((group): HomeworkWordGroup => ({
      id: group.id || safeGroupId(group.label, "word-group"),
      wordGroupId: group.wordGroupId || group.id || safeGroupId(group.label, "word-group"),
      label: group.label || group.id || "Word Group",
      purpose: group.purpose || "unknown",
      words: cleanList(group.words).filter((word) =>
        words.some((sourceWord) => normalizeWordKey(sourceWord) === normalizeWordKey(word)),
      ),
      homeworkWordIds: cleanList(group.homeworkWordIds),
      confidence: Number.isFinite(Number(group.confidence)) ? Number(group.confidence) : 0.5,
      evidence: cleanList(group.evidence),
      ...(group.scheduleAfter ? { scheduleAfter: group.scheduleAfter } : {}),
    }))
    .filter((group) => group.words.length > 0), memoryMatches));
  if (explicitGroups.length > 0) {
    return buildAssignmentInterpretation({
      wordGroups: explicitGroups,
      assertions: explicitGroups.map((group) => ({
        id: `${group.id}-source-interpretation`,
        claim: `${group.label} should be treated as ${group.purpose}.`,
        confidence: group.confidence,
        evidence: group.evidence.length ? group.evidence : [`Source group ${group.label}`],
      })),
      spellingDomain,
      memoryMatches,
    });
  }
  const sourceEvidence = cleanList(extraction.contentProfile?.sourceEvidence);
  const wordGroups: HomeworkWordGroup[] = [];
  const assertions: HomeworkInterpretationAssertion[] = [];

  if (wordGroups.length === 0 && words.length > 0) {
    const groupId = safeGroupId(extraction.title, "homework-words");
    wordGroups.push({
      id: groupId,
      wordGroupId: groupId,
      label: extraction.title || "Homework Words",
      purpose: "unknown",
      words,
      confidence: 0.5,
      evidence: sourceEvidence.length > 0
        ? sourceEvidence
        : ["No explicit source grouping was captured."],
    });
    assertions.push({
      id: "low-confidence-word-group",
      claim: "The word group needs human clarification or a light probe before aggressive drill.",
      confidence: 0.5,
      evidence: sourceEvidence.length > 0
        ? sourceEvidence
        : ["No explicit source grouping was captured."],
    });
  }

  return buildAssignmentInterpretation({
    wordGroups,
    assertions,
    spellingDomain,
    memoryMatches,
  });
}

export function applyHomeworkClarificationAnswer(
  interpretation: AssignmentInterpretation,
  answer: HomeworkClarificationAnswer,
): AssignmentInterpretation {
  const question = interpretation.clarificationQuestions.find((item) => item.id === answer.questionId);
  const targetGroupIds = new Set(
    question?.targetGroupIds.length ? question.targetGroupIds : interpretation.wordGroups.map((group) => group.id),
  );
  const wordGroups = interpretation.wordGroups.map((group) => {
    if (!targetGroupIds.has(group.id)) return group;
    return {
      ...group,
      purpose: answer.answer,
      confidence: 0.99,
      evidence: cleanList([
        ...group.evidence,
        `Human clarification by ${answer.answeredBy}: ${answer.answer}`,
      ]),
      ...(answer.answer === "spell_from_memory" ? {} : { scheduleAfter: "spelling_measured" as const }),
    };
  });
  const humanAnswers = [...interpretation.humanAnswers, answer];
  return buildAssignmentInterpretation({
    wordGroups,
    assertions: [
      ...interpretation.assertions,
      {
        id: `${answer.questionId}-human-confirmed`,
        claim: `Human clarified ${question?.targetGroupIds.join(", ") || "homework words"} as ${answer.answer}.`,
        confidence: 0.99,
        evidence: [`answeredBy:${answer.answeredBy}`, `answeredAt:${answer.answeredAt}`],
      },
    ],
    spellingDomain: true,
    humanAnswers,
    memoryMatches: interpretation.memoryMatches,
  });
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
  wordGroups?: HomeworkWordGroup[];
  interpretationMemoryMatches?: HomeworkInterpretationMemoryMatch[];
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
  const assignmentInterpretation = args.wordGroups?.length
    ? buildAssignmentInterpretation({
      wordGroups: args.wordGroups,
      assertions: args.wordGroups.map((group) => ({
        id: `${group.id}-planner-source`,
        claim: `${group.label} was preserved from the assignment planner source truth.`,
        confidence: group.confidence,
        evidence: group.evidence.length ? group.evidence : [`Planner source group: ${group.label}`],
      })),
      spellingDomain: practiceDomainFor(String(type)) === "spelling",
      memoryMatches: [],
    })
    : interpretHomeworkAssignment({
      title: args.title,
      type,
      words,
      questions,
      interpretationMemoryMatches: args.interpretationMemoryMatches,
      contentProfile,
    });
  const scoped = buildHomeworkWordOccurrences({
    title: args.title,
    words,
    wordGroups: assignmentInterpretation.wordGroups,
  });
  const scopedInterpretation: AssignmentInterpretation = {
    ...assignmentInterpretation,
    wordGroups: scoped.wordGroups,
    selectedTargets: scoped.wordGroups.filter((group) => group.purpose === "spell_from_memory"),
    heldTargets: scoped.wordGroups.filter((group) => group.purpose !== "spell_from_memory"),
  };
  return {
    title: String(args.title ?? "Untitled Homework").trim() || "Untitled Homework",
    type,
    rawText: String(args.rawText ?? "").trim(),
    words,
    homeworkWords: scoped.homeworkWords,
    questions,
    wordGroups: scoped.wordGroups,
    assignmentInterpretation: scopedInterpretation,
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

type SpellingReinforcementNodeType = "monster-stampede" | "letter-rush";

type SpellingCohortMemory = {
  nodeType: SpellingReinforcementNodeType;
  rationale: string;
};

type RatingScore = {
  count: number;
  scoreTotal: number;
};

function scoreNodeRating(raw: Record<string, unknown>): number {
  const accuracy = typeof raw.accuracy === "number" && Number.isFinite(raw.accuracy)
    ? raw.accuracy
    : 0.5;
  const rating = raw.rating === "like" ? 0.15 : raw.rating === "dislike" ? -0.2 : 0;
  const abandoned = raw.abandonedEarly === true ? -0.35 : 0;
  return Math.max(0, Math.min(1, accuracy + rating + abandoned));
}

function readSpellingCohortMemory(childId: string): SpellingCohortMemory {
  const dir = path.join(
    process.cwd(),
    "src",
    "context",
    childId.trim().toLowerCase(),
    "ratings",
  );
  const scores: Record<SpellingReinforcementNodeType, RatingScore> = {
    "monster-stampede": { count: 0, scoreTotal: 0 },
    "letter-rush": { count: 0, scoreTotal: 0 },
  };

  if (fs.existsSync(dir)) {
    for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".ndjson")).sort()) {
      const text = fs.readFileSync(path.join(dir, file), "utf8");
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          const row = JSON.parse(line) as Record<string, unknown>;
          const nodeType = row.nodeType as SpellingReinforcementNodeType;
          if (nodeType !== "monster-stampede" && nodeType !== "letter-rush") continue;
          scores[nodeType].count += 1;
          scores[nodeType].scoreTotal += scoreNodeRating(row);
        } catch (error) {
          console.warn(
            ` 🎮 [homework-planner] [rating-memory-skip] file=${file} reason=malformed-json error=${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
  }

  const monster = scores["monster-stampede"];
  const letterRush = scores["letter-rush"];
  const monsterAvg = monster.count > 0 ? monster.scoreTotal / monster.count : 0;
  const letterRushAvg = letterRush.count > 0 ? letterRush.scoreTotal / letterRush.count : 0;
  if (letterRush.count > 0 && letterRushAvg >= 0.92 && letterRushAvg > monsterAvg + 0.08) {
    return {
      nodeType: "letter-rush",
      rationale:
        `cohort memory prefers Letter Rush from ${letterRush.count} prior rating(s), avg=${letterRushAvg.toFixed(2)}.`,
    };
  }
  if (monster.count > 0 && monsterAvg >= letterRushAvg) {
    return {
      nodeType: "monster-stampede",
      rationale:
        `cohort memory prefers Monster Stampede from ${monster.count} prior rating(s), avg=${monsterAvg.toFixed(2)}.`,
    };
  }
  return {
    nodeType: "monster-stampede",
    rationale:
      `cohort memory has no stronger Letter Rush evidence yet, so Sunny cold-starts with Monster Stampede after measurement.`,
  };
}

function conceptCheckItems(concepts: string[]): NonNullable<PlannedHomeworkNode["wordRadarItems"]> {
  return concepts.map((concept) => ({
    display: concept,
    acceptedResponses: [concept.toLowerCase()],
    label: "Concept Check",
    subject: "reading",
  }));
}

function conceptCheckCapturedFallback(args: {
  profile: ContentProfile;
  words: string[];
}): CapturedHomeworkContent {
  const profile = args.profile;
  return {
    title: profile.topic || "homework",
    type: "reading",
    rawText: cleanList([
      profile.topic,
      ...profile.concepts,
      ...profile.sourceEvidence,
      ...args.words,
    ]).join(". "),
    words: cleanList([...profile.concepts, ...args.words]),
    questions: [],
    sourceDocuments: [],
    contentProfile: profile,
  };
}

function conceptCheckConfigPath(childId: string, homeworkId: string, filename: string): string {
  return `/api/activity-config/${childId}/${homeworkId.replace(/[^a-zA-Z0-9-_]/g, "-")}/${filename}`;
}

function buildConceptCheckPlannedNode(args: {
  childId: string;
  homeworkId: string;
  intervention: HomeworkCarePlanIntervention;
  idSuffix: string;
  captured: CapturedHomeworkContent;
  filename: string;
  difficulty: 1 | 2 | 3;
}): PlannedHomeworkNode {
  const nodeId = `n-${args.intervention.id}-${args.idSuffix}`;
  const config: ActivityEngineConfig = buildConceptCheckConfigFromCapturedHomework({
    childId: args.childId,
    homeworkId: args.homeworkId,
    nodeId,
    captured: args.captured,
  });
  return {
    id: nodeId,
    type: "concept-check",
    words: args.intervention.targetWords,
    difficulty: args.difficulty,
    rationale: args.intervention.reason,
    gameFile: null,
    storyFile: null,
    activityId: "concept-check",
    activityMode: config.engine.mode,
    activityConfigPath: conceptCheckConfigPath(args.childId, args.homeworkId, args.filename),
    activityConfig: config,
    carePlan: {
      interventionId: args.intervention.id,
      role: args.intervention.type,
      targetSkills: args.intervention.targetSkills,
      targetConcepts: args.intervention.targetConcepts,
      targetWords: args.intervention.targetWords,
      algorithmTargets: args.intervention.algorithmTargets,
      measures: args.intervention.measures,
      reason: args.intervention.reason,
    },
  };
}

function buildContentSupportNodes(args: {
  carePlan: HomeworkCarePlan;
  childId: string;
  homeworkId: string;
  profile: ContentProfile;
  capturedContent?: CapturedHomeworkContent;
}): PlannedHomeworkNode[] {
  const idSuffix = args.carePlan.homeworkId.replace(/[^a-zA-Z0-9-_]/g, "-");
  const captured = args.capturedContent ?? conceptCheckCapturedFallback({
    profile: args.profile,
    words: args.carePlan.reinforcementWords,
  });
  return args.carePlan.interventions
    .filter((intervention) => intervention.id !== "story")
    .filter((intervention) =>
      ["baseline-evaluator", "pronunciation", "concept-builder", "exit-evaluator"].includes(
        intervention.type,
      ),
    )
    .map((intervention): PlannedHomeworkNode => {
      if (intervention.type === "baseline-evaluator" || intervention.type === "exit-evaluator") {
        return buildConceptCheckPlannedNode({
          childId: args.childId,
          homeworkId: args.homeworkId,
          intervention,
          idSuffix,
          captured,
          filename: intervention.type === "baseline-evaluator"
            ? "concept-check-baseline.json"
            : "concept-check-exit.json",
          difficulty: intervention.type === "exit-evaluator" ? 2 : 1,
        });
      }
      const words = intervention.targetWords;
      const base = {
        id: `n-${intervention.id}-${idSuffix}`,
        type: intervention.nodeType,
        words,
        difficulty: 1,
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
  void childId;
  return [];
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

function safeHomeworkId(homeworkId: string): string {
  return homeworkId.replace(/[^a-zA-Z0-9-_]/g, "-");
}

function spellingPatternForWord(word: string): {
  targetPatterns: string[];
  imposterChunks: string[];
  traps: string[];
} {
  const lower = word.toLowerCase();
  const suffixes = ["er", "or", "ar", "ir", "ur", "est", "ed", "ing", "y"];
  const suffix = suffixes.find((candidate) => lower.endsWith(candidate));
  if (!suffix) {
    return {
      targetPatterns: ["whole-word"],
      imposterChunks: [],
      traps: [],
    };
  }
  const vowelFamily = ["er", "or", "ar", "ir", "ur"].filter((chunk) => chunk !== suffix);
  const comparativeFamily = ["er", "est"].filter((chunk) => chunk !== suffix);
  const imposterChunks = suffix === "er" || suffix === "or" || suffix === "ar" || suffix === "ir" || suffix === "ur"
    ? vowelFamily
    : suffix === "est"
      ? comparativeFamily
      : [];
  return {
    targetPatterns: [`${suffix}-ending`],
    imposterChunks,
    traps: imposterChunks,
  };
}

function letterRushWords(words: string[], mode: LetterRushMode): LetterRushWord[] {
  return words.map((word) => {
    const patterns = spellingPatternForWord(word);
    const base: LetterRushWord = {
      id: safeWordId(word),
      text: word,
      definition: "Spell the word you hear.",
      sentence: "Listen, then choose carefully.",
      targetPatterns: patterns.targetPatterns,
    };
    if (mode === "trap-the-imposter" && patterns.imposterChunks.length > 0) {
      return {
        ...base,
        traps: patterns.traps,
        imposterChunks: patterns.imposterChunks,
        trapGoal: Math.min(4, Math.max(2, patterns.imposterChunks.length)),
      };
    }
    return base;
  });
}

function letterRushEvidencePolicy(mode: LetterRushMode): LetterRushConfig["evidencePolicy"] {
  const masteryEligible =
    mode === "type-and-spell" || mode === "hear-and-spell" || mode === "mastery-run";
  return {
    writesPracticeEvidence: true,
    writesMasteryEvidence: masteryEligible,
    requiresPerTargetResult: masteryEligible,
    allowedEvidence: (masteryEligible ? ["practice", "mastery"] : ["practice"]) as ActivityEvidenceKind[],
  };
}

function letterRushScaffolds(mode: LetterRushMode): LetterRushConfig["scaffolds"] {
  if (mode === "trap-the-imposter") {
    return {
      showWord: true,
      letterBank: false,
      allowRetryBeforeScore: true,
      companionHints: false,
    };
  }
  if (mode === "read-and-race") {
    return {
      showWord: true,
      letterBank: true,
      allowRetryBeforeScore: true,
      companionHints: false,
    };
  }
  return {
    showWord: false,
    letterBank: false,
    allowRetryBeforeScore: false,
    companionHints: false,
  };
}

function buildLetterRushConfig(args: {
  mode: LetterRushMode;
  topic: string;
  words: string[];
}): LetterRushConfig {
  const config: LetterRushConfig = {
    schemaVersion: 1,
    activityId: "letter-rush",
    mode: args.mode,
    topic: args.topic,
    domain: "spelling",
    learningGoal: `Build accurate spelling for ${args.topic}.`,
    gradeBand: "early_elementary",
    scaffolds: letterRushScaffolds(args.mode),
    words: letterRushWords(args.words, args.mode),
    sfx: {
      enabled: true,
      arcadeCombos: true,
      comboThreshold: 3,
      comboMilestoneEvery: 5,
      comboMilestones: [
        { minStreak: 5, label: "COMBO BREAKER", effect: "combo-breaker" },
        { minStreak: 10, label: "HEATING UP", effect: "heating-up" },
        { minStreak: 15, label: "ON FIRE", effect: "on-fire" },
      ],
    },
    evidencePolicy: letterRushEvidencePolicy(args.mode),
  };
  if (args.mode === "trap-the-imposter") {
    config.trap = {
      goal: 4,
      timerSeconds: 45,
      imposterSpawnRate: 0.72,
      maxVisibleChunks: 5,
      spawnInterval_ms: 950,
      fallDuration_ms: 5200,
    };
    config.bonusRound = {
      enabled: true,
      unlockAccuracy: 0.85,
      unlockStreak: 5,
      timerSeconds: 20,
      goal: 3,
      speedMultiplier: 1.2,
      stake: 10,
      multiplier: 2,
      riskSource: "child_profile_currency",
    };
  }
  return config;
}

function letterRushConfigPath(childId: string, homeworkId: string, filename: string): string {
  return `/api/activity-config/${childId}/${safeHomeworkId(homeworkId)}/${filename}`;
}

function adaptivePronunciationWordLimit(childId: string, fallback: number): number {
  const defaultLimit = Math.max(1, fallback);
  try {
    const state = readLearningProfile(childId)?.adaptiveLoadState?.spelling;
    if (!state) return defaultLimit;
    if (state.challengeRecommendation === "targeted_support") return defaultLimit;
    const strongEvidence = state.lastLoadEvidence?.strongEvidence === true;
    const lowFrustration = (state.lastLoadEvidence?.frustrationScore ?? 1) < 0.5;
    if (!strongEvidence || !lowFrustration) return defaultLimit;
    const learnedLimit = Math.max(
      state.currentCohortSize ?? 0,
      state.maxRecentSuccessfulCohort ?? 0,
    );
    const limit = Math.max(defaultLimit, Math.min(10, learnedLimit));
    if (limit > defaultLimit) {
      console.log(
        ` 🎮 [homework-planner] [adaptive-load] pronunciation-limit child=${childId} words=${limit}`,
      );
    }
    return limit;
  } catch {
    return defaultLimit;
  }
}

export function buildSpellingActivityNodes(args: {
  childId: string;
  homeworkId: string;
  topic: string;
  selectedWords: string[];
  difficulty: 1 | 2 | 3;
  adaptivePlan: AdaptiveHomeworkPlan;
}): PlannedHomeworkNode[] {
  const idSuffix = safeHomeworkId(args.homeworkId);
  return args.adaptivePlan.nodes.map((planNode: AdaptivePlanNode, index): PlannedHomeworkNode => {
    const mode = (planNode.mode ?? "hear-and-spell") as LetterRushMode;
    const config = buildLetterRushConfig({
      mode,
      topic: args.topic,
      words: args.selectedWords,
    });
    return {
      id: `n-${planNode.id}-${idSuffix}`,
      type: "letter-rush",
      words: [...args.selectedWords],
      difficulty: index === 0 ? 1 : args.difficulty,
      rationale: planNode.rationale,
      gameFile: null,
      storyFile: null,
      activityId: planNode.activityId,
      activityMode: mode,
      activityConfigPath: letterRushConfigPath(args.childId, args.homeworkId, planNode.configFilename),
      activityConfig: config,
      ...(index === 0 ? { adaptivePlan: args.adaptivePlan } : {}),
    };
  });
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
  topic?: string;
  contentProfile?: ContentProfile | null;
  capturedContent?: CapturedHomeworkContent;
}): PlannedHomeworkNode[] {
  const childMeta = readChildMeta(args.childId);
  const letterRushGame = childMeta?.games?.["letter-rush"] as { maxWords?: number } | undefined;
  const maxWords =
    letterRushGame?.maxWords ??
    childMeta?.games?.["word-radar"]?.maxWords ??
    childMeta?.games?.["spell-check"]?.maxWords ??
    5;
  const pronunciationWordLimit = adaptivePronunciationWordLimit(args.childId, maxWords);
  const today = new Date().toISOString().slice(0, 10);
  const bank = readWordBank(args.childId);
  const fallbackInterpretation = (): AssignmentInterpretation =>
    interpretHomeworkAssignment({
      title: args.topic ?? "spelling",
      type: "spelling_test",
      words: args.words,
      questions: [],
      contentProfile: args.contentProfile ?? undefined,
    });
  const repairCapturedInterpretation = (): AssignmentInterpretation | null => {
    const captured = args.capturedContent;
    if (!captured) return null;
    const existing = captured.assignmentInterpretation;
    if ((existing?.humanAnswers ?? []).length > 0) return existing ?? null;
    const repaired = interpretHomeworkAssignment({
      title: captured.title,
      type: captured.type,
      words: captured.words,
      questions: captured.questions,
      wordGroups: captured.wordGroups,
      contentProfile: captured.contentProfile,
    });
    const existingSelected = existing?.selectedTargets?.length ?? 0;
    const purposeKey = (value: AssignmentInterpretation | undefined | null): string =>
      (value?.wordGroups ?? [])
        .map((group) => `${group.id}:${group.purpose}`)
        .join("|");
    if (existing && purposeKey(existing) !== purposeKey(repaired)) return repaired;
    if (existing && existingSelected > 0) return existing;
    return repaired.selectedTargets.length > existingSelected ? repaired : (existing ?? repaired);
  };
  const interpretation = repairCapturedInterpretation() ?? fallbackInterpretation();
  const spellingWordList =
    interpretation.selectedTargets.flatMap((group) => group.words).length > 0
      ? interpretation.selectedTargets.flatMap((group) => group.words)
      : !args.capturedContent && !args.contentProfile
        ? args.words
        : [];
  const productionWords = cleanList(spellingWordList);
  const fluencyWords = cleanList(
    interpretation.heldTargets
      .filter((group) =>
        ["recognize", "read_fluently", "pronounce"].includes(group.purpose),
      )
      .flatMap((group) => group.words),
  );
  if (productionWords.length === 0) {
    if (fluencyWords.length > 0 && interpretation.status === "ready") {
      return [
        {
          id: `n-pronunciation-${safeHomeworkId(args.homeworkId)}`,
          type: "pronunciation",
          words: fluencyWords.slice(0, pronunciationWordLimit),
          difficulty: 1,
          rationale:
            "Confident assignment interpretation found recognition/fluency targets, so Sunny routes to pronunciation instead of spelling production.",
          gameFile: null,
          storyFile: null,
        },
      ];
    }
    console.log(
      ` 🎮 [homework-planner] [clarification-needed] homeworkId=${args.homeworkId} status=${interpretation.status}`,
    );
    return [];
  }
  const sm2Plan = homeworkOnlySelectionPlan(args.childId);
  const selected = selectHomeworkSessionWords({
    wordList: productionWords,
    sm2Plan,
    missedWords: args.missedWords ?? [],
    testDate: args.testDate ?? null,
    maxWords,
    testImminent: daysUntilHomeworkTest(args.testDate ?? null, today) <= 5,
    wordBankWords: bank.words,
    todayIso: today,
  });
  const topic = args.topic?.trim() || "spelling";
  const sessionWordLimit = Math.max(1, maxWords);
  const shouldUseCohort = productionWords.length > sessionWordLimit;
  const cohortWords = productionWords.slice(
    0,
    shouldUseCohort
      ? Math.min(productionWords.length, sessionWordLimit * 2)
      : productionWords.length,
  );
  const adaptiveWords = shouldUseCohort ? cohortWords : selected;
  const adaptivePlan = buildAdaptiveHomeworkPlan({
    childId: args.childId,
    homeworkId: args.homeworkId,
    type: "spelling_test",
    topic,
    words: adaptiveWords,
    childSignals: [
      `maxWords:${maxWords}`,
      `testImminent:${daysUntilHomeworkTest(args.testDate ?? null, today) <= 5}`,
      ...interpretation.assertions.map((assertion) => `assignment:${assertion.id}`),
    ],
    targetGroups: interpretation.wordGroups,
  });
  if (shouldUseCohort) {
    const idSuffix = safeHomeworkId(args.homeworkId);
    const wordRadarWords = cohortWords.slice(0, sessionWordLimit);
    const spellCheckWords = cohortWords.slice(sessionWordLimit, sessionWordLimit * 2);
    const memory = readSpellingCohortMemory(args.childId);
    const arcadeNode: PlannedHomeworkNode =
      memory.nodeType === "letter-rush"
        ? {
            id: `n-letter-rush-${idSuffix}`,
            type: "letter-rush",
            words: cohortWords,
            difficulty: 2,
            rationale:
              `Reinforce the measured spelling cohort with movement practice; ${memory.rationale}`,
            gameFile: null,
            storyFile: null,
            activityId: `letter-rush-cohort-${idSuffix}`,
            activityMode: "hear-and-spell",
            activityConfigPath: letterRushConfigPath(
              args.childId,
              args.homeworkId,
              "letter-rush-cohort.json",
            ),
            activityConfig: buildLetterRushConfig({
              mode: "hear-and-spell",
              topic,
              words: cohortWords,
            }),
          }
        : {
            id: `n-monster-stampede-${idSuffix}`,
            type: "monster-stampede",
            words: cohortWords,
            difficulty: 2,
            rationale:
              `Reinforce the measured spelling cohort with a faster whole-list game; ${memory.rationale}`,
            gameFile: null,
            storyFile: null,
          };
    const nodes: PlannedHomeworkNode[] = [
      {
        id: `n-word-radar-${idSuffix}`,
        type: "word-radar",
        words: wordRadarWords,
        wordRadarItems: wordRadarItemsFromWordList(wordRadarWords),
        difficulty: 1,
        rationale:
          "Start with a low-friction scan of the first spelling cohort before independent recall.",
        gameFile: null,
        storyFile: null,
        adaptivePlan,
      },
      {
        id: `n-spell-check-${idSuffix}`,
        type: "spell-check",
        words: spellCheckWords.length > 0 ? spellCheckWords : selected,
        difficulty: 1,
        rationale:
          "Measure independent recall on the next spelling cohort after Word Radar warms up the pattern.",
        gameFile: null,
        storyFile: null,
      },
      arcadeNode,
    ];
    if (fluencyWords.length > 0 && interpretation.status === "ready") {
      nodes.push({
        id: `n-pronunciation-${idSuffix}`,
        type: "pronunciation",
        words: fluencyWords.slice(0, pronunciationWordLimit),
        difficulty: 1,
        rationale:
          "Route held high-frequency recognition/fluency words to pronunciation after spelling-production work.",
        gameFile: null,
        storyFile: null,
      });
    }
    return nodes;
  }
  if (fluencyWords.length > 0 && interpretation.status === "ready") {
    const idSuffix = safeHomeworkId(args.homeworkId);
    return [
      {
        id: `n-spell-check-${idSuffix}`,
        type: "spell-check",
        words: selected,
        difficulty: 1,
        rationale:
          "Start with independent recall only for assignment-scoped spelling-production words.",
        gameFile: null,
        storyFile: null,
        adaptivePlan,
      },
      {
        id: `n-pronunciation-${idSuffix}`,
        type: "pronunciation",
        words: fluencyWords.slice(0, pronunciationWordLimit),
        difficulty: 1,
        rationale:
          "Route held high-frequency recognition/fluency words to pronunciation instead of spelling drill.",
        gameFile: null,
        storyFile: null,
      },
    ];
  }
  return [
    {
      id: `n-spell-check-${safeHomeworkId(args.homeworkId)}`,
      type: "spell-check",
      words: selected,
      difficulty: 1,
      rationale:
        "Start with independent recall so Sunny knows which spelling-production words are known before adding practice.",
      gameFile: null,
      storyFile: null,
      adaptivePlan,
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
      ? buildSpellingNodes({ ...args, topic: args.contentProfile?.topic })
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
      : buildContentSupportNodes({
          carePlan,
          childId: args.childId,
          homeworkId: args.homeworkId,
          profile,
          capturedContent: args.capturedContent,
        }).filter(
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
      : buildContentSupportNodes({
          carePlan,
          childId: args.childId,
          homeworkId: args.homeworkId,
          profile,
          capturedContent: args.capturedContent,
        }).filter(
          (node) => node.carePlan?.role !== "baseline-evaluator",
        )),
    ...spellingNodes,
  ];
}
