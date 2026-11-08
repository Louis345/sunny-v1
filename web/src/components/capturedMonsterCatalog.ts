import type { RewardRarity } from "../../../src/shared/rewardCatalog";
import type { SparkOrbSeason, SparkOrbTimeOfDay } from "./sparkOrbScenes";
export type CapturedMonsterLifeState =
  | "idle"
  | "curious"
  | "happy"
  | "sleep"
  | "celebrate";

/** The economy's one rarity ladder (chests, rewards, creatures). */
export type CapturedMonsterRarity = RewardRarity;
/** A stop's chest kind; boss stops are legendary, quest stops epic, checks rare. */
export type CreatureStopKind = "common" | "rare" | "epic" | "legendary" | "mystery";

/** When a species is out, like time-of-day and seasonal Pokemon. Empty or absent means any. */
export interface CreatureHabitat {
  timesOfDay?: SparkOrbTimeOfDay[];
  seasons?: SparkOrbSeason[];
  stops?: CreatureStopKind[];
  /** One line she reads in her collection: where to look. */
  hint: string;
}
export type CapturedMonsterCapturePersonality =
  | "playful"
  | "shy"
  | "brave"
  | "sleepy";

export interface CapturedMonsterConfig {
  id: string;
  /** Position in her creature dex (#001, #002 ...). */
  dexNumber: number;
  habitat: CreatureHabitat;
  /** Placeholder look until each species has its own art: Lumipuff's picture recoloured. */
  placeholderHue?: number;
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
  dexNumber: 1,
  habitat: { hint: "Anywhere, any time" },
  speciesName: "Lumipuff",
  defaultNickname: "Lumi",
  rarity: "common",
  statLabel: "SPARK",
  statValue: 214,
  imageSrc: "/encounters/spark-orb/lumipuff.png",
  collectionTitle: "Spark Garden friend",
  capturePersonality: "playful",
  personalityTags: ["sunny", "gentle", "curious"],
  lifeStates: ["idle", "curious", "happy", "sleep", "celebrate"],
  sprite: {
    mode: "css-png",
    futureAtlasReady: true,
  },
};

function species(
  config: Pick<
    CapturedMonsterConfig,
    | "id"
    | "dexNumber"
    | "speciesName"
    | "defaultNickname"
    | "rarity"
    | "statLabel"
    | "statValue"
    | "collectionTitle"
    | "capturePersonality"
    | "personalityTags"
    | "habitat"
    | "placeholderHue"
  >,
): CapturedMonsterConfig {
  return {
    ...config,
    imageSrc: LUMIPUFF_MONSTER.imageSrc,
    lifeStates: LUMIPUFF_MONSTER.lifeStates,
    sprite: { mode: "css-png", futureAtlasReady: true },
  };
}

/**
 * Every creature she can find (draft, owner to tune). She sees all of them in her dex, unknown ones as ???
 * with where to look, so each one is a goal. New species are one more entry here. Rarity and habitat set
 * how often and when they appear; art is a recoloured Lumipuff until each species gets its own.
 */
export const CREATURE_CATALOG: readonly CapturedMonsterConfig[] = [
  LUMIPUFF_MONSTER,
  species({
    id: "dewbun", dexNumber: 2, speciesName: "Dewbun", defaultNickname: "Dew", rarity: "common",
    statLabel: "BLOOM", statValue: 168, collectionTitle: "Morning meadow friend", capturePersonality: "shy",
    personalityTags: ["fresh", "quiet"], placeholderHue: 110,
    habitat: { timesOfDay: ["sunrise", "day"], seasons: ["spring", "summer"], hint: "Spring and summer days" },
  }),
  species({
    id: "glowmoth", dexNumber: 3, speciesName: "Glowmoth", defaultNickname: "Glow", rarity: "rare",
    statLabel: "GLOW", statValue: 243, collectionTitle: "Night garden friend", capturePersonality: "sleepy",
    personalityTags: ["dreamy", "soft"], placeholderHue: 200,
    habitat: { timesOfDay: ["twilight", "night"], hint: "Only after sunset" },
  }),
  species({
    id: "emberleaf", dexNumber: 4, speciesName: "Emberleaf", defaultNickname: "Ember", rarity: "rare",
    statLabel: "CRUNCH", statValue: 231, collectionTitle: "Autumn path friend", capturePersonality: "playful",
    personalityTags: ["bouncy", "warm"], placeholderHue: 320,
    habitat: { seasons: ["autumn", "halloween"], hint: "Autumn, when the leaves fall" },
  }),
  species({
    id: "frostkit", dexNumber: 5, speciesName: "Frostkit", defaultNickname: "Frosty", rarity: "epic",
    statLabel: "CHILL", statValue: 302, collectionTitle: "Snowfield friend", capturePersonality: "brave",
    personalityTags: ["bold", "sparkly"], placeholderHue: 165,
    habitat: { seasons: ["winter", "holiday"], hint: "Winter snow only" },
  }),
  species({
    id: "pumpkit", dexNumber: 6, speciesName: "Pumpkit", defaultNickname: "Pumpy", rarity: "epic",
    statLabel: "SPOOK", statValue: 288, collectionTitle: "Halloween friend", capturePersonality: "playful",
    personalityTags: ["mischief", "giggly"], placeholderHue: 300,
    habitat: { seasons: ["halloween"], hint: "Halloween week only" },
  }),
  species({
    id: "starwhal", dexNumber: 7, speciesName: "Starwhal", defaultNickname: "Nova", rarity: "legendary",
    statLabel: "COSMOS", statValue: 512, collectionTitle: "Legend of the night sky", capturePersonality: "brave",
    personalityTags: ["ancient", "kind"], placeholderHue: 240,
    habitat: { timesOfDay: ["night"], stops: ["legendary"], hint: "Night Boss stops only" },
  }),
];

export const capturedMonsterCatalog = CREATURE_CATALOG;
