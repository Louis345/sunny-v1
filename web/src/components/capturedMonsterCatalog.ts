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
export type CapturedMonsterBlinkMode = "css-overlay" | "atlas-frame";
export type CapturedMonsterSoundVoice = "soft-chime";
export type CapturedMonsterSoundCue =
  | "idle"
  | "noticed_orb"
  | "ready"
  | "happy"
  | "sleepy"
  | "captured";

export interface CapturedMonsterEyeMask {
  top: string;
  left: string;
  width: string;
  height: string;
}

export interface CapturedMonsterExpressionConfig {
  blink: {
    mode: CapturedMonsterBlinkMode;
    cadenceMs: readonly [number, number];
    eyeMask: CapturedMonsterEyeMask;
    eyelidColor: string;
    opacity: number;
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
      mode: "css-overlay",
      cadenceMs: [3200, 6200],
      eyeMask: {
        top: "30%",
        left: "24%",
        width: "52%",
        height: "16%",
      },
      eyelidColor: "rgba(105, 74, 137, 0.5)",
      opacity: 0.82,
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
