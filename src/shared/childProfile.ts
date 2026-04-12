import type { CompanionConfig } from "./companionTypes";

/**
 * API-facing child profile for games, themes, and adventure map (TASK-004).
 */
export interface ChildProfileInterests {
  /** Short tags used for generative prompts (e.g. designer theme). */
  tags: string[];
}

export interface ChildProfileUI {
  accentColor: string;
}

export interface ChildProfile {
  childId: string;
  /** Adventure progression level (1+), drives theme unlocks. */
  level: number;
  interests: ChildProfileInterests;
  ui: ChildProfileUI;
  unlockedThemes: string[];
  attentionWindow_ms: number;
  /** VRM companion dials and asset URL (Phase 0.5). */
  companion: CompanionConfig;
}
