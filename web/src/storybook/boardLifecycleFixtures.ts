import type { AdventureBoardJson } from "../../../src/shared/adventureBoardJson";

const lifecycleTheme: AdventureBoardJson["theme"] = {
  background: {
    type: "image",
    value: "/generated/adventure-board-demo/silent-letter-world.jpeg",
  },
  palette: {
    path: "#fff8dc",
    completed: "#61d6a7",
    available: "#7058f4",
    locked: "#aeb7c2",
    current: "#ffb020",
    preview: "#d5dde5",
    text: "#fff8e8",
    panel: "rgba(18, 13, 45, 0.84)",
  },
};

const baseBoard = {
  schemaVersion: 1 as const,
  childId: "storybook-child",
  domain: "spelling" as const,
  theme: lifecycleTheme,
  layout: {
    preset: "horizontal-adventure-spine" as const,
    companionSlot: "right" as const,
    routeChoiceBehavior: "exclusive" as const,
  },
};

export const supportBoardPreview: AdventureBoardJson = {
  ...baseBoard,
  boardId: "storybook-lifecycle-support-board",
  planId: "storybook-lifecycle-support-plan",
  title: "Moonlit Word Trail",
  progress: {
    currentNodeId: "sound-lab",
    completedNodeIds: ["start"],
    activeChoiceSetId: "support-route-options",
  },
  nodes: [
    {
      id: "start",
      kind: "start",
      label: "Start",
      icon: "check",
      position: { x: 0.1, y: 0.82 },
      state: "completed",
    },
    {
      id: "sound-lab",
      kind: "activity",
      activityId: "pronunciation",
      label: "Sound Lab",
      thumbnailUrl: "/generated/adventure-board-demo/pronunciation.jpeg",
      position: { x: 0.29, y: 0.66 },
      state: "current",
      evidenceRole: "support",
    },
    {
      id: "ready-check",
      kind: "activity",
      activityId: "spell-check",
      label: "Ready Check",
      thumbnailUrl: "/generated/adventure-board-demo/spell-check.jpeg",
      position: { x: 0.41, y: 0.54 },
      state: "available",
      evidenceRole: "baseline",
    },
    {
      id: "choose-path",
      kind: "choice-gate",
      label: "Choose Path",
      icon: "choice",
      position: { x: 0.52, y: 0.47 },
      state: "available",
      evidenceRole: "preference",
      choiceSetId: "support-route-options",
      action: { type: "open-choice-set", payloadId: "support-route-options" },
    },
    {
      id: "word-radar-route",
      kind: "activity",
      activityId: "word-radar",
      label: "Word Radar",
      thumbnailUrl: "/generated/adventure-board-demo/word-radar.jpeg",
      position: { x: 0.65, y: 0.28 },
      state: "available",
      evidenceRole: "support",
    },
    {
      id: "story-spell-route",
      kind: "activity",
      activityId: "spell-check",
      label: "Story Spell",
      thumbnailUrl: "/generated/adventure-board-demo/pronunciation.jpeg",
      position: { x: 0.65, y: 0.68 },
      state: "available",
      evidenceRole: "support",
    },
    {
      id: "memory-check",
      kind: "activity",
      activityId: "spell-check",
      label: "Memory Check",
      thumbnailUrl: "/generated/adventure-board-demo/spell-check.jpeg",
      position: { x: 0.78, y: 0.48 },
      state: "available",
      evidenceRole: "baseline",
    },
    {
      id: "mystery",
      kind: "mystery",
      label: "Mystery",
      thumbnailUrl: "/generated/adventure-board-demo/mystery.jpeg",
      position: { x: 0.87, y: 0.27 },
      state: "available",
      evidenceRole: "preference",
    },
  ],
  edges: [
    { id: "support-start-sound", from: "start", to: "sound-lab", state: "completed" },
    { id: "support-sound-check", from: "sound-lab", to: "ready-check", state: "available" },
    { id: "support-check-choice", from: "ready-check", to: "choose-path", state: "available" },
    { id: "support-choice-radar", from: "choose-path", to: "word-radar-route", state: "available" },
    { id: "support-choice-story", from: "choose-path", to: "story-spell-route", state: "available" },
    { id: "support-radar-memory", from: "word-radar-route", to: "memory-check", state: "available" },
    { id: "support-story-memory", from: "story-spell-route", to: "memory-check", state: "available" },
    { id: "support-check-mystery", from: "memory-check", to: "mystery", state: "available", style: "glow" },
  ],
  choiceSets: [
    {
      id: "support-route-options",
      kind: "baseline-route",
      title: "Choose your path",
      options: [
        {
          id: "support-radar-choice",
          label: "Word Radar",
          description: "Listen closely and track the spelling pattern.",
          icon: "target",
          state: "available",
          nodeId: "word-radar-route",
          activityId: "word-radar",
        },
        {
          id: "support-story-choice",
          label: "Story Spell",
          description: "Use the same words inside a tiny story challenge.",
          icon: "book",
          state: "available",
          nodeId: "story-spell-route",
          activityId: "spell-check",
        },
      ],
    },
  ],
};

