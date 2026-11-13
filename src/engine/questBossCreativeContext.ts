import type { LearningProfile } from "../context/schemas/learningProfile";
import type { HomeworkCycle } from "../context/schemas/homeworkCycle";
import type { AdventureChoiceOption, AdventureChoiceSet } from "../shared/adventureBoardJson";
import type { AdaptiveQuestArtifactStage } from "./adaptiveQuestArtifact";
import {
  readChoiceEvents,
  summarizeChoiceEngagement,
  type ChoiceEngagementSummary,
} from "./choiceEvents";

export type DesignerPersonaId =
  | "sports_showrunner"
  | "arcade_designer"
  | "mystery_designer"
  | "puzzle_room_designer"
  | "cozy_storybook_designer"
  | "mastery_coach";

export interface DesignerPersona {
  id: DesignerPersonaId;
  label: string;
  stance: string;
  evidenceUse: string;
}

export interface QuestBossCreativeContextPacket {
  schemaVersion: 1;
  contextVersion: "quest-boss-creative-context-v1";
  generatedAt: string;
  stage: AdaptiveQuestArtifactStage;
  nodeId: string;
  option: {
    id: string;
    label: string;
    traits: string[];
  };
  designerPersona: DesignerPersona;
  homework: {
    title: string;
    subject: string;
    topic: string;
    goal: string;
    testDate: string | null;
    urgencyDays: number | null;
    hiddenTargetCount: number;
    planHypothesis: string | null;
    evidenceUsed: string[];
  };
  engagement: ChoiceEngagementSummary & {
    preferredActivities: string[];
    avoidedActivities: string[];
    strongestTraits: string[];
    weakestTraits: string[];
    rewardPreferences: string[];
    banditSummary: string;
  };
  boardContract: {
    nodeSource: "activeSessionPlan.adventureBoard";
    choicePattern: string;
    launchBoundary: string;
    evidenceBoundary: string;
  };
  styleReference: {
    componentPattern: string;
    designTokens: string[];
    cssNotes: string[];
    interactionPattern: string[];
    companionBoundary: string;
    screenshotNotes: string[];
  };
  inspiration: Array<{
    id: string;
    pattern: string;
    usefulFor: string;
    guardrail: string;
  }>;
  promptSafety: {
    audienceRule: string;
    forbiddenMeaning: string;
    runtimeBoundary: string;
  };
}

export const SUNNY_STYLE_REFERENCE: QuestBossCreativeContextPacket["styleReference"] = {
  componentPattern:
    "Sunny style reference: AdventureChoiceModal cards, full-screen overlay, art panel, purpose label, title, short description, 8px corners, and Back to map.",
  designTokens: [
    "high-contrast readable panels",
    "tactile buttons with strong border/shadow",
    "rounded corners capped at 8px",
    "large child-readable labels without text overflow",
    "green/gold/purple accents balanced with warm panels",
  ],
  cssNotes: [
    "avoid stock-looking empty gradients",
    "make the first screen feel playable, not like instructions",
    "use compact HUD chips instead of long explanatory copy",
    "keep all target words hidden before the child attempts recall",
  ],
  interactionPattern: [
    "tap special board node",
    "choose one adventure card",
    "launch generated shell",
    "complete hidden recall rounds",
    "show replay/back engagement overlay",
  ],
  companionBoundary:
    "The Sunny companion lives outside the iframe; generated content must leave #sunny-companion empty and never draw companion chrome inside the game.",
  screenshotNotes: [
    "Match the recognizable Mystery/Choose Path card pattern before launch.",
    "The game should read as a small polished challenge with clear state, not a plain worksheet.",
  ],
};

