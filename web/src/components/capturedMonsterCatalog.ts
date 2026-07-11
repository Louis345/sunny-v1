import type {
  CreatureLifeAnchors,
  CreatureLifeProfile,
} from "./creatureLifeProfiles";

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

export type CapturedMonsterLifeProfileOverrides = {
  [Key in Exclude<keyof CreatureLifeProfile, "reactionAmp">]?: Partial<
    CreatureLifeProfile[Key]
  >;
} & { reactionAmp?: number };

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
  personalityTags: string[];
  lifeStates: CapturedMonsterLifeState[];
  lifeAnchors?: CreatureLifeAnchors;
  lifeProfile?: CapturedMonsterLifeProfileOverrides;
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
  personalityTags: ["sunny", "gentle", "curious"],
  lifeStates: ["idle", "curious", "happy", "sleep", "celebrate"],
  lifeAnchors: {
    eyeLeft: { xPct: 39, yPct: 34 },
    eyeRight: { xPct: 61, yPct: 34 },
    eyeWidthPct: 13,
    eyeHeightPct: 11,
    lidColor: "#d9b8ea",
  },
  sprite: {
    mode: "css-png",
    futureAtlasReady: true,
  },
};

export const capturedMonsterCatalog = [LUMIPUFF_MONSTER] as const;
