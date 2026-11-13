import type { LearningProfile } from "../context/schemas/learningProfile";
import type { HomeworkCycle } from "../context/schemas/homeworkCycle";
import type { AdventureChoiceSet } from "../shared/adventureBoardJson";
import type { AdaptiveQuestArtifactStage } from "./adaptiveQuestArtifact";
import type { QuestSpecV1 } from "./questBossSpec";

export type QuestBossDesignDomain = "spelling" | "reading" | "math" | "science" | "generic";

export interface DesignBriefV1 {
  schemaVersion: 1;
  briefId: string;
  childId: string;
  stage: AdaptiveQuestArtifactStage;
  nodeId: string;
  choiceSetId: string;
  createdAt: string;
  assignment: {
    homeworkId: string;
    title: string;
    subject: string;
    domain: QuestBossDesignDomain;
    rawText: string;
    words: string[];
    questions: Array<{ id: string; question: string; correctAnswer?: string | null }>;
    topic: string;
    primarySkill: string;
    testDate: string | null;
  };
  domainTemplate: {
    domain: QuestBossDesignDomain;
    proofLoop: string;
    requiredEvidence: string[];
    forbiddenMoves: string[];
  };
  childPreferenceTheory: {
    preferredTraits: string[];
    avoidedTraits: string[];
    preferredActivities: string[];
    challengeTolerance: string;
    hypothesis: string;
  };
  inspirationReferences: string[];
  successRubric: string[];
}

export interface ConceptCandidateV1 {
  schemaVersion: 1;
  conceptId: string;
  optionId: string;
  title: string;
  hook: string;
  artDirection: string;
  interactionFantasy: string;
  rewardLoop: string;
  domainProofPlan: string;
  childFitRationale: string;
  supportCriteria: string[];
  reviseCriteria: string[];
  falsifyCriteria: string[];
  traits: string[];
  estimatedMinutes: number;
  thumbnailUrl?: string;
  companionMicroQuestion?: {
    prompt: string;
    answerType: "free_text" | "short_choice";
    options?: string[];
  };
}

export type ConceptCandidateValidationResult =
  | { ok: true; concept: ConceptCandidateV1; failures: [] }
  | { ok: false; failures: string[] };

export interface ConceptCandidateQualityScore {
  score: number;
  passed: boolean;
  findings: string[];
}

function asDomain(cycle: HomeworkCycle): QuestBossDesignDomain {
  const practiceDomain = String(cycle.capturedContent?.contentProfile?.practiceDomain ?? "").toLowerCase();
  const subject = String(cycle.subject ?? "").toLowerCase();
  if (subject === "spelling_test" || practiceDomain === "spelling") return "spelling";
  if (subject === "reading" || practiceDomain === "reading") return "reading";
  if (subject === "math" || practiceDomain === "math") return "math";
  if (subject === "science" || practiceDomain === "science") return "science";
  return "generic";
}

function domainTemplate(domain: QuestBossDesignDomain): DesignBriefV1["domainTemplate"] {
  if (domain === "spelling") {
    return {
      domain,
      proofLoop:
        "Use hidden spelling recall: prompt without showing the target answer, collect typed production, reveal feedback only after the attempt.",
      requiredEvidence: ["typed_production", "target_level_attempt", "hidden_before_attempt", "completion_summary"],
      forbiddenMoves: ["visible target answers before attempt", "semantic clues that imply spelling", "speed as sole proof"],
    };
  }
  if (domain === "reading") {
    return {
      domain,
      proofLoop:
        "Use passage evidence: show the source text or excerpt, ask assignment-aligned questions, collect answer-from-text evidence.",
      requiredEvidence: ["passage_reference", "answer_from_text", "question_level_attempt", "completion_summary"],
      forbiddenMoves: ["answering without text evidence", "pure memory trivia", "generic story unrelated to the passage"],
    };
  }
  if (domain === "math") {
    return {
      domain,
      proofLoop:
        "Use assignment-style problem solving: present the same problem type, collect answer/work evidence, then explain or repair.",
      requiredEvidence: ["problem_attempt", "answer_or_work", "strategy_signal", "completion_summary"],
      forbiddenMoves: ["decorative counting without matching the assignment", "answer reveal before attempt"],
    };
  }
  if (domain === "science") {
    return {
      domain,
      proofLoop:
        "Use concept evidence: ask the child to classify, predict, explain, or connect evidence to the assignment concept.",
      requiredEvidence: ["concept_attempt", "evidence_connection", "explanation_or_classification", "completion_summary"],
      forbiddenMoves: ["generic science facts disconnected from captured homework"],
    };
  }
  return {
    domain,
    proofLoop: "Use the captured assignment as the proof source and collect assessable attempt evidence.",
    requiredEvidence: ["assignment_aligned_attempt", "completion_summary"],
    forbiddenMoves: ["generic reward that does not test the assignment"],
  };
}