export const CURATED_QUEST_BOSS_INSPIRATION: QuestBossCreativeContextPacket["inspiration"] = [
  {
    id: "arcade-boss-run",
    pattern: "short rounds, rising meter, satisfying finish stamp",
    usefulFor: "competition, speed, replay, boss energy",
    guardrail: "pressure follows evidence; do not make speed the proof of spelling mastery",
  },
  {
    id: "sports-showdown",
    pattern: "pre-game setup, clutch moment, scoreboard payoff",
    usefulFor: "sports, strategy, personal-best motivation",
    guardrail: "the score is presentation only; target-level recall evidence is the proof",
  },
  {
    id: "mystery-case",
    pattern: "case files, locked clues, final reveal",
    usefulFor: "mystery, calm focus, hidden-recall framing",
    guardrail: "do not reveal semantic clues or visible spelling answers",
  },
  {
    id: "puzzle-room",
    pattern: "rooms, locks, pattern fragments, deliberate control",
    usefulFor: "puzzle, control, low-pressure challenge",
    guardrail: "the puzzle wrapper must still require independent spelling production",
  },
  {
    id: "cozy-mastery",
    pattern: "gentle challenge, confidence ramp, repair after misses",
    usefulFor: "pressure-sensitive sessions and fatigue",
    guardrail: "calm does not mean removing the mastery check",
  },
];

type PersonaInput = {
  profile: LearningProfile;
  optionTraits: string[];
  engagementSummary: ChoiceEngagementSummary;
};

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function daysUntil(testDate: string | null | undefined, now: Date): number | null {
  if (!testDate || !/^\d{4}-\d{2}-\d{2}$/.test(testDate)) return null;
  const target = Date.parse(`${testDate}T00:00:00.000Z`);
  if (!Number.isFinite(target)) return null;
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  return Math.max(0, Math.ceil((target - today) / 86_400_000));
}

function traitScores(profile: LearningProfile): Array<{
  dimension: string;
  score: number;
  positive: number;
  negative: number;
}> {
  return Object.values(profile.activityTraitModel ?? {})
    .map((entry) => ({
      dimension: entry.dimension,
      score: entry.positiveWeight - entry.negativeWeight,
      positive: entry.positiveWeight,
      negative: entry.negativeWeight,
    }))
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
}

function positiveTraits(profile: LearningProfile): string[] {
  return traitScores(profile)
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((entry) => entry.dimension);
}

function negativeTraits(profile: LearningProfile): string[] {
  return traitScores(profile)
    .filter((entry) => entry.score < 0)
    .sort((a, b) => a.score - b.score)
    .slice(0, 6)
    .map((entry) => entry.dimension);
}

function traitIsPositive(profile: LearningProfile, traits: string[]): boolean {
  const wanted = new Set(traits);
  return traitScores(profile).some((entry) => wanted.has(entry.dimension) && entry.score > 0);
}

function traitIsNegative(profile: LearningProfile, traits: string[]): boolean {
  const wanted = new Set(traits);
  return traitScores(profile).some((entry) => wanted.has(entry.dimension) && entry.score < 0);
}

export function selectDesignerPersona(input: PersonaInput): DesignerPersona {
  const optionTraits = new Set(input.optionTraits);
  const pressureTraits = ["speed", "competition", "timer"];
  const pressureRisk =
    input.engagementSummary.challengeTolerance === "pressure_sensitive" ||
    input.engagementSummary.overloadPatterns.some((trait) => pressureTraits.includes(trait)) ||
    traitIsNegative(input.profile, pressureTraits);
  if (pressureRisk) {
    return {
      id: "mastery_coach",
      label: "Mastery Coach",
      stance: "Make the challenge feel confident, concrete, and repairable.",
      evidenceUse: "Use engagement evidence to reduce pressure while keeping hidden recall as the proof.",
    };
  }
  if (
    optionTraits.has("competition") ||
    optionTraits.has("sports") ||
    traitIsPositive(input.profile, ["competition", "sports", "strategy"])
  ) {
    return {
      id: "sports_showrunner",
      label: "Sports Showrunner",
      stance: "Frame the recall as a clutch but fair challenge with visible momentum.",
      evidenceUse: "Use competition and strategy preferences as wrapper fuel, not as mastery proof.",
    };
  }
  if (optionTraits.has("arcade") || traitIsPositive(input.profile, ["speed", "replay", "arcade"])) {
    return {
      id: "arcade_designer",
      label: "Arcade Designer",
      stance: "Make short rounds feel kinetic and replayable.",
      evidenceUse: "Use replay evidence to tune energy while preserving target-level attempts.",
    };
  }
  if (optionTraits.has("mystery") || traitIsPositive(input.profile, ["mystery", "story"])) {
    return {
      id: "mystery_designer",
      label: "Mystery Designer",
      stance: "Make hidden recall feel like solving a case.",
      evidenceUse: "Use mystery preference to sustain effort without leaking answer clues.",
    };
  }
  if (optionTraits.has("puzzle") || traitIsPositive(input.profile, ["puzzle", "control", "thinking"])) {
    return {
      id: "puzzle_room_designer",
      label: "Puzzle Room Designer",
      stance: "Make each recall target feel like opening a deliberate lock.",
      evidenceUse: "Use control preference to reduce guessing and increase focused attempts.",
    };
  }
  return {
    id: "cozy_storybook_designer",
    label: "Cozy Storybook Designer",
    stance: "Make the challenge warm, readable, and steady.",
    evidenceUse: "Use calm story framing to keep effort high without diluting the recall task.",
  };
}

