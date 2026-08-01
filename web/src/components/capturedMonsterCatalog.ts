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

export interface CapturedMonsterConfig {
  id: string;
  speciesName: string;
  defaultNickname: string;
  habitatName: string;
  rarity: CapturedMonsterRarity;
  statLabel: string;
  statValue: number;
  imageSrc: string;
  collectionTitle: string;
  capturePersonality: CapturedMonsterCapturePersonality;
  personalityTags: string[];
  lifeStates: CapturedMonsterLifeState[];
  presentation: {
    rendererKey: string;
  };
  captureOrb: {
    primary: `#${string}`;
    energy: `#${string}`;
    band: `#${string}`;
    emblem: "spark-star" | "spiral-leaf";
  };
  learningCatalog: {
    algorithmTargets: ["variable_reward", "activity_affinity"];
    evidenceClass: "engagement_only";
    masteryClaimAllowed: false;
    reuseDecision: "candidate" | "reuse" | "revise" | "retire";
    reuseReason: string;
  };
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
  habitatName: "Spark Garden",
  rarity: "uncommon",
  statLabel: "SPARK",
  statValue: 214,
  imageSrc: "/encounters/spark-orb/lumipuff.png",
  collectionTitle: "Spark Garden friend",
  capturePersonality: "playful",
  personalityTags: ["sunny", "gentle", "curious"],
  lifeStates: ["idle", "curious", "happy", "sleep", "celebrate"],
  presentation: {
    rendererKey: "lumipuff",
  },
  captureOrb: {
    primary: "#79a7ff",
    energy: "#7cfff1",
    band: "#293b78",
    emblem: "spark-star",
  },
  learningCatalog: {
    algorithmTargets: ["variable_reward", "activity_affinity"],
    evidenceClass: "engagement_only",
    masteryClaimAllowed: false,
    reuseDecision: "candidate",
    reuseReason:
      "Measure whether a captured buddy increases voluntary return to learning.",
  },
  sprite: {
    mode: "css-png",
    futureAtlasReady: true,
  },
};

export const MOSSBACK_MONSTER: CapturedMonsterConfig = {
  id: "mossback",
  speciesName: "Mossback",
  defaultNickname: "Mossy",
  habitatName: "Whispering Grove",
  rarity: "common",
  statLabel: "GROVE",
  statValue: 168,
  imageSrc: "/encounters/spark-orb/mossback.png",
  collectionTitle: "Whispering Grove friend",
  capturePersonality: "shy",
  personalityTags: ["calm", "patient", "comforting"],
  lifeStates: ["idle", "curious", "happy", "sleep", "celebrate"],
  presentation: {
    rendererKey: "mossback",
  },
  captureOrb: {
    primary: "#8fd8a4",
    energy: "#ffb84d",
    band: "#345f35",
    emblem: "spiral-leaf",
  },
  learningCatalog: {
    algorithmTargets: ["variable_reward", "activity_affinity"],
    evidenceClass: "engagement_only",
    masteryClaimAllowed: false,
    reuseDecision: "candidate",
    reuseReason:
      "Measure whether a calm creature increases persistence after difficult practice.",
  },
  sprite: {
    mode: "css-png",
    futureAtlasReady: true,
  },
};

export const capturedMonsterCatalog = [
  LUMIPUFF_MONSTER,
  MOSSBACK_MONSTER,
] as const;

export function capturedMonsterById(
  creatureId: string,
): CapturedMonsterConfig | null {
  return (
    capturedMonsterCatalog.find((creature) => creature.id === creatureId) ??
    null
  );
}