export const questBoardPreview: AdventureBoardJson = {
  ...baseBoard,
  boardId: "storybook-lifecycle-quest-board",
  planId: "storybook-lifecycle-quest-plan",
  title: "The Crystal Crossing",
  progress: {
    currentNodeId: "quest-warmup",
    completedNodeIds: ["quest-start"],
  },
  nodes: [
    {
      id: "quest-start",
      kind: "start",
      label: "Start",
      icon: "check",
      position: { x: 0.11, y: 0.79 },
      state: "completed",
    },
    {
      id: "quest-warmup",
      kind: "activity",
      activityId: "word-radar",
      label: "Quick Warmup",
      thumbnailUrl: "/generated/adventure-board-demo/word-radar.jpeg",
      position: { x: 0.34, y: 0.59 },
      state: "current",
      evidenceRole: "support",
    },
    {
      id: "quest-checkpoint",
      kind: "activity",
      activityId: "spell-check",
      label: "Ready Check",
      thumbnailUrl: "/generated/adventure-board-demo/spell-check.jpeg",
      position: { x: 0.59, y: 0.66 },
      state: "available",
      evidenceRole: "baseline",
    },
    {
      id: "quest",
      kind: "quest",
      activityId: "quest",
      label: "Crystal Quest",
      thumbnailUrl: "/generated/adventure-board-demo/quest.jpeg",
      position: { x: 0.82, y: 0.37 },
      state: "available",
      evidenceRole: "transfer",
    },
  ],
  edges: [
    { id: "quest-start-warmup", from: "quest-start", to: "quest-warmup", state: "completed" },
    { id: "quest-warmup-checkpoint", from: "quest-warmup", to: "quest-checkpoint", state: "available" },
    { id: "quest-checkpoint-quest", from: "quest-checkpoint", to: "quest", state: "available", style: "glow" },
  ],
};

export const bossBoardPreview: AdventureBoardJson = {
  ...baseBoard,
  boardId: "storybook-lifecycle-boss-board",
  planId: "storybook-lifecycle-boss-plan",
  title: "Citadel of Echoes",
  progress: {
    currentNodeId: "boss-checkpoint",
    completedNodeIds: ["boss-start"],
  },
  nodes: [
    {
      id: "boss-start",
      kind: "start",
      label: "Start",
      icon: "check",
      position: { x: 0.12, y: 0.76 },
      state: "completed",
    },
    {
      id: "boss-checkpoint",
      kind: "activity",
      activityId: "spell-check",
      label: "Final Check",
      thumbnailUrl: "/generated/adventure-board-demo/spell-check.jpeg",
      position: { x: 0.42, y: 0.64 },
      state: "current",
      evidenceRole: "baseline",
    },
    {
      id: "boss",
      kind: "boss",
      activityId: "boss",
      label: "The Echo Keeper",
      thumbnailUrl: "/generated/adventure-board-demo/boss.jpeg",
      position: { x: 0.76, y: 0.39 },
      state: "available",
      evidenceRole: "mastery",
    },
  ],
  edges: [
    { id: "boss-start-checkpoint", from: "boss-start", to: "boss-checkpoint", state: "completed" },
    { id: "boss-checkpoint-boss", from: "boss-checkpoint", to: "boss", state: "available", style: "glow" },
  ],
};

/**
 * The approved support board after its successor was published: identical
 * topology, forward-only state, the untaken route shown as not taken. It is
 * read-only history, never relocked, repurposed, or extended.
 */
const takenNodeIds = new Set(["start", "sound-lab", "ready-check", "choose-path", "word-radar-route", "memory-check", "mystery"]);

export const predecessorHistoryBoard: AdventureBoardJson = {
  ...supportBoardPreview,
  progress: {
    completedNodeIds: [...takenNodeIds],
  },
  nodes: supportBoardPreview.nodes.map((node) => takenNodeIds.has(node.id)
    ? { ...node, state: "completed" as const }
    : {
        ...node,
        state: "locked" as const,
        action: { type: "show-locked-reason" as const, payloadId: node.id },
        lock: { reason: "route-not-taken", label: "Not taken" },
      }),
  edges: supportBoardPreview.edges.map((edge) => ({
    ...edge,
    state: takenNodeIds.has(edge.from) && takenNodeIds.has(edge.to) ? "completed" as const : "locked" as const,
  })),
  choiceSets: supportBoardPreview.choiceSets?.map((set) => ({
    ...set,
    options: set.options.map((option) => ({
      ...option,
      state: option.nodeId && takenNodeIds.has(option.nodeId) ? "completed" as const : "locked" as const,
    })),
  })),
};

/** Each later board is a new instance linked to one predecessor and one evidence-cited Planner decision. */
export const boardLifecycleSequence: Array<{ board: AdventureBoardJson; predecessorBoardId: string | null; plannerDecisionId: string }> = [
  { board: supportBoardPreview, predecessorBoardId: null, plannerDecisionId: "storybook-decision:support" },
  { board: questBoardPreview, predecessorBoardId: supportBoardPreview.boardId, plannerDecisionId: "storybook-decision:quest" },
  { board: bossBoardPreview, predecessorBoardId: questBoardPreview.boardId, plannerDecisionId: "storybook-decision:boss" },
];
