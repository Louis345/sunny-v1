import type { LetterRushMode } from "./activityEngineConfig";
import type { HomeworkTargetPurpose } from "../scripts/contentAwareHomeworkPlanner";

export type AdaptiveHomeworkDomain =
  | "spelling"
  | "reading"
  | "science"
  | "social_studies"
  | "math"
  | "generic";

export type AdaptivePlanNodePurpose =
  | "evaluate"
  | "teach"
  | "practice"
  | "guided-practice"
  | "independent-retrieval"
  | "fluency"
  | "reward";

export type AdaptivePlanAssertion = {
  id: string;
  claim: string;
  confidence: number;
  evidence: string[];
  falsifiedBy: string[];
};

export type AdaptivePlanNode = {
  id: string;
  activityId: "letter-rush" | "concept-check" | string;
  nodeType: string;
  mode?: LetterRushMode | string;
  purpose: AdaptivePlanNodePurpose;
  configFilename: string;
  evidenceNeeded: string[];
  rationale: string;
};

export type AdaptivePlanTargetGroup = {
  id: string;
  label: string;
  purpose: HomeworkTargetPurpose;
  words: string[];
  confidence: number;
  evidence: string[];
  scheduleAfter?: "spelling_measured";
};

export type AdaptiveHomeworkPlan = {
  schemaVersion: 1;
  childId: string;
  homeworkId: string;
  domain: AdaptiveHomeworkDomain;
  topic: string;
  nodeBudget: number;
  targetGroups?: AdaptivePlanTargetGroup[];
  selectedTargets?: AdaptivePlanTargetGroup[];
  heldTargets?: AdaptivePlanTargetGroup[];
  assertions: AdaptivePlanAssertion[];
  nodes: AdaptivePlanNode[];
  dopamineBreak: {
    status: "eligible-after-evidence" | "hold" | "not-applicable";
    reason: string;
    candidateToolIds: string[];
  };
  strongBaselinePolicy?: {
    minAccuracy: number;
    minimumAttempts: number;
    nextMove: "reward-or-quest-prep";
    reason: string;
  };
  questGate: {
    status: "hold" | "eligible-after-evidence";
    contentGenerationConfidenceThreshold: number;
    requires: string[];
    reason: string;
  };
};

function domainForHomeworkType(type: string): AdaptiveHomeworkDomain {
  if (type === "spelling_test" || type === "spelling") return "spelling";
  if (type === "reading") return "reading";
  if (type === "math" || type === "coins" || type === "clocks") return "math";
  return "generic";
}

function spellingPlanNodes(): AdaptivePlanNode[] {
  return [
    {
      id: "letter-rush-baseline",
      activityId: "letter-rush",
      nodeType: "letter-rush",
      mode: "type-and-spell",
      purpose: "evaluate",
      configFilename: "letter-rush-baseline.json",
      evidenceNeeded: ["per_word_accuracy", "response_time", "scaffoldLevel_0"],
      rationale:
        "Start with hidden spelling recall so Sunny knows which words are known before practice.",
    },
    {
      id: "letter-rush-pattern-practice",
      activityId: "letter-rush",
      nodeType: "letter-rush",
      mode: "trap-the-imposter",
      purpose: "practice",
      configFilename: "letter-rush-pattern-practice.json",
      evidenceNeeded: ["pattern_discrimination", "imposter_clicks", "streak"],
      rationale:
        "Practice spelling pitfalls by trapping wrong chunks while avoiding the correct chunk.",
    },
    {
      id: "letter-rush-mastery-check",
      activityId: "letter-rush",
      nodeType: "letter-rush",
      mode: "mastery-run",
      purpose: "evaluate",
      configFilename: "letter-rush-mastery-check.json",
      evidenceNeeded: ["per_word_accuracy", "response_time", "final_attempt_value"],
      rationale:
        "Recheck independent recall after practice to decide what can unlock next.",
    },
  ];
}

type AdaptiveActivityPlanInput = {
  childId: string;
  homeworkId: string;
  type: string;
  topic: string;
  words: string[];
  childSignals?: string[];
  contentProfile?: {
    practiceDomain?: string;
    contentDomain?: string;
    primarySkill?: string;
  } | null;
  targetGroups?: AdaptivePlanTargetGroup[];
};

