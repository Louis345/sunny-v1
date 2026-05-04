import type { LearningProfile } from "../context/schemas/learningProfile";
import type { CompanionCareView } from "./companionCareTypes";
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

export interface ChildProfileWordRadar {
  showTimer: boolean;
  timerSeconds: number;
  showKeyboard: boolean;
  personalBests: Record<string, number>;
  inputMode: "whole-word" | "letter-by-letter" | "keyboard";
}

export interface GameConfig {
  unlocked: boolean;
  sessionCount: number;
  lastAccuracy: number | null;
}

export interface WordRadarGameConfig extends GameConfig {
  inputMode: "whole-word" | "letter-by-letter" | "keyboard";
  speakStyle: "option-a" | "option-b";
  keyboardStyle: "option-b" | "option-c";
  showTimer: boolean;
  timerSeconds?: number;
  personalBestMetric: "speed" | "accuracy";
  /** Caps homework spelling list per node when no imminent test; defaults with spell-check maxWords. */
  maxWords?: number;
}

export interface SpellCheckGameConfig extends GameConfig {
  difficulty: 1 | 2 | 3;
  knownMode: "skip" | "quick";
  maxWords: number;
}

export interface KaraokeGameConfig extends GameConfig {
  wordsPerLine: number;
  fontSize: number;
  skipWordEnabled: boolean;
}

export interface ClockGameConfig extends GameConfig {}

export interface CoinGameConfig extends GameConfig {}

export interface BossGameConfig extends GameConfig {
  sessionsRequired: number;
  dataThresholdMet: boolean;
  generatedGamePath: string | null;
  generationModel: "sonnet" | "opus" | null;
}

export interface QuestGameConfig extends GameConfig {
  sessionsRequired: number;
  dataThresholdMet: boolean;
  generatedGamePath: string | null;
  generationModel: "sonnet";
}

export interface ChildProfileGames {
  "word-radar"?: WordRadarGameConfig;
  "spell-check"?: SpellCheckGameConfig;
  "karaoke-reading"?: KaraokeGameConfig;
  "clock-game"?: ClockGameConfig;
  "coin-counter"?: CoinGameConfig;
  quest?: QuestGameConfig;
  boss?: BossGameConfig;
  [key: string]:
    | GameConfig
    | WordRadarGameConfig
    | SpellCheckGameConfig
    | KaraokeGameConfig
    | ClockGameConfig
    | CoinGameConfig
    | QuestGameConfig
    | BossGameConfig
    | undefined;
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
  xp?: number;
  /** Persisted companion currency for shop HUD and care summaries. */
  companionCurrency?: number;
  interests: ChildProfileInterests;
  dyslexiaMode?: boolean;
  companionColor?: string;
  dueWords?: string[];
  sm2Stats?: Record<
    string,
    {
      interval: number;
      easeFactor: number;
      dueDate: string;
      domain: "spelling" | "reading" | "math";
    }
  >;
  currentDifficulty?: number;
  masteryGating?: {
    clockStep: number;
    coinStep: number;
    readingLevel: number;
  };
  mathRotation?: string[];
  retrievalPractice?: {
    nextScaffoldWords: string[];
  };
  games?: ChildProfileGames;
  ui: ChildProfileUI;
  unlockedThemes: string[];
  attentionWindow_ms: number;
  /** Body of `src/context/{childId}/{childId}_context.md` when present; else empty string. */
  childContext: string;
  /** VRM companion dials and asset URL (Phase 0.5). */
  companion: CompanionConfig;
  /**
   * Markdown companion personality + growth tier for the current level, from
   * `CompanionRegistry` (see `buildProfile`). Empty when preset id is unknown to the registry.
   */
  companionContext: string;
  /** Pending homework week from `learning_profile.json` (adventure map uses nodes when present). */
  pendingHomework?: LearningProfile["pendingHomework"];
  /** Optional companion care meters for map / VRR. */
  tamagotchi?: TamagotchiState;
  /** Named companion source-of-truth care view; legacy tamagotchi/currency mirror this. */
  companionCare?: CompanionCareView;
  /** Word Radar game settings + server-derived bests from word_bank. */
  wordRadar?: ChildProfileWordRadar;
}
