/**
 * Adventure map shared types (TASK-003). Interfaces only — no runtime logic here.
 */

export type NodeType =
  | "mystery"
  | "word-builder"
  | "bubble-pop"
  | "fish-flanker"
  | "target-blaster"
  | "hero-shield"
  | "karaoke"
  | "pronunciation"
  | "word-radar"
  | "clock-game"
  | "coin-counter"
  | "spell-check"
  | "wordle"
  | "quest"
  | "riddle"
  | "space-invaders"
  | "asteroid"
  | "space-frogger"
  | "boss"
  | "wheel-of-fortune";

export interface NodeConfig {
  id: string;
  type: NodeType;
  isLocked: boolean;
  isCompleted: boolean;
  isGoal: boolean;
  difficulty: 1 | 2 | 3;
  thumbnailUrl?: string;
  /** Grok / designer prompt for on-demand thumbnails (homework map). */
  thumbnailPrompt?: string;
  /** Karaoke passage when `type === "karaoke"`. */
  words?: string[];
  /** Word Radar drills when `type === "word-radar"`. */
  wordRadarItems?: Array<{
    display: string;
    acceptedResponses: string[];
    hint?: string;
    label?: string;
  }>;
  /** Homework node metadata (quest/boss routing). */
  gameFile?: string;
  gameHtmlPath?: string;
  generationModel?: "sonnet" | "opus";
  storyFile?: string;
  storyText?: string;
  storyTitle?: string;
  storyImagePrompt?: string;
  date?: string;
  /** Optional node theme label (client / diag). */
  theme?: string;
  /** Child-profile-derived activity config for attention screening/intervention nodes. */
  attentionConfig?: unknown;
  isCastle?: boolean;
  /** Curtain / accent override for transitions (optional). */
  accentColor?: string;
}

export type NodeRatingLike = "like" | "dislike";

export interface NodeRating {
  childId: string;
  sessionDate: string;
  nodeType: NodeType;
  word: string;
  theme: string;
  rating: NodeRatingLike;
  completionTime_ms: number;
  accuracy: number;
  abandonedEarly: boolean;
}

export interface NodeResult {
  nodeId: string;
  completed: boolean;
  accuracy: number;
  timeSpent_ms: number;
  wordsAttempted: number;
  activityId?: string;
  purpose?: string;
  vitalSigns?: Record<string, unknown>;
  /** Targets answered incorrectly (e.g. Word Radar) — primes next companion / map node. */
  missedWords?: string[];
  /** Targets answered correctly — optional companion context. */
  correctWords?: string[];
}

export interface SessionThemePalette {
  sky: string;
  ground: string;
  accent: string;
  particle: string;
  glow: string;
  /** Optional reading / karaoke card fill; client falls back if absent. */
  cardBackground?: string;
}

export interface SessionThemeAmbient {
  type: string;
  count: number;
  speed: number;
  color: string;
}

/** Normalized 0–1 coordinates on the map container; used for arc-length node layout. */
export interface MapWaypoint {
  x: number;
  y: number;
}

export type MapPathPresetName =
  | "rising-curve"
  | "zigzag-climb"
  | "gentle-s-curve"
  | "stepping-stones";

export interface SessionTheme {
  name: string;
  palette: SessionThemePalette;
  ambient: SessionThemeAmbient;
  nodeStyle: string;
  pathStyle: string;
  castleVariant: string;
  /** Where this theme came from (diag bundle / generator); optional for wire payloads. */
  source?: "saved" | "palette" | "generated";
  backgroundUrl?: string;
  /** Grok castle asset; null if generation failed or no API key. */
  castleUrl?: string | null;
  /** Grok thumbnails keyed by node type; null per key when that asset failed. */
  nodeThumbnails?: Record<string, string | null>;
  /** Optional path polyline in normalized space; nodes spaced by arc length. */
  mapWaypoints?: ReadonlyArray<MapWaypoint>;
  /** Named map layout preset; ignored when `mapWaypoints` has valid custom points. */
  mapPathPreset?: MapPathPresetName;
}

export interface MapState {
  childId: string;
  sessionDate: string;
  nodes: NodeConfig[];
  currentNodeIndex: number;
  completedNodes: string[];
  theme: SessionTheme;
  xp: number;
  level: number;
}

/** Canonical arm ordering for bandit / registry (TASK-005). */
export const ALL_NODE_TYPES: readonly NodeType[] = [
  "mystery",
  "word-builder",
  "bubble-pop",
  "fish-flanker",
  "target-blaster",
  "hero-shield",
  "karaoke",
  "word-radar",
  "clock-game",
  "coin-counter",
  "spell-check",
  "wordle",
  "riddle",
  "space-invaders",
  "asteroid",
  "space-frogger",
  "boss",
  "wheel-of-fortune",
] as const;
