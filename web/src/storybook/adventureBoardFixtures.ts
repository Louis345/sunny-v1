import type { AdventureBoardJson } from "../../../src/shared/adventureBoardJson";
import {
  buildAdventureBoardFromActiveSessionPlan,
  type ActiveSessionPlanBoardNodeSnapshot,
  type ActiveSessionPlanBoardSnapshot,
} from "../../../src/shared/adventureBoardFromPlan";

const theme = {
  background: {
    type: "gradient",
    value:
      "radial-gradient(circle at 80% 18%, rgba(255, 255, 255, 0.32), transparent 18%), radial-gradient(circle at 84% 92%, rgba(252, 211, 77, 0.18), transparent 24%), linear-gradient(180deg, #94d7ea 0%, #b9e4d8 48%, #f5df9b 100%)",
  },
  palette: {
    path: "#ffffff",
    completed: "#2f9f6f",
    available: "#7058f4",
    locked: "#aeb7c2",
    current: "#ef9825",
    preview: "#d5dde5",
    text: "#ffffff",
    panel: "rgba(21, 31, 50, 0.80)",
  },
} satisfies AdventureBoardJson["theme"];

export const linearBaselineBoard: AdventureBoardJson = {
  schemaVersion: 1,
  boardId: "storybook-linear-baseline",
  planId: "design-bench-linear",
  childId: "reina",
  domain: "spelling",
  title: "Silent Letter Warmup",
  theme,
  progress: {
    currentNodeId: "word-radar",
    completedNodeIds: ["start"],
  },
  nodes: [
    {
      id: "start",
      kind: "start",
      label: "Start",
      icon: "check",
      position: { x: 0.14, y: 0.78 },
      state: "completed",
    },
    {
      id: "word-radar",
      kind: "activity",
      activityId: "word-radar",
      label: "Word Radar",
      icon: "radar",
      position: { x: 0.34, y: 0.60 },
      state: "current",
      evidenceRole: "baseline",
      target: {
        laneId: "silent_letters",
        skill: "spell_from_memory",
        words: ["know", "write"],
      },
      action: { type: "launch-activity", payloadId: "word-radar" },
    },
    {
      id: "spell-check",
      kind: "activity",
      activityId: "spell-check",
      label: "Spell Check",
      icon: "book",
      position: { x: 0.56, y: 0.46 },
      state: "available",
      evidenceRole: "baseline",
      target: {
        laneId: "silent_letters",
        skill: "spell_from_memory",
        words: ["gnat", "wrong", "climb"],
      },
      action: { type: "launch-activity", payloadId: "spell-check" },
    },
    {
      id: "choice",
      kind: "choice-gate",
      label: "Choose Path",
      icon: "route",
      position: { x: 0.74, y: 0.34 },
      state: "locked",
      evidenceRole: "preference",
      choiceSetId: "after-baseline",
      lock: {
        reason: "needs-baseline",
        label: "Unlocks after baseline",
        progressLabel: "2 checks first",
      },
      action: { type: "open-choice-set", payloadId: "after-baseline" },
    },
  ],
  edges: [
    { id: "e-start-radar", from: "start", to: "word-radar", state: "completed" },
    { id: "e-radar-spell", from: "word-radar", to: "spell-check", state: "available" },
    { id: "e-spell-choice", from: "spell-check", to: "choice", state: "locked", style: "dashed" },
  ],
};