function activitySummaries(profile: LearningProfile, kind: "preferred" | "avoided"): string[] {
  return Object.values(profile.activityModel ?? {})
    .filter((entry) => {
      if (kind === "preferred") {
        return entry.plays > 0 && (entry.likedCount ?? 0) >= (entry.dislikedCount ?? 0) && entry.engagementScore >= 0.65;
      }
      return entry.frustrationScore >= 0.55 || (entry.dislikedCount ?? 0) > (entry.likedCount ?? 0);
    })
    .sort((a, b) => {
      const scoreA = a.engagementScore - a.frustrationScore;
      const scoreB = b.engagementScore - b.frustrationScore;
      return kind === "preferred" ? scoreB - scoreA : scoreA - scoreB;
    })
    .slice(0, 5)
    .map((entry) =>
      `${entry.activityId}:engagement=${entry.engagementScore}:frustration=${entry.frustrationScore}:plays=${entry.plays}`,
    );
}

function rewardPreferenceSummary(profile: LearningProfile): string[] {
  return [
    ...(profile.rewardPreferences?.favoriteGames ?? []).map((game) => `favorite:${game}`),
    profile.rewardPreferences?.celebrationStyle
      ? `celebration:${profile.rewardPreferences.celebrationStyle}`
      : "",
    profile.rewardPreferences?.bonusRoundHistory
      ? `bonusRounds:${profile.rewardPreferences.bonusRoundHistory.triggered}/${profile.rewardPreferences.bonusRoundHistory.correct}`
      : "",
  ].filter(Boolean);
}

function banditSummary(profile: LearningProfile): string {
  const counts = profile.banditState?.counts ?? [];
  const values = profile.banditState?.values ?? [];
  if (!counts.length || !values.length) return "empty";
  const total = counts.reduce((sum, item) => sum + item, 0);
  const bestValue = Math.max(...values);
  return `total=${total}:bestValue=${Math.round(bestValue * 1000) / 1000}`;
}

