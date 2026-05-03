import type {
  ContentProfile,
  HomeworkType,
  PlannedHomeworkNode,
} from "../scripts/contentAwareHomeworkPlanner";

export type HomeworkInterventionType =
  | "baseline-evaluator"
  | "story"
  | "pronunciation"
  | "concept-builder"
  | "spelling-retrieval"
  | "spelling-production"
  | "competitive-retrieval"
  | "exit-evaluator";

export type HomeworkCarePlanIntervention = {
  id: string;
  type: HomeworkInterventionType;
  nodeType: PlannedHomeworkNode["type"];
  title: string;
  reason: string;
  targetSkills: string[];
  targetConcepts: string[];
  targetWords: string[];
  algorithmTargets: string[];
  measures: string[];
};

export type HomeworkCarePlan = {
  homeworkId: string;
  childId: string;
  assignment: {
    title: string;
    type: HomeworkType;
    topic: string;
    practiceDomain: string;
    contentDomain: string;
    primarySkill: string;
  };
  reinforcementWords: string[];
  rationale: string[];
  interventions: HomeworkCarePlanIntervention[];
};

function clean(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean))];
}

function supportTerms(profile: ContentProfile, words: string[]): string[] {
  return clean([...profile.concepts, profile.topic, ...words]).slice(0, 5);
}

export function buildHomeworkCarePlan(args: {
  homeworkId: string;
  childId: string;
  title: string;
  type: HomeworkType;
  words: string[];
  contentProfile: ContentProfile;
  reinforcementWords?: string[];
}): HomeworkCarePlan {
  const profile = args.contentProfile;
  const topic = profile.topic || args.title || "homework";
  const terms = supportTerms(profile, args.words);
  const reinforcementWords = clean(args.reinforcementWords ?? []).slice(0, 3);
  const interventions: HomeworkCarePlanIntervention[] = [];
  const rationale = [
    `Assignment goal is ${profile.primarySkill} for ${topic}.`,
    `Available activities are selected as interventions, not as a fixed game list.`,
  ];

  const contentApplies =
    profile.contentDomain !== "generic" &&
    profile.contentDomain !== "language_arts" &&
    topic !== "homework" &&
    topic !== "spelling_test";

  if (contentApplies && terms.length > 0) {
    interventions.push({
      id: "baseline-evaluator",
      type: "baseline-evaluator",
      nodeType: "word-radar",
      title: `Baseline check: ${topic}`,
      reason: `Check whether the child recognizes the core ${topic} concepts before the teaching story.`,
      targetSkills: [profile.primarySkill, "baseline_understanding"],
      targetConcepts: terms,
      targetWords: terms,
      algorithmTargets: ["retrieval-practice", "reading-comprehension"],
      measures: ["concept_recognition_accuracy", "missed_concepts"],
    });
    interventions.push({
      id: "story",
      type: "story",
      nodeType: "karaoke",
      title: `Story: ${topic}`,
      reason: `Build background knowledge and engagement around ${topic}.`,
      targetSkills: [profile.primarySkill, "reading_fluency"],
      targetConcepts: terms,
      targetWords: reinforcementWords,
      algorithmTargets: ["reading-comprehension", "activity-affinity"],
      measures: ["reading_completion", "hesitations", "flagged_words"],
    });
    interventions.push({
      id: "pronunciation",
      type: "pronunciation",
      nodeType: "pronunciation",
      title: `Pronounce key ${topic} words`,
      reason: "Academic words must be speakable before they can be explained confidently.",
      targetSkills: ["pronunciation", profile.primarySkill],
      targetConcepts: terms,
      targetWords: terms,
      algorithmTargets: ["pronunciation", "desirable-difficulty"],
      measures: ["pronunciation_accuracy", "hesitation"],
    });
    interventions.push({
      id: "concept-builder",
      type: "concept-builder",
      nodeType: "word-builder",
      title: `Build ${topic} vocabulary`,
      reason: `Require active construction of the academic vocabulary needed to explain ${topic}.`,
      targetSkills: ["academic_vocabulary", profile.primarySkill],
      targetConcepts: terms,
      targetWords: terms,
      algorithmTargets: ["retrieval-practice", "desirable-difficulty"],
      measures: ["construction_accuracy", "attempted_value"],
    });
    interventions.push({
      id: "exit-evaluator",
      type: "exit-evaluator",
      nodeType: "word-radar",
      title: `Exit check: ${topic}`,
      reason: `Re-check ${topic} concepts after intervention to decide whether to generate harder content.`,
      targetSkills: [profile.primarySkill, "transfer_check"],
      targetConcepts: terms,
      targetWords: terms,
      algorithmTargets: ["mastery-gating", "retrieval-practice"],
      measures: ["exit_accuracy", "improvement_from_baseline"],
    });
  }

  if (args.type === "spelling_test" && args.words.length > 0) {
    interventions.push(
      {
        id: "spelling-retrieval",
        type: "spelling-retrieval",
        nodeType: "word-radar",
        title: "Recognize spelling words",
        reason: "Warm up recognition before production.",
        targetSkills: ["spelling_recognition"],
        targetConcepts: terms,
        targetWords: args.words,
        algorithmTargets: ["spaced-repetition", "retrieval-practice"],
        measures: ["recognition_accuracy"],
      },
      {
        id: "spelling-production",
        type: "spelling-production",
        nodeType: "spell-check",
        title: "Spell from memory",
        reason: "Capture typed attempts for diagnostics and SM-2 updates.",
        targetSkills: ["spelling_production"],
        targetConcepts: terms,
        targetWords: args.words,
        algorithmTargets: ["spaced-repetition", "error-pattern-remediation"],
        measures: ["typed_accuracy", "attempted_value"],
      },
      {
        id: "competitive-retrieval",
        type: "competitive-retrieval",
        nodeType: "wheel-of-fortune",
        title: "Competitive retrieval",
        reason: "Use a motivating game format for repeated retrieval.",
        targetSkills: ["spelling_retrieval"],
        targetConcepts: terms,
        targetWords: args.words,
        algorithmTargets: ["retrieval-practice", "activity-affinity"],
        measures: ["game_accuracy", "completion"],
      },
    );
  }

  return {
    homeworkId: args.homeworkId,
    childId: args.childId,
    assignment: {
      title: args.title,
      type: args.type,
      topic,
      practiceDomain: profile.practiceDomain,
      contentDomain: profile.contentDomain,
      primarySkill: profile.primarySkill,
    },
    reinforcementWords,
    rationale,
    interventions,
  };
}