export const forkMomentBoard: AdventureBoardJson = {
  ...linearBaselineBoard,
  boardId: "storybook-fork-moment",
  planId: "design-bench-fork",
  title: "Mystery Fork",
  progress: {
    currentNodeId: "mystery",
    completedNodeIds: ["start", "word-radar", "spell-check"],
    activeChoiceSetId: "after-baseline",
  },
  nodes: [
    {
      id: "start",
      kind: "start",
      label: "Start",
      icon: "check",
      position: { x: 0.14, y: 0.88 },
      state: "completed",
    },
    {
      id: "word-radar",
      kind: "activity",
      activityId: "word-radar",
      label: "Word Radar",
      icon: "radar",
      position: { x: 0.29, y: 0.76 },
      state: "completed",
      evidenceRole: "baseline",
      target: {
        laneId: "silent_letters",
        skill: "spell_from_memory",
        words: ["know", "write"],
      },
      action: { type: "launch-activity", payloadId: "word-radar" },
    },
    {
      id: "spell-check",
      kind: "activity",
      activityId: "spell-check",
      label: "Spell Check",
      icon: "book",
      position: { x: 0.39, y: 0.65 },
      state: "completed",
      evidenceRole: "baseline",
      target: {
        laneId: "silent_letters",
        skill: "spell_from_memory",
        words: ["gnat", "wrong", "climb"],
      },
      action: { type: "launch-activity", payloadId: "spell-check" },
    },
    {
      id: "mystery",
      kind: "mystery",
      label: "Mystery",
      icon: "mystery",
      position: { x: 0.50, y: 0.55 },
      state: "current",
      evidenceRole: "preference",
      choiceSetId: "after-baseline",
      action: { type: "open-choice-set", payloadId: "after-baseline" },
    },
    {
      id: "story-challenge",
      kind: "activity",
      activityId: "story-game",
      label: "Story Challenge",
      icon: "book",
      position: { x: 0.30, y: 0.38 },
      state: "available",
      evidenceRole: "preference",
    },
    {
      id: "speed-challenge",
      kind: "activity",
      activityId: "word-puzzle",
      label: "Speed Challenge",
      icon: "zap",
      position: { x: 0.70, y: 0.38 },
      state: "available",
      evidenceRole: "preference",
    },
    {
      id: "quest",
      kind: "quest",
      label: "Quest",
      icon: "star",
      position: { x: 0.50, y: 0.27 },
      state: "preview",
      evidenceRole: "transfer",
      lock: {
        reason: "needs-challenge-evidence",
        label: "Quest unlocks after a challenge",
        progressLabel: "prove the path",
      },
    },
    {
      id: "boss",
      kind: "boss",
      label: "Boss",
      icon: "crown",
      position: { x: 0.50, y: 0.10 },
      state: "locked",
      evidenceRole: "mastery",
      lock: {
        reason: "needs-quest-evidence",
        label: "Boss unlocks after Quest",
      },
    },
  ],
  edges: [
    { id: "e-start-radar", from: "start", to: "word-radar", state: "completed" },
    { id: "e-radar-spell", from: "word-radar", to: "spell-check", state: "completed" },
    { id: "e-spell-mystery", from: "spell-check", to: "mystery", state: "available", style: "glow" },
    { id: "e-mystery-story", from: "mystery", to: "story-challenge", state: "available" },
    { id: "e-mystery-speed", from: "mystery", to: "speed-challenge", state: "available" },
    { id: "e-story-quest", from: "story-challenge", to: "quest", state: "preview", style: "dashed" },
    { id: "e-speed-quest", from: "speed-challenge", to: "quest", state: "preview", style: "dashed" },
    { id: "e-quest-boss", from: "quest", to: "boss", state: "locked", style: "dashed" },
  ],
  choiceSets: [
    {
      id: "after-baseline",
      kind: "mystery",
      title: "Pick a challenge",
      options: [
        {
          id: "story-challenge",
          label: "Story Challenge",
          description: "Use the words inside a quick mission scene.",
          icon: "book",
          state: "available",
          nodeId: "story-challenge",
          tags: ["story", "creative"],
        },
        {
          id: "speed-challenge",
          label: "Speed Challenge",
          description: "Try a fast round with the same target words.",
          icon: "zap",
          state: "available",
          nodeId: "speed-challenge",
          tags: ["arcade", "fast"],
        },
      ],
    },
  ],
};

export const questLockedBoard: AdventureBoardJson = {
  ...forkMomentBoard,
  boardId: "storybook-quest-locked",
  planId: "design-bench-quest",
  title: "Quest Is Preparing",
  progress: {
    currentNodeId: "story-challenge",
    completedNodeIds: ["start", "word-radar", "spell-check", "mystery"],
  },
  nodes: forkMomentBoard.nodes.map((node) =>
    node.id === "mystery"
      ? { ...node, state: "completed" as const }
      : node.id === "story-challenge"
        ? { ...node, state: "current" as const }
        : node.id === "speed-challenge"
          ? { ...node, state: "preview" as const }
          : node,
  ),
  choiceSets: undefined,
};

