import { validateActivityEngineConfig, validateLetterRushConfig, type ActivityEngineConfig, type LetterRushConfig } from "./activityEngineConfig";
import type { LearningCycleSpellingItem } from "./learningCycleRepository";
import { validateSpellingVisualExplainerPlanConfig, validateVisualLearnerArtifactConfig } from "../shared/visualLearnerArtifactConfig";

/** One way to set up a built-in spelling game for a stop's questions, shared by the Teaching board and
 * the next board. Word Radar keeps its mode; Letter Rush and concept checks are bound to the stop's own
 * question IDs. Returns no setup for a game that needs none; throws the reason a setup cannot run. */
export function spellingNativeConfig(input: {
  type: string; nodeId: string; items: LearningCycleSpellingItem[];
  wordRadarConfig?: Record<string, unknown>; activityConfig?: unknown;
}): Record<string, unknown> | undefined {
  const { type, nodeId, items } = input;
  if (type === "word-radar") return input.wordRadarConfig ? { activityId: "word-radar", wordRadarConfig: structuredClone(input.wordRadarConfig) } : undefined;
  if (type !== "letter-rush" && type !== "concept-check") return undefined;
  const parsed = type === "letter-rush" ? validateLetterRushConfig(input.activityConfig) : validateActivityEngineConfig(input.activityConfig);
  if (!parsed.ok || !parsed.normalized || parsed.normalized.domain !== "spelling" || parsed.normalized.activityId !== type
    || parsed.normalized.evidencePolicy.writesMasteryEvidence) throw new Error(`spelling_engine_config_invalid:${nodeId}`);
  const config = structuredClone(parsed.normalized);
  const match = (word: string) => items.find(item => item.word.normalize("NFC").toLowerCase() === word.normalize("NFC").toLowerCase());
  if (type === "letter-rush") {
    const letter = config as LetterRushConfig;
    if (letter.words.length !== items.length || new Set(letter.words.map(word => word.text.toLowerCase())).size !== items.length) throw new Error(`spelling_engine_coverage_invalid:${nodeId}`);
    letter.words = letter.words.map(word => { const item = match(word.text); if (!item) throw new Error(`spelling_engine_unknown_word:${nodeId}`); return { ...word, id: item.id }; });
  } else {
    const concept = config as ActivityEngineConfig;
    const ids = new Map(concept.targets.map(target => [target.id, match(target.label)]));
    if (concept.targets.length !== items.length || [...ids.values()].some(item => !item)
      || concept.rounds.length !== items.length || new Set(concept.rounds.map(round => round.targetId)).size !== items.length) throw new Error(`spelling_engine_coverage_invalid:${nodeId}`);
    concept.targets = concept.targets.map(target => ({ ...target, id: ids.get(target.id)!.id }));
    concept.rounds = concept.rounds.map(round => {
      const item = ids.get(round.targetId); if (!item) throw new Error(`spelling_engine_unknown_word:${nodeId}`);
      const accepted = (round.options ?? []).filter(option => option.correct).map(option => option.label);
      if (!accepted.length) throw new Error(`spelling_engine_answer_missing:${nodeId}`);
      item.response = { mode: "tap_selection", acceptedForms: accepted, caseSensitive: false };
      return { ...round, targetId: item.id };
    });
  }
  return config as unknown as Record<string, unknown>;
}

/** A Visual Explainer's frozen page for a stop: it teaches exactly the stop's words, on any spelling board. */
export function spellingExplainerConfig(input: { homeworkId: string; nodeId: string; items: LearningCycleSpellingItem[]; activityConfig: unknown; summary: string; capturedAt: string }): Record<string, unknown> {
  const { nodeId, items } = input;
  try {
    const visual = validateSpellingVisualExplainerPlanConfig(input.activityConfig);
    const normalize = (value: string) => value.normalize("NFC").trim().toLocaleLowerCase("en-US");
    const itemByWord = new Map(items.map((item) => [normalize(item.word), item]));
    const configuredWords = visual.words.map((word) => normalize(word.text));
    if (configuredWords.length !== items.length
      || new Set(configuredWords).size !== items.length
      || configuredWords.some((word) => !itemByWord.has(word))) {
      throw new Error("coverage");
    }
    const checkItem = itemByWord.get(normalize(visual.check.targetWord));
    if (!checkItem) throw new Error("check_target");
    const frozenWords = visual.words.map((word) => ({
      ...word,
      id: itemByWord.get(normalize(word.text))!.id,
    }));
    return validateVisualLearnerArtifactConfig({
      artifactId: `${input.homeworkId}:${nodeId}:visual-explainer`,
      type: "visual-explainer",
      concept: visual.topic,
      learningGoal: visual.learningGoal,
      misconception: visual.misconception,
      sourceEvidence: {
        source: `assignment:${input.homeworkId}`,
        capturedAt: input.capturedAt,
        summary: input.summary,
      },
      algorithmTargets: ["error-pattern-remediation", "retrieval-practice"],
      reuseDecision: {
        status: "candidate",
        reason: "Planner-selected assisted spelling instruction; checkpoint outcomes are still pending.",
      },
      parentApproval: { status: "pending" },
      mode: { default: "pause-for-question" },
      preview: { allowPlaythrough: true },
      narration: {
        enabled: false,
        provider: "companion",
        voiceId: "runtime-companion",
        modelId: "runtime-companion",
        audioPath: "none",
        scriptPath: "none",
        timings: [{ id: "strategy", startProgress: 0, endProgress: 100, text: visual.strategy.title }],
      },
      questions: [{
        id: visual.check.id,
        prompt: visual.check.prompt,
        options: visual.check.options,
        correctOptionId: visual.check.correctOptionId,
        targetConcept: checkItem.id,
        misconceptionTag: visual.misconception,
        pauseAtProgress: 85,
        scaffoldLevel: 2,
      }],
      companionContext: { role: "hint_only", maxSentences: 3, canRevealAnswer: true },
      evidence: {
        targetResults: items.map((item) => item.id),
        completion: `${nodeId}:assisted-visual-instruction-complete`,
      },
      chrome: {
        childShowsEvidence: false,
        parentShowsEvidence: true,
        childShowsCarePlan: false,
        parentShowsCarePlan: true,
      },
      spellingModel: { strategy: visual.strategy, words: frozenWords },
    }) as unknown as Record<string, unknown>;
  } catch {
    throw new Error(`spelling_visual_explainer_config_invalid:${nodeId}`);
  }
}

/** Letter Rush's setup for a stop: its mode and words, with the scaffolds that mode needs. */
export function letterRushConfig(input: { mode: string; title: string; words: string[] }): Record<string, unknown> {
  return { schemaVersion: 1, activityId: "letter-rush", mode: input.mode, topic: input.title, domain: "spelling", learningGoal: "Practice the assigned spelling words.", gradeBand: "early_elementary",
    scaffolds: { showWord: input.mode === "read-and-race", letterBank: true, allowRetryBeforeScore: true, companionHints: false }, words: input.words.map(text => ({ text })),
    evidencePolicy: { writesPracticeEvidence: true, writesMasteryEvidence: false, requiresPerTargetResult: true, allowedEvidence: ["practice"] } };
}