function readingPlanNodes(): AdaptivePlanNode[] {
  return [
    {
      id: "concept-check-baseline",
      activityId: "concept-check",
      nodeType: "concept-check",
      mode: "diagnostic",
      purpose: "evaluate",
      configFilename: "concept-check-baseline.json",
      evidenceNeeded: ["per_target_accuracy", "misconception_label", "scaffoldLevel_0"],
      rationale:
        "Start with a comprehension/concept baseline before the story teaches or reveals answers.",
    },
    {
      id: "karaoke-story",
      activityId: "karaoke",
      nodeType: "karaoke",
      mode: "guided-reading",
      purpose: "guided-practice",
      configFilename: "karaoke-story.json",
      evidenceNeeded: ["reading_completion", "hesitations", "flagged_words"],
      rationale:
        "Use guided reading to build context and expose pronunciation or fluency friction.",
    },
    {
      id: "pronunciation",
      activityId: "pronunciation",
      nodeType: "pronunciation",
      mode: "targeted-pronunciation",
      purpose: "guided-practice",
      configFilename: "pronunciation-targets.json",
      evidenceNeeded: ["pronunciation_accuracy", "hesitation"],
      rationale:
        "Target academic words that need to be speakable before the child can explain them.",
    },
    {
      id: "word-builder",
      activityId: "word-builder",
      nodeType: "word-builder",
      mode: "academic-vocabulary",
      purpose: "practice",
      configFilename: "word-builder-targets.json",
      evidenceNeeded: ["construction_accuracy", "attempted_value"],
      rationale:
        "Practice academic vocabulary and concept language after initial reading context.",
    },
    {
      id: "concept-check-exit",
      activityId: "concept-check",
      nodeType: "concept-check",
      mode: "diagnostic",
      purpose: "evaluate",
      configFilename: "concept-check-exit.json",
      evidenceNeeded: ["per_target_accuracy", "misconception_label", "improvement_from_baseline"],
      rationale:
        "Recheck comprehension after support so quest generation has valid evidence.",
    },
  ];
}

function domainForInput(args: AdaptiveActivityPlanInput): AdaptiveHomeworkDomain {
  const practiceDomain = args.contentProfile?.practiceDomain?.toLowerCase() ?? "";
  const primarySkill = args.contentProfile?.primarySkill?.toLowerCase() ?? "";
  if (practiceDomain === "reading" || primarySkill.includes("comprehension")) return "reading";
  return domainForHomeworkType(args.type);
}