export const bossReadyBoard: AdventureBoardJson = {
  ...questLockedBoard,
  boardId: "storybook-boss-ready",
  planId: "design-bench-boss",
  title: "Boss Ready",
  progress: {
    currentNodeId: "boss",
    completedNodeIds: ["start", "word-radar", "spell-check", "mystery", "story-challenge", "quest"],
  },
  nodes: questLockedBoard.nodes.map((node) => {
    if (node.id === "quest") return { ...node, state: "completed" as const, lock: undefined };
    if (node.id === "boss") return { ...node, state: "current" as const, lock: undefined };
    return node.state === "current" ? { ...node, state: "completed" as const } : node;
  }),
  edges: questLockedBoard.edges.map((edge) =>
    edge.id === "e-story-quest"
      ? { ...edge, state: "completed" as const, style: "solid" as const }
      : edge.id === "e-quest-boss"
        ? { ...edge, state: "available" as const, style: "glow" as const }
        : edge,
  ),
};

export const choicePolicySpineBoard: AdventureBoardJson = {
  schemaVersion: 1,
  boardId: "storybook-choice-policy-spine",
  planId: "design-bench-choice-policy",
  childId: "reina",
  domain: "spelling",
  title: "Choice Policy Spine",
  theme,
  progress: {
    currentNodeId: "mystery",
    completedNodeIds: ["word-radar", "spell-check", "read-aloud"],
    activeChoiceSetId: "mystery-choice",
  },
  nodes: [
    {
      id: "word-radar",
      kind: "activity",
      activityId: "word-radar",
      label: "Word Radar",
      icon: "radar",
      position: { x: 0.36, y: 0.82 },
      state: "completed",
      evidenceRole: "baseline",
    },
    {
      id: "spell-check",
      kind: "activity",
      activityId: "spell-check",
      label: "Spell Check",
      icon: "book",
      position: { x: 0.25, y: 0.66 },
      state: "completed",
      evidenceRole: "baseline",
    },
    {
      id: "read-aloud",
      kind: "activity",
      activityId: "pronunciation",
      label: "Read Aloud",
      icon: "book",
      position: { x: 0.55, y: 0.66 },
      state: "completed",
      evidenceRole: "baseline",
    },
    {
      id: "mystery",
      kind: "mystery",
      label: "Mystery",
      icon: "mystery",
      position: { x: 0.40, y: 0.51 },
      state: "current",
      evidenceRole: "preference",
      choiceSetId: "mystery-choice",
      action: { type: "open-choice-set", payloadId: "mystery-choice" },
    },
    {
      id: "story-route",
      kind: "reward",
      label: "Story",
      icon: "book",
      position: { x: 0.25, y: 0.37 },
      state: "preview",
      evidenceRole: "transfer",
    },
    {
      id: "speed-route",
      kind: "reward",
      label: "Speed",
      icon: "zap",
      position: { x: 0.55, y: 0.37 },
      state: "preview",
      evidenceRole: "transfer",
    },
    {
      id: "quest",
      kind: "quest",
      label: "Quest",
      icon: "star",
      position: { x: 0.40, y: 0.26 },
      state: "preview",
      evidenceRole: "transfer",
      choiceSetId: "quest-choice",
      lock: {
        reason: "needs-mystery-outcome",
        label: "Quest choices unlock after Mystery evidence",
      },
    },
    {
      id: "boss",
      kind: "boss",
      label: "Boss",
      icon: "crown",
      position: { x: 0.40, y: 0.10 },
      state: "locked",
      evidenceRole: "mastery",
      choiceSetId: "boss-choice",
      lock: {
        reason: "needs-quest-evidence",
        label: "Boss choices unlock after Quest evidence",
      },
    },
  ],
  edges: [
    { id: "e-radar-spell", from: "word-radar", to: "spell-check", state: "completed" },
    { id: "e-radar-read", from: "word-radar", to: "read-aloud", state: "completed" },
    { id: "e-spell-mystery", from: "spell-check", to: "mystery", state: "available", style: "glow" },
    { id: "e-read-mystery", from: "read-aloud", to: "mystery", state: "available", style: "glow" },
    { id: "e-mystery-story-route", from: "mystery", to: "story-route", state: "preview", style: "dashed" },
    { id: "e-mystery-speed-route", from: "mystery", to: "speed-route", state: "preview", style: "dashed" },
    { id: "e-story-route-quest", from: "story-route", to: "quest", state: "preview", style: "dashed" },
    { id: "e-speed-route-quest", from: "speed-route", to: "quest", state: "preview", style: "dashed" },
    { id: "e-quest-boss", from: "quest", to: "boss", state: "locked", style: "dashed" },
  ],
  choiceSets: [
    {
      id: "mystery-choice",
      kind: "mystery",
      title: "Mystery picks",
      options: [
        {
          id: "mystery-story",
          label: "Story",
          description: "Creative wrapper, same spelling target.",
          icon: "book",
          state: "available",
          nodeId: "mystery-story",
          tags: ["choice-policy", "creative"],
        },
        {
          id: "mystery-speed",
          label: "Speed",
          description: "Fast wrapper, same spelling target.",
          icon: "zap",
          state: "available",
          nodeId: "mystery-speed",
          tags: ["choice-policy", "arcade"],
        },
      ],
    },
    {
      id: "quest-choice",
      kind: "quest-wrapper",
      title: "Quest wrappers",
      options: [
        { id: "quest-story", label: "Story Quest", icon: "book", state: "locked", nodeId: "quest-story" },
        { id: "quest-puzzle", label: "Puzzle Quest", icon: "sparkles", state: "locked", nodeId: "quest-puzzle" },
        { id: "quest-arcade", label: "Arcade Quest", icon: "game", state: "locked", nodeId: "quest-arcade" },
      ],
    },
    {
      id: "boss-choice",
      kind: "boss-wrapper",
      title: "Boss finales",
      options: [
        { id: "boss-showdown", label: "Showdown", icon: "swords", state: "locked", nodeId: "boss-showdown" },
        { id: "boss-puzzle", label: "Final Puzzle", icon: "sparkles", state: "locked", nodeId: "boss-puzzle" },
        { id: "boss-story", label: "Final Story", icon: "book", state: "locked", nodeId: "boss-story" },
      ],
    },
  ],
};

