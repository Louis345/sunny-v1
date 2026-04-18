/**
 * Adventure map shared types (TASK-003). Interfaces only — no runtime logic here.
 */

export type NodeType =
  | "word-builder"
  | "bubble-pop"
  | "karaoke"
  | "clock-game"
  | "coin-counter"
  | "spell-check"
  | "riddle"
  | "space-invaders"
  | "asteroid"
  | "space-frogger"
  | "boss";

export interface NodeConfig {
  id: string;
  type: NodeType;
  isLocked: boolean;
  isCompleted: boolean;
  isGoal: boolean;
  difficulty: 1 | 2 | 3;
  thumbnailUrl?: string;
  /** Karaoke passage when `type === "karaoke"`. */
  words?: string[];
  /** Optional node theme label (client / diag). */
  theme?: string;
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

export interface SessionTheme {
  name: string;
  palette: SessionThemePalette;
  ambient: SessionThemeAmbient;
  nodeStyle: string;
  pathStyle: string;
  castleVariant: string;
  backgroundUrl?: string;
  /** Grok castle asset; null if generation failed or no API key. */
  castleUrl?: string | null;
  /** Grok thumbnails keyed by node type; null per key when that asset failed. */
  nodeThumbnails?: Record<string, string | null>;
  /** Optional path polyline in normalized space; nodes spaced by arc length. */
  mapWaypoints?: ReadonlyArray<MapWaypoint>;
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
  "word-builder",
  "bubble-pop",
  "karaoke",
  "clock-game",
  "coin-counter",
  "spell-check",
  "riddle",
  "space-invaders",
  "asteroid",
  "space-frogger",
  "boss",
] as const;
