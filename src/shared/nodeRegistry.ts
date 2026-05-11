import type { NodeConfig } from "./adventureTypes";

/** User-facing labels (internal `type` stays canonical, e.g. `karaoke`). */
export const NODE_DISPLAY_LABELS: Record<string, string> = {
  mystery: "Mystery",
  pronunciation: "Pronunciation",
  karaoke: "Story",
  "bubble-pop": "Focus Check",
  "cpt-low-reward": "Quiet Focus",
  "fish-flanker": "Fish Flanker",
  "target-blaster": "Target Blaster",
  "hero-shield": "Hero Shield",
  "word-radar": "Word Radar",
  "visual-explainer": "Visual Explainer",
  "concept-check": "Concept Check",
  "letter-rush": "Letter Rush",
  "spell-check": "Spell Check",
  wordle: "Wordle",
  "word-builder": "Word Builder",
  quest: "⚔️ Quest",
  boss: "👹 Boss",
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
  /** Spell-check quest path: adds `isQuest=true` to iframe URL / GAME_PARAMS. */
  isQuest?: boolean;
  dyslexiaMode?: boolean;
  /** Persisted shop/HUD balance from learning_profile — iframe games may seed UI (e.g. WoF child score). */
  companionCurrency?: number;
  /** Visual learner artifact preview flow: normal question pause or parent playthrough. */
  visualLearnerFlowMode?: "pause-for-question" | "playthrough";
};

/** Homework / map nodes may use types not in `NodeType` (cast at map boundary). */
export type RoutableNodeConfig = Pick<
  NodeConfig,
  | "id"
  | "words"
  | "wordRadarItems"
  | "difficulty"
  | "gameFile"
  | "gameHtmlPath"
  | "generationModel"
  | "date"
  | "storyText"
  | "storyTitle"
  | "storyImagePrompt"
  | "attentionConfig"
  | "activityConfigPath"
> & { type: string };

export function buildNodeUrlSearchParams(
  node: Pick<RoutableNodeConfig, "id" | "words" | "attentionConfig"> & { difficulty?: number },
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
  if (ctx.isQuest === true) params.isQuest = "true";
  if (ctx.dyslexiaMode === true) params.dyslexiaMode = "true";
  if (node.attentionConfig != null) {
    params.attentionConfig = JSON.stringify(node.attentionConfig);
  }
  const cc = ctx.companionCurrency;
  params.companionCurrency =
    typeof cc === "number" && Number.isFinite(cc)
      ? String(Math.max(0, Math.floor(cc)))
      : "0";
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

const DEFAULT_VISUAL_LEARNER_ARTIFACT_ID = "centimeters-vs-inches-1778454253669";
const DEFAULT_VISUAL_LEARNER_ARTIFACT_URL =
  `/generated/openai-visual-probe/${DEFAULT_VISUAL_LEARNER_ARTIFACT_ID}/index.html`;
const DEFAULT_VISUAL_LEARNER_CONFIG_URL =
  `/generated/openai-visual-probe/${DEFAULT_VISUAL_LEARNER_ARTIFACT_ID}/artifact.config.json`;

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
      storyTitle: node.storyTitle,
      storyImagePrompt: node.storyImagePrompt,
    }),
  },
  "word-radar": {
    canvasMessage: (node) => ({
      type: "word_radar",
      wordRadarItems: node.wordRadarItems ?? [],
    }),
  },
  "concept-check": {
    getUrl: (node, ctx) => {
      const params = buildNodeUrlSearchParams(node, ctx);
      const config =
        node.activityConfigPath ||
        `/api/activity-config/${ctx.childId}/${node.date ?? "sample"}/concept-check.json`;
      params.set("config", config);
      return `/games/concept-check.html?${params.toString()}`;
    },
  },
  "letter-rush": {
    getUrl: (node, ctx) => {
      const params = buildNodeUrlSearchParams(node, ctx);
      const config =
        node.activityConfigPath ||
        `/api/activity-config/${ctx.childId}/${node.date ?? "sample"}/letter-rush.json`;
      params.set("config", config);
      return `/games/letter-rush.html?${params.toString()}`;
    },
  },
  "visual-explainer": {
    getUrl: (node, ctx) => {
      const params = buildNodeUrlSearchParams(node, ctx);
      const config = node.activityConfigPath || DEFAULT_VISUAL_LEARNER_CONFIG_URL;
      params.set("config", config);
      params.set(
        "chrome",
        ctx.previewParam === "free" || ctx.previewParam === "go-live"
          ? "parent"
          : "child",
      );
      if (ctx.visualLearnerFlowMode) {
        params.set("visualLearnerFlow", ctx.visualLearnerFlowMode);
      }
      return `${DEFAULT_VISUAL_LEARNER_ARTIFACT_URL}?${params.toString()}`;
    },
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
  "bubble-pop": {
    getUrl: (node, ctx) => `/games/attention-bubble-pop.html?${buildParams(node, ctx)}`,
  },
  "cpt-low-reward": {
    getUrl: (node, ctx) => `/games/attention-cpt-low-reward.html?${buildParams(node, ctx)}`,
  },
  "fish-flanker": {
    getUrl: (node, ctx) => `/games/attention-fish-flanker.html?${buildParams(node, ctx)}`,
  },
  "target-blaster": {
    getUrl: (node, ctx) => `/games/attention-target-blaster.html?${buildParams(node, ctx)}`,
  },
  "hero-shield": {
    getUrl: (node, ctx) => `/games/attention-hero-shield.html?${buildParams(node, ctx)}`,
  },
  mystery: {
    getUrl: (node, ctx) =>
      `/games/${node.gameFile ?? "space-invaders.html"}?${buildParams(node, ctx)}`,
  },
  quest: {
    getUrl: (node, ctx) => {
      if (node.gameFile) {
        return `/games/${node.gameFile}?${buildParams(node, ctx)}`;
      }
      // Static spelling placeholder — words come from node.words via buildParams.
      return `/games/quest.html?${buildParams(node, ctx)}`;
    },
  },
  boss: {
    getUrl: (node, ctx) => {
      if (node.gameHtmlPath) {
        const filename = node.gameHtmlPath.split("/").pop();
        if (filename) {
          return `/api/homework/game/${ctx.childId}/${encodeURIComponent(filename)}?${buildParams(node, ctx)}`;
        }
      }
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