export const denseSpellingBoard: AdventureBoardJson = {
  ...questLockedBoard,
  boardId: "storybook-dense-spelling",
  planId: "design-bench-dense",
  title: "Silent Letter Expedition",
  layout: {
    preset: "horizontal-adventure-spine",
    companionSlot: "right",
    routeChoiceBehavior: "exclusive",
  },
  plannerRationale: {
    agencyDesign:
      "Reina sees a compact route with one visible evidence path and modal choices at Mystery, Quest, and Boss.",
    evidenceDesign:
      "Baseline nodes measure spelling construction, verification, and optional read-aloud reinforcement before generated transfer.",
    layoutChoice:
      "Horizontal spine preserves room for Matilda on the right and keeps the route readable without hand-written board logic.",
  },
  companion: {
    id: "matilda",
    name: "Matilda",
  },
  nodes: [
    {
      id: "start",
      kind: "start",
      label: "Start",
      position: { x: 0.10, y: 0.82 },
      layout: { role: "start", order: 1 },
      state: "completed",
    },
    {
      id: "wr-conflict",
      kind: "activity",
      activityId: "word-radar",
      label: "Know / Write",
      icon: "radar",
      position: { x: 0.25, y: 0.70 },
      layout: { role: "baseline", lane: "main", order: 1 },
      state: "completed",
      evidenceRole: "baseline",
    },
    {
      id: "spell-conflict",
      kind: "activity",
      activityId: "spell-check",
      label: "Verify",
      icon: "book",
      position: { x: 0.40, y: 0.58 },
      layout: { role: "baseline", lane: "main", order: 2 },
      state: "completed",
      evidenceRole: "baseline",
    },
    {
      id: "mystery",
      kind: "mystery",
      label: "Mystery",
      icon: "mystery",
      position: { x: 0.54, y: 0.46 },
      layout: { role: "mystery", order: 1 },
      state: "current",
      evidenceRole: "preference",
      choiceSetId: "dense-mystery-choice",
      action: { type: "open-choice-set", payloadId: "dense-mystery-choice" },
    },
    {
      id: "wr-light",
      kind: "activity",
      activityId: "word-radar",
      label: "Light Check",
      icon: "radar",
      position: { x: 0.38, y: 0.30 },
      layout: { role: "evidence-route", lane: "upper", order: 1, routeGroupId: "after-verify-route" },
      state: "available",
      evidenceRole: "baseline",
    },
    {
      id: "hf-read",
      kind: "activity",
      activityId: "pronunciation",
      label: "Read Aloud",
      icon: "book",
      position: { x: 0.58, y: 0.26 },
      layout: { role: "evidence-route", lane: "upper", order: 2, routeGroupId: "after-verify-route" },
      state: "available",
      evidenceRole: "baseline",
    },
    {
      id: "choice",
      kind: "choice-gate",
      label: "Choose Path",
      icon: "route",
      position: { x: 0.64, y: 0.56 },
      layout: { role: "choice-gate", order: 1 },
      state: "locked",
      lock: {
        reason: "needs-baseline",
        label: "Unlocks after current check",
      },
    },
    {
      id: "quest",
      kind: "quest",
      label: "Quest",
      icon: "star",
      position: { x: 0.76, y: 0.34 },
      layout: { role: "quest", order: 1 },
      state: "preview",
      lock: {
        reason: "needs-baseline-evidence",
        label: "Preparing",
      },
    },
    {
      id: "boss",
      kind: "boss",
      label: "Boss",
      icon: "crown",
      position: { x: 0.86, y: 0.18 },
      layout: { role: "boss", order: 1 },
      state: "locked",
      lock: {
        reason: "needs-quest-evidence",
        label: "After Quest",
      },
    },
  ],
  edges: [
    { id: "e1", from: "start", to: "wr-conflict", state: "completed" },
    { id: "e2", from: "wr-conflict", to: "spell-conflict", state: "completed" },
    { id: "e3", from: "spell-conflict", to: "mystery", state: "available", style: "glow" },
    { id: "e4", from: "mystery", to: "choice", state: "locked", style: "dashed" },
    { id: "e5", from: "spell-conflict", to: "wr-light", state: "available" },
    { id: "e6", from: "wr-light", to: "hf-read", state: "available" },
    { id: "e7", from: "hf-read", to: "choice", state: "locked", style: "dashed" },
    { id: "e8", from: "choice", to: "quest", state: "preview", style: "dashed" },
    { id: "e9", from: "quest", to: "boss", state: "locked", style: "dashed" },
  ],
  choiceSets: [
    {
      id: "dense-mystery-choice",
      kind: "mystery",
      title: "Pick a challenge",
      options: [
        {
          id: "story-challenge",
          label: "Story Challenge",
          description: "Use the spelling words inside a quick mission.",
          icon: "book",
          state: "available",
          nodeId: "story-challenge",
          tags: ["story", "creative"],
        },
        {
          id: "speed-challenge",
          label: "Speed Challenge",
          description: "Try a fast round with the same target words.",
          icon: "zap",
          state: "available",
          nodeId: "speed-challenge",
          tags: ["arcade", "fast"],
        },
      ],
    },
  ],
};