function cleanStrings(values: unknown[]): string[] {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function traitScores(profile: LearningProfile): Array<{ dimension: string; score: number }> {
  return Object.values(profile.activityTraitModel ?? {})
    .map((entry) => ({ dimension: entry.dimension, score: entry.positiveWeight - entry.negativeWeight }))
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
}

function preferredTraits(profile: LearningProfile): string[] {
  return traitScores(profile)
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((entry) => entry.dimension);
}

function avoidedTraits(profile: LearningProfile): string[] {
  return traitScores(profile)
    .filter((entry) => entry.score < 0)
    .sort((a, b) => a.score - b.score)
    .slice(0, 8)
    .map((entry) => entry.dimension);
}

function preferredActivities(profile: LearningProfile): string[] {
  return Object.values(profile.activityModel ?? {})
    .filter((entry) => entry.plays > 0 && entry.engagementScore >= 0.65 && entry.frustrationScore < 0.5)
    .sort((a, b) => (b.engagementScore - b.frustrationScore) - (a.engagementScore - a.frustrationScore))
    .slice(0, 6)
    .map((entry) => `${entry.activityId}:engagement=${entry.engagementScore}:plays=${entry.plays}`);
}

function normalizeQuestions(questions: unknown[] | undefined): DesignBriefV1["assignment"]["questions"] {
  return (questions ?? []).map((item, index) => {
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      return {
        id: String(record.id ?? index + 1),
        question: String(record.question ?? record.prompt ?? ""),
        ...(record.correctAnswer != null ? { correctAnswer: String(record.correctAnswer) } : {}),
      };
    }
    return { id: String(index + 1), question: String(item ?? "") };
  }).filter((item) => item.question.trim());
}

function stableId(...parts: string[]): string {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "design-brief";
}

export function buildDesignBriefV1(input: {
  childId: string;
  kind: AdaptiveQuestArtifactStage;
  nodeId: string;
  choiceSet: AdventureChoiceSet;
  homeworkCycle: HomeworkCycle;
  profile: LearningProfile;
  targetWords: string[];
  now?: Date;
}): DesignBriefV1 {
  const captured = input.homeworkCycle.capturedContent;
  const domain = asDomain(input.homeworkCycle);
  const profileConcepts = captured?.contentProfile?.concepts ?? [];
  const selectedTargets = Array.isArray(captured?.assignmentInterpretation?.selectedTargets)
    ? captured.assignmentInterpretation.selectedTargets
    : [];
  const selectedTargetWords = selectedTargets.flatMap((target) => {
    if (!target || typeof target !== "object") return [];
    const words = (target as { words?: unknown }).words;
    return Array.isArray(words) ? words : [];
  });
  const targetWords = cleanStrings([
    ...input.targetWords,
    ...(captured?.words ?? []),
    ...selectedTargetWords,
  ]);
  const preferred = preferredTraits(input.profile);
  const avoided = avoidedTraits(input.profile);
  return {
    schemaVersion: 1,
    briefId: stableId("design-brief", input.childId, input.kind, input.nodeId, input.choiceSet.id),
    childId: input.childId,
    stage: input.kind,
    nodeId: input.nodeId,
    choiceSetId: input.choiceSet.id,
    createdAt: (input.now ?? new Date()).toISOString(),
    assignment: {
      homeworkId: input.homeworkCycle.homeworkId,
      title: captured?.title ?? input.homeworkCycle.homeworkId,
      subject: input.homeworkCycle.subject,
      domain,
      rawText: captured?.rawText ?? targetWords.join("\n"),
      words: targetWords,
      questions: normalizeQuestions(captured?.questions),
      topic: captured?.contentProfile?.topic ?? profileConcepts[0] ?? captured?.title ?? input.homeworkCycle.homeworkId,
      primarySkill: captured?.contentProfile?.primarySkill ?? domain,
      testDate: input.homeworkCycle.testDate ?? input.profile.pendingHomework?.testDate ?? null,
    },
    domainTemplate: domainTemplate(domain),
    childPreferenceTheory: {
      preferredTraits: preferred,
      avoidedTraits: avoided,
      preferredActivities: preferredActivities(input.profile),
      challengeTolerance: avoided.some((trait) => trait === "speed" || trait === "competition")
        ? "pressure_sensitive"
        : "unknown",
      hypothesis:
        input.profile.activeSessionPlan?.planTheory?.hypothesis ??
        "Use child-selected concept cards to discover which wrapper sustains effort without weakening the domain proof.",
    },
    inspirationReferences: [
      "Mystery/Quest/Boss cards use one quick visual promise before launch.",
      "Sunny Lab reference: one central object, visible progress/charge, short payoff, tactile action.",
      "Behavior beats self-report; companion answers are weak evidence.",
    ],
    successRubric: [
      "concept maps to assignment truth",
      "concept maps to child preference theory",
      "domain proof loop is visible in the design",
      "no answer leakage before attempt",
      "outcomes can support, revise, or falsify the theory",
    ],
  };
}

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) collectStrings(item, out);
  }
  return out;
}