function optionId(option: AdventureChoiceOption): string {
  return option.id || option.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function optionTraits(option: AdventureChoiceOption): string[] {
  return unique([...(option.tags ?? []), option.label]);
}

function inspirationFor(persona: DesignerPersona, traits: string[]): QuestBossCreativeContextPacket["inspiration"] {
  const wanted = new Set([persona.id, ...traits]);
  const selected = CURATED_QUEST_BOSS_INSPIRATION.filter((item) =>
    item.id.includes("arcade") && (wanted.has("sports_showrunner") || wanted.has("competition")) ||
    item.id.includes("sports") && (wanted.has("sports_showrunner") || wanted.has("strategy")) ||
    item.id.includes("mystery") && (wanted.has("mystery_designer") || wanted.has("mystery")) ||
    item.id.includes("puzzle") && (wanted.has("puzzle_room_designer") || wanted.has("puzzle")) ||
    item.id.includes("cozy") && wanted.has("mastery_coach"),
  );
  return selected.length ? selected : CURATED_QUEST_BOSS_INSPIRATION.slice(0, 3);
}

export function buildQuestBossCreativeContextPacket(input: {
  childId: string;
  kind: AdaptiveQuestArtifactStage;
  nodeId: string;
  choiceSet: AdventureChoiceSet;
  option: AdventureChoiceOption;
  targetWords: string[];
  homeworkCycle: HomeworkCycle;
  profile: LearningProfile;
  rootDir?: string;
  now?: Date;
}): QuestBossCreativeContextPacket {
  const now = input.now ?? new Date();
  const choiceSummary = summarizeChoiceEngagement(
    input.rootDir ? readChoiceEvents(input.childId, { rootDir: input.rootDir }) : [],
  );
  const strongestTraits = positiveTraits(input.profile);
  const weakestTraits = negativeTraits(input.profile);
  const mergedSummary: ChoiceEngagementSummary = {
    preferredWrappers: unique([...choiceSummary.preferredWrappers, ...strongestTraits]),
    replayedWrappers: unique(choiceSummary.replayedWrappers),
    avoidedWrappers: unique([...choiceSummary.avoidedWrappers, ...weakestTraits]),
    challengeTolerance: choiceSummary.challengeTolerance,
    overloadPatterns: unique([...choiceSummary.overloadPatterns, ...weakestTraits.filter((trait) =>
      ["speed", "competition", "timer"].includes(trait),
    )]),
  };
  const traits = optionTraits(input.option);
  const persona = selectDesignerPersona({
    profile: input.profile,
    optionTraits: traits,
    engagementSummary: mergedSummary,
  });
  const captured = input.homeworkCycle.capturedContent;
  const topic = captured?.contentProfile?.topic ?? captured?.title ?? input.homeworkCycle.homeworkId;
  return {
    schemaVersion: 1,
    contextVersion: "quest-boss-creative-context-v1",
    generatedAt: now.toISOString(),
    stage: input.kind,
    nodeId: input.nodeId,
    option: {
      id: optionId(input.option),
      label: input.option.label,
      traits,
    },
    designerPersona: persona,
    homework: {
      title: captured?.title ?? input.homeworkCycle.homeworkId,
      subject: input.homeworkCycle.subject,
      topic,
      goal: "prove hidden spelling recall without exposing answers first",
      testDate: input.homeworkCycle.testDate ?? input.profile.pendingHomework?.testDate ?? null,
      urgencyDays: daysUntil(input.homeworkCycle.testDate ?? input.profile.pendingHomework?.testDate, now),
      hiddenTargetCount: input.targetWords.length,
      planHypothesis: input.profile.activeSessionPlan?.planTheory?.hypothesis ?? null,
      evidenceUsed: input.profile.activeSessionPlan?.evidenceUsed.map((item) => `${item.type}:${item.summary}`) ?? [],
    },
    engagement: {
      ...mergedSummary,
      preferredActivities: activitySummaries(input.profile, "preferred"),
      avoidedActivities: activitySummaries(input.profile, "avoided"),
      strongestTraits,
      weakestTraits,
      rewardPreferences: rewardPreferenceSummary(input.profile),
      banditSummary: banditSummary(input.profile),
    },
    boardContract: {
      nodeSource: "activeSessionPlan.adventureBoard",
      choicePattern:
        "Quest/Boss wrappers open the shared card modal, then Sunny launches only the selected validated candidate.",
      launchBoundary:
        "The board owns route state, candidate selection, iframe launch, and post-activity engagement overlay.",
      evidenceBoundary:
        "Generated content emits attempt_event and completion through /games/_contract.js; replay/back evidence is engagement, not mastery.",
    },
    styleReference: SUNNY_STYLE_REFERENCE,
    inspiration: inspirationFor(persona, traits),
    promptSafety: {
      audienceRule: "Use second person; do not write the child name in any child-facing copy.",
      forbiddenMeaning:
        "Target words, definitions, rhymes, semantic hints, runtime code, and companion chrome are outside the creative spec.",
      runtimeBoundary:
        "Sunny owns the shell, contract, hidden targets, attempt events, completion events, validation hooks, and replay/back overlay.",
    },
  };
}

export function renderCreativeContextForPrompt(packet: QuestBossCreativeContextPacket): string {
  const promptView = {
    contextVersion: packet.contextVersion,
    stage: packet.stage,
    option: packet.option,
    designerPersona: packet.designerPersona,
    homework: packet.homework,
    engagement: packet.engagement,
    boardContract: packet.boardContract,
    "Sunny style reference": packet.styleReference,
    "curated inspiration": packet.inspiration,
    promptSafety: packet.promptSafety,
  };
  return [
    "Creative context packet:",
    JSON.stringify(promptView, null, 2),
    "Use this context as design bearing only. Use second person and do not write the child name.",
  ].join("\n");
}