const fullExperienceArt = {
  background: "/generated/adventure-board-demo/silent-letter-world.jpeg",
  start: "/thumbnails/activities/word-radar.svg",
  wordRadar: "/generated/adventure-board-demo/word-radar.jpeg",
  spellCheck: "/generated/adventure-board-demo/spell-check.jpeg",
  pronunciation: "/generated/adventure-board-demo/pronunciation.jpeg",
  mystery: "/generated/adventure-board-demo/mystery.jpeg",
  choice: "/thumbnails/mystery-fallback.svg",
  quest: "/generated/adventure-board-demo/quest.jpeg",
  boss: "/generated/adventure-board-demo/boss.jpeg",
  storyChoice: "/thumbnails/activities/karaoke.svg",
  speedChoice: "/thumbnails/activities/speed-catcher.svg",
} as const;

function denseThumbnailFor(node: AdventureBoardJson["nodes"][number]): string | undefined {
  if (node.id === "start") return fullExperienceArt.start;
  if (node.kind === "mystery") return fullExperienceArt.mystery;
  if (node.kind === "choice-gate") return fullExperienceArt.choice;
  if (node.kind === "quest") return fullExperienceArt.quest;
  if (node.kind === "boss") return fullExperienceArt.boss;
  if (node.activityId === "word-radar") return fullExperienceArt.wordRadar;
  if (node.activityId === "spell-check") return fullExperienceArt.spellCheck;
  if (node.activityId === "pronunciation") return fullExperienceArt.pronunciation;
  return undefined;
}