export function buildAdaptiveActivityPlan(args: AdaptiveActivityPlanInput): AdaptiveHomeworkPlan {
  const domain = domainForInput(args);
  const topic = args.topic.trim() || args.homeworkId;
  const wordsEvidence = args.words.length > 0
    ? `captured_words:${args.words.slice(0, 12).join(",")}`
    : "captured_words:none";
  const childSignals = args.childSignals ?? [];

  if (domain === "spelling") {
    const targetGroups = args.targetGroups ?? [];
    const selectedTargets = targetGroups.filter((group) => group.purpose === "spell_from_memory");
    const heldTargets = targetGroups.filter((group) => group.purpose !== "spell_from_memory");
    return {
      schemaVersion: 1,
      childId: args.childId,
      homeworkId: args.homeworkId,
      domain,
      topic,
      nodeBudget: 3,
      ...(targetGroups.length ? { targetGroups, selectedTargets, heldTargets } : {}),
      assertions: [
        {
          id: "baseline-before-practice",
          claim:
            "Spelling sessions need unscaffolded per-word recall evidence before scaffolded practice.",
          confidence: 0.95,
          evidence: [
            wordsEvidence,
            "activityToolCatalog:letter-rush supports hear-and-spell evaluator mode",
            ...childSignals,
          ],
          falsifiedBy: [
            "baseline node lacks per-target results",
            "first node reveals the word or supplies answer chunks",
          ],
        },
        {
          id: "practice-targets-error-patterns",
          claim:
            "Practice should target spelling pitfalls after the first evaluator pass instead of running every available game.",
          confidence: 0.85,
          evidence: [
            "activityToolCatalog:trap-the-imposter is practice-only",
            "activityToolCatalog:word-radar is weak for clean first-position mastery evidence",
          ],
          falsifiedBy: [
            "practice node writes mastery evidence",
            "session ignores missed words and repeats already-mastered targets",
          ],
        },
        ...(heldTargets.length
          ? [{
              id: "non-spelling-groups-held-until-baseline",
              claim:
                "Non-spelling word groups should wait until spelling has been measured, then route to recognition, reading fluency, or pronunciation.",
              confidence: Math.min(...heldTargets.map((group) => group.confidence)),
              evidence: heldTargets.flatMap((group) => group.evidence).slice(0, 8),
              falsifiedBy: [
                "high-frequency words are drilled as spelling-production targets without source evidence",
                "held groups launch before the baseline spelling measurement",
              ],
            }] satisfies AdaptivePlanAssertion[]
          : []),
      ],
      nodes: spellingPlanNodes(),
      dopamineBreak: {
        status: "eligible-after-evidence",
        reason:
          "Reward games should unlock from baseline/practice evidence, not occupy a required slot before Sunny knows the learner state.",
        candidateToolIds: ["wheel-of-fortune", "mystery"],
      },
      strongBaselinePolicy: {
        minAccuracy: 0.9,
        minimumAttempts: 5,
        nextMove: "reward-or-quest-prep",
        reason:
          "If the first hidden spelling baseline is strong, Sunny should stop grinding and move quickly to reward, quest-prep, or generated quest readiness.",
      },
      questGate: {
        status: "eligible-after-evidence",
        contentGenerationConfidenceThreshold: 0.8,
        requires: [
          "baseline_per_word_results",
          "practice_or_recheck_results",
          "cataloged_generated_content",
          "stateless_preview_audit",
        ],
        reason:
          "Quest content should be generated only after Sunny has enough evidence to assert a useful target.",
      },
    };
  }

  if (domain === "reading") {
    return {
      schemaVersion: 1,
      childId: args.childId,
      homeworkId: args.homeworkId,
      domain,
      topic,
      nodeBudget: 5,
      assertions: [
        {
          id: "comprehension-baseline-before-story",
          claim:
            "Reading comprehension needs an unscaffolded concept/question baseline before story or explanation nodes.",
          confidence: 0.92,
          evidence: [
            wordsEvidence,
            `contentDomain:${args.contentProfile?.contentDomain ?? "unknown"}`,
            `primarySkill:${args.contentProfile?.primarySkill ?? "unknown"}`,
            "activityToolCatalog:concept-check writes per-target evaluator evidence",
            ...childSignals,
          ],
          falsifiedBy: [
            "first evaluator only checks word recognition",
            "karaoke or visual teaching reveals answers before baseline",
          ],
        },
        {
          id: "pronunciation-after-reading-signal",
          claim:
            "Pronunciation should be targeted after reading exposes hesitations or academic word friction.",
          confidence: 0.78,
          evidence: ["karaoke measures reading completion and hesitations", ...childSignals],
          falsifiedBy: ["pronunciation node targets unrelated words"],
        },
      ],
      nodes: readingPlanNodes(),
      dopamineBreak: {
        status: "eligible-after-evidence",
        reason:
          "Story rewards and mystery breaks should follow baseline/reading evidence, not replace comprehension checks.",
        candidateToolIds: ["story-image-finale", "mystery"],
      },
      questGate: {
        status: "eligible-after-evidence",
        contentGenerationConfidenceThreshold: 0.82,
        requires: [
          "concept_check_baseline_results",
          "reading_completion_or_hesitation_results",
          "concept_check_exit_results",
          "cataloged_generated_content",
          "stateless_preview_audit",
        ],
        reason:
          "Quest generation needs proof of what the child understood and what still needs transfer.",
      },
    };
  }

  return {
    schemaVersion: 1,
    childId: args.childId,
    homeworkId: args.homeworkId,
    domain,
    topic,
    nodeBudget: 1,
    assertions: [
      {
        id: "needs-domain-specific-baseline",
        claim: "The conductor needs a domain-valid evaluator before generated quest content.",
        confidence: 0.7,
        evidence: [wordsEvidence, ...childSignals],
        falsifiedBy: ["first node is scaffolded practice without a baseline measurement"],
      },
    ],
    nodes: [],
    dopamineBreak: {
      status: "hold",
      reason: "No domain-specific activity sequence has been selected yet.",
      candidateToolIds: [],
    },
    questGate: {
      status: "hold",
      contentGenerationConfidenceThreshold: 0.8,
      requires: ["domain_valid_baseline", "cataloged_generated_content"],
      reason: "Quest generation waits for baseline evidence.",
    },
  };
}

export function buildAdaptiveHomeworkPlan(args: AdaptiveActivityPlanInput): AdaptiveHomeworkPlan {
  return buildAdaptiveActivityPlan(args);
}
