import type { NodeConfig } from "./adventureTypes";

/** User-facing labels (internal `type` stays canonical, e.g. `karaoke`). */
export const NODE_DISPLAY_LABELS: Record<string, string> = {
  mystery: "Mystery",
  pronunciation: "Pronunciation",
  karaoke: "Story",
  "word-radar": "Word Radar",
  "spell-check": "Spell Check",
  wordle: "Wordle",
  "word-builder": "Word Builder",
  quest: "Quest",
  boss: "Boss",
  dopamine: "Game",
};

export type NodeContext = {
  childId: string;
  childName?: string;
  companion: string;
  companionName?: string;
  /** `false` = live child session; `free` / `true` / `go-live` = iframe query (see `_contract.js`). */
  previewParam: string;
  sessionId?: string;
  vrmUrl?: string;
  companionMuted?: boolean;
};

/** Homework / map nodes may use types not in `NodeType` (cast at map boundary). */
export type RoutableNodeConfig = Pick<
  NodeConfig,
  | "id"
  | "words"
  | "wordRadarItems"
  | "difficulty"
  | "gameFile"
  | "date"
  | "storyText"
> & { type: string };

export function buildNodeUrlSearchParams(
  node: Pick<RoutableNodeConfig, "id" | "words"> & { difficulty?: number },
  ctx: NodeContext,
): URLSearchParams {
  const params: Record<string, string> = {
    words: (node.words ?? []).join(","),
    childId: ctx.childId,
    childName: ctx.childName ?? "",
    difficulty: String(node.difficulty ?? 2),
    nodeId: node.id,
    companion: ctx.companion,
    companionName: ctx.companionName ?? "",
    preview: ctx.previewParam,
    companionVrmUrl: ctx.vrmUrl ?? "",
    companionMuted: String(ctx.companionMuted ?? false),
  };
  if (ctx.sessionId) params.sessionId = ctx.sessionId;
  return new URLSearchParams(params);
}

function buildParams(node: RoutableNodeConfig, ctx: NodeContext): string {
  return buildNodeUrlSearchParams(node, ctx).toString();
}

export type NodeHandler = {
  canvasMessage?: (node: RoutableNodeConfig) => Record<string, unknown>;
  /** Return empty string when URL cannot be built (quest/boss missing file). */
  getUrl?: (node: RoutableNodeConfig, ctx: NodeContext) => string;
};

export const NODE_REGISTRY: Record<string, NodeHandler> = {
  pronunciation: {
    canvasMessage: (node) => ({
      type: "pronunciation",
      pronunciationWords: node.words ?? [],
    }),
  },
  karaoke: {
    canvasMessage: (node) => ({
      type: "karaoke",
      storyText: node.storyText ?? "",
      words: node.words ?? [],
    }),
  },
  "word-radar": {
    canvasMessage: (node) => ({
      type: "word_radar",
      wordRadarItems: node.wordRadarItems ?? [],
    }),
  },
  "word-builder": {
    getUrl: (node, ctx) => `/games/word-builder.html?${buildParams(node, ctx)}`,
  },
  "spell-check": {
    getUrl: (node, ctx) => `/games/spell-check.html?${buildParams(node, ctx)}`,
  },
  wordle: {
    getUrl: (node, ctx) => `/games/wordle.html?${buildParams(node, ctx)}`,
  },
  "wheel-of-fortune": {
    getUrl: (node, ctx) => `/games/WheelOfFortune.html?${buildParams(node, ctx)}`,
  },
  mystery: {
    getUrl: (node, ctx) => `/games/WheelOfFortune.html?${buildParams(node, ctx)}`,
  },
  quest: {
    getUrl: (node, ctx) => {
      if (!node.date || !node.gameFile) return "";
      return `/homework/${ctx.childId}/${node.date}/${node.gameFile}?${buildParams(node, ctx)}`;
    },
  },
  boss: {
    getUrl: (node, ctx) => {
      if (!node.date || !node.gameFile) return "";
      return `/homework/${ctx.childId}/${node.date}/${node.gameFile}?${buildParams(node, ctx)}`;
    },
  },
  dopamine: {
    getUrl: (node, ctx) =>
      `/games/${node.gameFile ?? "space-invaders.html"}?${buildParams(node, ctx)}`,
  },
};

/** Keys registered for homework/map launch (tests). */
export const NODE_REGISTRY_KEYS = Object.keys(NODE_REGISTRY) as string[];