export const reinaMay24ActiveSessionPlanSnapshot: ActiveSessionPlanBoardSnapshot = {
  planId: "assignment-plan-reina-9e9fe934",
  childId: "reina",
  domain: "spelling",
  nodePlan: [
    {
      id: "baseline_silent_letters_spelling",
      type: "word-radar",
      activityId: "word-radar",
      targets: ["sign", "know", "write", "thumb", "comb", "gnat", "knock", "knife", "wrong", "climb"],
      targetLane: "silent_letters",
      locked: false,
      wordRadarConfig: {
        recallMode: "partial_visual_recall",
        inputMode: "letter-by-letter",
        speakStyle: "option-a",
        showTimer: false,
        hideWordDuringResponse: true,
        requiresCapturedResponse: true,
      },
    },
    {
      id: "baseline_high_frequency_recognition",
      type: "word-radar",
      activityId: "word-radar",
      targets: ["among", "building", "circle", "decided", "finally", "heavy", "include", "nothing", "special", "wheel"],
      targetLane: "high_frequency_words",
      locked: false,
      wordRadarConfig: {
        recallMode: "visible_read",
        inputMode: "whole-word",
        speakStyle: "option-a",
        showTimer: false,
        hideWordDuringResponse: false,
        requiresCapturedResponse: true,
      },
    },
    {
      id: "baseline_spelling_diagnostic",
      type: "spell-check",
      activityId: "spell-check",
      targets: ["sign", "know", "write", "thumb", "comb", "gnat", "knock", "knife", "wrong", "climb"],
      targetLane: "silent_letters",
      locked: false,
    },
    {
      id: "mystery_choice",
      type: "mystery",
      activityId: "mystery",
      targets: ["sign", "know", "write", "thumb", "comb", "gnat", "knock", "knife", "wrong", "climb", "among", "building", "circle", "decided", "finally", "heavy", "include", "nothing", "special", "wheel"],
      targetLane: "silent_letters",
      choiceMode: "choice_lab",
      locked: false,
    },
    {
      id: "quest_transfer",
      type: "quest",
      activityId: "quest",
      targets: ["sign", "know", "write", "thumb", "comb", "gnat", "knock", "knife", "wrong", "climb", "among", "building", "circle", "decided", "finally", "heavy", "include", "nothing", "special", "wheel"],
      targetLane: "silent_letters",
      locked: true,
      masteryUnlockState: "preparing",
    },
    {
      id: "boss_mastery",
      type: "boss",
      activityId: "boss",
      targets: [],
      targetLane: "silent_letters",
      locked: true,
      masteryUnlockState: "preparing",
    },
  ],
};

function reinaCurrentHomeworkLabel(node: ActiveSessionPlanBoardNodeSnapshot): string | undefined {
  if (node.id === "baseline_silent_letters_spelling") return "Silent Letters";
  if (node.id === "baseline_high_frequency_recognition") return "High Frequency";
  if (node.id === "baseline_spelling_diagnostic") return "Spell Check";
  if (node.id === "mystery_choice") return "Mystery";
  if (node.id === "quest_transfer") return "Quest";
  if (node.id === "boss_mastery") return "Boss";
  return undefined;
}

