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
  words: string[];
  difficulty: 1 | 2 | 3;
  timeLimit_ms: number;
  theme: string;
  thumbnailUrl?: string;
  isCastle: boolean;
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
}

export interface SessionThemeAmbient {
  type: string;
  count: number;
  speed: number;
  color: string;
}

export interface SessionTheme {
  name: string;
  palette: SessionThemePalette;
  ambient: SessionThemeAmbient;
  nodeStyle: string;
  pathStyle: string;
  castleVariant: string;
  backgroundUrl?: string;
  castleUrl?: string;
  nodeThumbnails?: Record<string, string>;
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