export function renderHomeworkCarePlanMarkdown(plan: HomeworkCarePlan): string {
  const lines = [
    `# Homework Learning Plan: ${plan.assignment.title}`,
    "",
    `- homeworkId: ${plan.homeworkId}`,
    `- childId: ${plan.childId}`,
    `- assignment: ${plan.assignment.topic} (${plan.assignment.practiceDomain}/${plan.assignment.contentDomain})`,
    `- primarySkill: ${plan.assignment.primarySkill}`,
    `- reinforcementWords: ${plan.reinforcementWords.join(", ") || "(none)"}`,
    "",
    "## Rationale",
    ...plan.rationale.map((item) => `- ${item}`),
    "",
    "## Interventions",
  ];
  for (const [idx, intervention] of plan.interventions.entries()) {
    lines.push(
      "",
      `### ${idx + 1}. ${intervention.title}`,
      `- role: ${intervention.type}`,
      `- nodeType: ${intervention.nodeType}`,
      `- reason: ${intervention.reason}`,
      `- targets: ${[
        ...intervention.targetSkills,
        ...intervention.targetConcepts,
      ].join(", ")}`,
      `- measures: ${intervention.measures.join(", ")}`,
      `- algorithms: ${intervention.algorithmTargets.join(", ")}`,
    );
  }
  return `${lines.join("\n")}\n`;
}