function reinaCurrentHomeworkThumbnail(node: ActiveSessionPlanBoardNodeSnapshot): string | undefined {
  if (node.activityId === "word-radar") return fullExperienceArt.wordRadar;
  if (node.activityId === "spell-check") return fullExperienceArt.spellCheck;
  if (node.activityId === "mystery") return fullExperienceArt.mystery;
  if (node.activityId === "quest") return fullExperienceArt.quest;
  if (node.activityId === "boss") return fullExperienceArt.boss;
  return undefined;
}

export const reinaCurrentHomeworkBoard = buildAdventureBoardFromActiveSessionPlan({
  plan: reinaMay24ActiveSessionPlanSnapshot,
  boardId: "storybook-reina-current-homework",
  title: "Reina Current Homework",
  theme: {
    ...theme,
    background: {
      type: "image",
      value: fullExperienceArt.background,
    },
    palette: {
      ...theme.palette,
      completed: "#1f8f68",
      available: "#7c3aed",
      current: "#f59e0b",
      panel: "rgba(15, 23, 42, 0.84)",
    },
  },
  layout: {
    preset: "horizontal-adventure-spine",
    companionSlot: "right",
    routeChoiceBehavior: "exclusive",
  },
  plannerRationale: {
    agencyDesign:
      "The planner separates silent-letter spelling production from high-frequency recognition before offering a Mystery recovery moment.",
    evidenceDesign:
      "Word Radar keeps the planner-authored modes intact, Spell Check verifies spelling, and Quest/Boss stay locked for later evidence.",
    layoutChoice:
      "The renderer preserves the May 24 node order and paints it into the horizontal adventure skin without adding learning nodes.",
  },
  companion: {
    id: "matilda",
    name: "Matilda",
  },
  labelForNode: reinaCurrentHomeworkLabel,
  thumbnailForNode: reinaCurrentHomeworkThumbnail,
});

function withoutPosition(node: AdventureBoardJson["nodes"][number]): AdventureBoardJson["nodes"][number] {
  const { position: _position, ...rest } = node;
  return rest;
}

export const grokFullExperienceBoard: AdventureBoardJson = {
  ...denseSpellingBoard,
  boardId: "storybook-grok-full-experience",
  planId: "design-bench-grok-full",
  title: "Silent Letter Expedition",
  theme: {
    ...theme,
    background: {
      type: "image",
      value: fullExperienceArt.background,
    },
    palette: {
      ...theme.palette,
      completed: "#1f8f68",
      available: "#7c3aed",
      current: "#f59e0b",
      panel: "rgba(15, 23, 42, 0.84)",
    },
  },
  nodes: denseSpellingBoard.nodes.map((node) => ({
    ...withoutPosition(node),
    thumbnailUrl: denseThumbnailFor(node),
  })),
  choiceSets: denseSpellingBoard.choiceSets?.map((choiceSet) => ({
    ...choiceSet,
    options: choiceSet.options.map((option) => ({
      ...option,
      thumbnailUrl:
        option.id === "story-challenge"
          ? fullExperienceArt.storyChoice
          : option.id === "speed-challenge"
            ? fullExperienceArt.speedChoice
            : option.thumbnailUrl,
    })),
  })),
};

export type AdventureBoardBranchDensity = "none" | "one" | "two";
export type AdventureBoardChosenRoute = "none" | "upper" | "lower";

export type AdventureBoardFixtureOptions = {
  routeChoiceBehavior?: NonNullable<AdventureBoardJson["layout"]>["routeChoiceBehavior"];
  branchDensity?: AdventureBoardBranchDensity;
  chosenRoute?: AdventureBoardChosenRoute;
  missingThumbnails?: boolean;
  questUnlocked?: boolean;
  longLabels?: boolean;
};