function containsRuntimeCode(text: string): boolean {
  return /<script\b|<\/script>|window\.|document\.|sendNodeComplete|fireAttemptEvent|function\s*\(|=>|_contract\.js/i
    .test(text);
}

function containsTargetAnswer(text: string, answers: string[]): string | null {
  for (const answer of answers) {
    const normalized = answer.trim();
    if (!normalized) continue;
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(String.raw`\b${escaped}\b`, "i").test(text)) return normalized;
  }
  return null;
}

export function validateConceptCandidateV1(
  value: unknown,
  brief: DesignBriefV1,
): ConceptCandidateValidationResult {
  const failures: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, failures: ["ConceptCandidate must be an object."] };
  }
  const record = value as Record<string, unknown>;
  for (const field of [
    "conceptId",
    "optionId",
    "title",
    "hook",
    "artDirection",
    "interactionFantasy",
    "rewardLoop",
    "domainProofPlan",
    "childFitRationale",
  ]) {
    if (typeof record[field] !== "string" || !String(record[field]).trim()) {
      failures.push(`ConceptCandidate ${field} is required.`);
    }
  }
  for (const field of ["supportCriteria", "reviseCriteria", "falsifyCriteria", "traits"]) {
    if (!Array.isArray(record[field]) || (record[field] as unknown[]).length === 0) {
      failures.push(`ConceptCandidate ${field} must include at least one item.`);
    }
  }
  if (typeof record.estimatedMinutes !== "number" || record.estimatedMinutes < 1 || record.estimatedMinutes > 15) {
    failures.push("ConceptCandidate estimatedMinutes must be between 1 and 15.");
  }
  const allText = collectStrings(value).join("\n");
  if (containsRuntimeCode(allText)) {
    failures.push("ConceptCandidate must not include runtime code.");
  }
  if (brief.domainTemplate.domain === "spelling") {
    const leaked = containsTargetAnswer(allText, brief.assignment.words);
    if (leaked) failures.push(`ConceptCandidate leaks target answer "${leaked}".`);
  }
  if (!allText.toLowerCase().includes(brief.domainTemplate.domain)) {
    failures.push("ConceptCandidate must name the domain proof context.");
  }
  if (failures.length > 0) return { ok: false, failures };
  return { ok: true, concept: value as ConceptCandidateV1, failures: [] };
}

function includesAny(text: string, values: string[]): boolean {
  const lower = text.toLowerCase();
  return values.some((value) => lower.includes(value.toLowerCase()));
}

