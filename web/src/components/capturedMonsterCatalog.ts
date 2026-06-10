export type CapturedMonsterLifeState =
  | "idle"
  | "curious"
  | "happy"
  | "sleep"
  | "celebrate";

export type CapturedMonsterRarity = "common" | "uncommon" | "rare";
export type CapturedMonsterCapturePersonality =
  | "playful"
  | "shy"
  | "brave"
  | "sleepy";
export type CapturedMonsterBlinkMode = "frame-swap" | "sprite-atlas";
export type CapturedMonsterSoundVoice = "soft-chime";
export type CapturedMonsterSoundCue =
  | "idle"
  | "noticed_orb"
  | "ready"
  | "happy"
  | "sleepy"
  | "captured";

export interface CapturedMonsterBlinkFrames {
  open: string;
  half?: string;
  closed?: string;
}

export interface CapturedMonsterBlinkTiming {
  durationMs: number;
  minIntervalMs: number;
  maxIntervalMs: number;
  doubleBlinkChance: number;
}

export interface CapturedMonsterExpressionConfig {
  blink: {
    mode: CapturedMonsterBlinkMode;
    frames: CapturedMonsterBlinkFrames;
    timing: CapturedMonsterBlinkTiming;
  };
  soundProfile: {
    voice: CapturedMonsterSoundVoice;
    cues: CapturedMonsterSoundCue[];
  };
}

export interface CapturedMonsterConfig {
  id: string;
  speciesName: string;
  defaultNickname: string;
  rarity: CapturedMonsterRarity;
  statLabel: string;
  statValue: number;
  imageSrc: string;
  collectionTitle: string;
  capturePersonality: CapturedMonsterCapturePersonality;
  expression: CapturedMonsterExpressionConfig;
  personalityTags: string[];
  lifeStates: CapturedMonsterLifeState[];
  sprite: {
    mode: "css-png";
    futureAtlasReady: boolean;
    atlasSrc?: string;
    frameWidth?: number;
    frameHeight?: number;
  };
}

export const LUMIPUFF_MONSTER: CapturedMonsterConfig = {
  id: "lumipuff",
  speciesName: "Lumipuff",
  defaultNickname: "Lumi",
  rarity: "uncommon",
  statLabel: "SPARK",
  statValue: 214,
  imageSrc: "/encounters/spark-orb/lumipuff.png",
  collectionTitle: "Spark Garden friend",
  capturePersonality: "playful",
  expression: {
    blink: {
      mode: "frame-swap",
      frames: {
        open: "/encounters/spark-orb/lumipuff.png",
        half: "/encounters/spark-orb/lumipuff-blink-half.png",
        closed: "/encounters/spark-orb/lumipuff-blink-closed.png",
      },
      timing: {
        durationMs: 140,
        minIntervalMs: 3000,
        maxIntervalMs: 7000,
        doubleBlinkChance: 0.12,
      },
    },
    soundProfile: {
      voice: "soft-chime",
      cues: ["idle", "noticed_orb", "ready", "happy", "sleepy", "captured"],
    },
  },
  personalityTags: ["sunny", "gentle", "curious"],
  lifeStates: ["idle", "curious", "happy", "sleep", "celebrate"],
  sprite: {
    mode: "css-png",
    futureAtlasReady: true,
  },
};

export const capturedMonsterCatalog = [LUMIPUFF_MONSTER] as const;