export function buildGrokFullExperienceBoard(
  opts: AdventureBoardFixtureOptions = {},
): AdventureBoardJson {
  const behavior = opts.routeChoiceBehavior ?? grokFullExperienceBoard.layout?.routeChoiceBehavior ?? "exclusive";
  const branchDensity = opts.branchDensity ?? "one";
  const chosenRoute = opts.chosenRoute ?? "none";
  const includeUpper = branchDensity === "one" || branchDensity === "two";
  const includeLower = branchDensity === "two";
  const routeEdgeIds = new Set([
    ...(includeUpper ? ["e5", "e6", "e7"] : []),
    ...(includeLower ? ["e10", "e11", "e12"] : []),
  ]);
  const choiceNodeId = branchDensity === "none" ? "mystery" : "choice";

  const lowerNodes: AdventureBoardJson["nodes"] = includeLower
    ? [
        {
          id: "choice-lab",
          kind: "activity",
          activityId: "word-radar",
          label: opts.longLabels ? "Audio-first letter slots without word flash" : "Audio Slots",
          icon: "radar",
          thumbnailUrl: opts.missingThumbnails ? undefined : fullExperienceArt.wordRadar,
          layout: {
            role: "evidence-route",
            lane: "lower",
            order: 1,
            routeGroupId: "after-verify-route",
            selected: chosenRoute === "lower",
          },
          state: "available",
          evidenceRole: "baseline",
        },
        {
          id: "speed-probe",
          kind: "activity",
          activityId: "pronunciation",
          label: opts.longLabels ? "Quick read-aloud pressure check" : "Quick Read",
          icon: "zap",
          thumbnailUrl: opts.missingThumbnails ? undefined : fullExperienceArt.pronunciation,
          layout: {
            role: "evidence-route",
            lane: "lower",
            order: 2,
            routeGroupId: "after-verify-route",
            selected: chosenRoute === "lower",
          },
          state: "available",
          evidenceRole: "baseline",
        },
      ]
    : [];

  const baseNodes = grokFullExperienceBoard.nodes
    .filter((node) => {
      if (node.id === "choice") return branchDensity !== "none";
      if (node.id === "wr-light" || node.id === "hf-read") return includeUpper;
      return true;
    })
    .map((node) => {
      const next = {
        ...node,
        thumbnailUrl: opts.missingThumbnails ? undefined : node.thumbnailUrl,
        layout: node.layout?.routeGroupId
          ? {
              ...node.layout,
              selected: chosenRoute === "upper",
            }
          : node.layout,
      };
      if (opts.longLabels && node.id === "spell-conflict") {
        return { ...next, label: "Verify tricky silent-letter spelling pattern" };
      }
      if (node.id === "quest" && opts.questUnlocked) {
        return { ...next, state: "available" as const, lock: undefined };
      }
      if (node.id === "boss" && opts.questUnlocked) {
        return { ...next, state: "preview" as const };
      }
      return next;
    });

  return {
    ...grokFullExperienceBoard,
    layout: {
      preset: "horizontal-adventure-spine",
      companionSlot: "right",
      routeChoiceBehavior: behavior,
    },
    nodes: [...baseNodes, ...lowerNodes],
    edges: [
      ...grokFullExperienceBoard.edges
        .filter((edge) => {
          if (["e4", "e8"].includes(edge.id)) return branchDensity !== "none";
          if (["e5", "e6", "e7"].includes(edge.id)) return routeEdgeIds.has(edge.id);
          return true;
        })
        .map((edge) =>
          edge.id === "e8"
            ? { ...edge, from: choiceNodeId }
            : edge,
        ),
      ...(includeLower
        ? [
            { id: "e10", from: "spell-conflict", to: "choice-lab", state: "available" as const },
            { id: "e11", from: "choice-lab", to: "speed-probe", state: "available" as const },
            { id: "e12", from: "speed-probe", to: "choice", state: "locked" as const, style: "dashed" as const },
          ]
        : []),
      ...(branchDensity === "none"
        ? [{ id: "e-mystery-quest", from: "mystery", to: "quest", state: "preview" as const, style: "dashed" as const }]
        : []),
    ],
  };
}