function domainProofLooksAssessable(concept: ConceptCandidateV1, brief: DesignBriefV1): boolean {
  const proof = [
    concept.domainProofPlan,
    concept.interactionFantasy,
    concept.rewardLoop,
  ].join("\n").toLowerCase();
  if (brief.domainTemplate.domain === "spelling") {
    return includesAny(proof, [
      "hidden spelling recall",
      "hidden recall",
      "hidden spelling target",
      "target hidden",
      "targets concealed",
      "concealed",
      "from memory",
      "audio word prompt",
    ]) &&
      includesAny(proof, ["typed production", "type", "spell", "attempt"]) &&
      includesAny(proof, ["feedback", "reveal", "completion", "after attempt", "after submission", "submission"]);
  }
  if (brief.domainTemplate.domain === "reading") {
    return includesAny(proof, ["passage", "text", "excerpt"]) &&
      includesAny(proof, ["answer", "question", "evidence"]) &&
      includesAny(proof, ["attempt", "submit", "completion"]);
  }
  return includesAny(proof, ["assignment", "attempt", "evidence"]);
}

export function scoreConceptCandidateQuality(
  concept: ConceptCandidateV1,
  brief: DesignBriefV1,
): ConceptCandidateQualityScore {
  const findings: string[] = [];
  let score = 0;
  const validation = validateConceptCandidateV1(concept, brief);
  if (validation.ok) {
    score += 20;
  } else {
    findings.push(...validation.failures.map((failure) => `schema:${failure}`));
  }

  if (domainProofLooksAssessable(concept, brief)) {
    score += 25;
  } else {
    findings.push("domain_proof_missing_required_evidence");
  }

  const preferredTraits = brief.childPreferenceTheory.preferredTraits.map((trait) => trait.toLowerCase());
  const conceptText = collectStrings(concept).join("\n").toLowerCase();
  const matchesProfileTrait = preferredTraits.length === 0 ||
    preferredTraits.some((trait) => concept.traits.map((item) => item.toLowerCase()).includes(trait) ||
      conceptText.includes(trait));
  if (matchesProfileTrait) {
    score += 20;
  } else {
    findings.push("child_fit_missing_profile_trait");
  }

  if (includesAny(conceptText, ["progress", "meter", "charge", "launch", "orb", "tactile", "visual", "mystery", "puzzle"])) {
    score += 15;
  } else {
    findings.push("interaction_fantasy_too_generic");
  }

  if (concept.supportCriteria.length > 0 && concept.reviseCriteria.length > 0 && concept.falsifyCriteria.length > 0) {
    score += 15;
  } else {
    findings.push("theory_lacks_support_revise_falsify");
  }

  if (concept.companionMicroQuestion?.prompt) {
    score += 5;
  } else {
    findings.push("micro_question_missing");
  }

  return {
    score,
    passed: score >= 75 && !findings.includes("domain_proof_missing_required_evidence"),
    findings,
  };
}

export function conceptToQuestSpecV1(input: {
  concept: ConceptCandidateV1;
  kind: AdaptiveQuestArtifactStage;
  domain: QuestBossDesignDomain;
  difficulty: 1 | 2 | 3;
}): QuestSpecV1 {
  const domainPrompt =
    input.domain === "reading"
      ? "Use the passage and question evidence. Read the prompt, answer from the text, then submit your proof."
      : input.domain === "spelling"
        ? "Listen or use the non-answer prompt, type from memory without seeing the answer, then submit your proof."
        : "Use the assignment evidence, make an attempt, then submit your proof.";
  return {
    schemaVersion: 1,
    stage: input.kind,
    title: input.concept.title,
    theme: input.concept.traits.slice(0, 3).join(" ") || input.domain,
    challengeFrame: `${input.concept.interactionFantasy} The proof loop is ${input.concept.domainProofPlan}`,
    visualWorld: input.concept.artDirection,
    interactionFlavor: input.concept.interactionFantasy,
    tensionCurve: input.concept.rewardLoop,
    rewardMoment: input.concept.rewardLoop,
    failureRecoveryStyle: input.concept.reviseCriteria.join(" "),
    animationCues: input.concept.traits.slice(0, 6),
    styleReference: "Use Sunny concept-card energy with readable panels, a clear progress object, and tactile controls.",
    wrapperTraits: input.concept.traits,
    difficulty: input.difficulty,
    estimatedMinutes: input.concept.estimatedMinutes,
    childFacingIntro: input.concept.hook,
    successCopy: input.concept.supportCriteria[0] ?? "Quest complete.",
    retryCopy: "Try the next proof step.",
    scenes: [
      {
        id: "proof-step",
        title: input.domain === "reading" ? "Text Evidence" : "Memory Proof",
        prompt: domainPrompt,
      },
    ],
  };
}
