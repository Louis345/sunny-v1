import type { LearningProfile } from "../context/schemas/learningProfile";
import type { CompanionConfig } from "./companionTypes";
import type { TamagotchiState } from "./vrrTypes";

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
  /**
   * Spoken label for TTS (e.g. "Ee-lah") from children.config.json `childProfiles`.
   * Falls back to a capitalized childId when unset.
   */
  ttsName: string;
  /**
   * Optional same-origin path for the child picker card image only.
   * From children.config.json `childProfiles`; not the VRM.
   */
  avatarImagePath?: string | null;
  /** Adventure progression level (1+), drives theme unlocks. */
  level: number;
  interests: ChildProfileInterests;
  ui: ChildProfileUI;
  unlockedThemes: string[];
  attentionWindow_ms: number;
  /** Body of `src/context/{childId}/{childId}_context.md` when present; else empty string. */
  childContext: string;
  /** VRM companion dials and asset URL (Phase 0.5). */
  companion: CompanionConfig;
  /** Pending homework week from `learning_profile.json` (adventure map uses nodes when present). */
  pendingHomework?: LearningProfile["pendingHomework"];
  /** Optional companion care meters for map / VRR. */
  tamagotchi?: TamagotchiState;
}
