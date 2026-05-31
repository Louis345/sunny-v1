import type {
  CapturedMonsterConfig,
  CapturedMonsterLifeState,
} from "./capturedMonsterCatalog";

export type CapturedCreatureRewardSource = "spark_orb_learning_shell";
export type CapturedCreatureChartWriteMode = "storybook_only";
export type CapturedCreatureHitQuality = "direct" | "near" | "wide";

export interface CapturedCreatureOrigin {
  source: CapturedCreatureRewardSource;
  domain: string;
  currentTarget: string;
}

export interface CapturedCreatureInventoryRecord {
  id: string;
  childId: string;
  creatureId: string;
  speciesName: string;
  nickname: string;
  rarity: CapturedMonsterConfig["rarity"];
  statLabel: string;
  statValue: number;
  imageSrc: string;
  collectionTitle: string;
  mood: CapturedMonsterLifeState;
  bond: number;
  sidekickSelected: boolean;
  capturedAt: string;
  chartWriteMode: CapturedCreatureChartWriteMode;
  origin: CapturedCreatureOrigin;
}

export interface CapturedCreatureReward {
  contractVersion: "spark-orb-reward-v1";
  source: CapturedCreatureRewardSource;
  creatureId: string;
  speciesName: string;
  collectionTitle: string;
  inventoryRecord: CapturedCreatureInventoryRecord;
}

export interface BuildCapturedCreatureRewardInput {
  creature: CapturedMonsterConfig;
  childId: string;
  domain: string;
  currentTarget: string;
  capturedAt?: string;
  nickname?: string;
  mood?: CapturedMonsterLifeState;
  bond?: number;
  source: CapturedCreatureRewardSource;
}

export interface OrbCaptureCompletedEvent {
  type: "orb_capture_completed";
  source: CapturedCreatureRewardSource;
  chargeGoal: number;
  orbCount: number;
  hitDistance?: number;
  hitQuality?: CapturedCreatureHitQuality;
  reward: CapturedCreatureReward;
}

export interface StorybookMonsterInventoryState {
  childId: string;
  capturedCreatures: CapturedCreatureInventoryRecord[];
}

export interface StorybookMonsterInventory {
  recordCapture: (reward: CapturedCreatureReward) => StorybookMonsterInventoryState;
  list: () => CapturedCreatureInventoryRecord[];
  state: () => StorybookMonsterInventoryState;
}

export function buildCapturedCreatureReward({
  creature,
  childId,
  domain,
  currentTarget,
  capturedAt = new Date().toISOString(),
  nickname = creature.defaultNickname,
  mood = "curious",
  bond = 18,
  source,
}: BuildCapturedCreatureRewardInput): CapturedCreatureReward {
  const inventoryRecord: CapturedCreatureInventoryRecord = {
    id: `${childId}:${creature.id}:${capturedAt}`,
    childId,
    creatureId: creature.id,
    speciesName: creature.speciesName,
    nickname,
    rarity: creature.rarity,
    statLabel: creature.statLabel,
    statValue: creature.statValue,
    imageSrc: creature.imageSrc,
    collectionTitle: creature.collectionTitle,
    mood,
    bond,
    sidekickSelected: false,
    capturedAt,
    chartWriteMode: "storybook_only",
    origin: {
      source,
      domain,
      currentTarget,
    },
  };

  return {
    contractVersion: "spark-orb-reward-v1",
    source,
    creatureId: creature.id,
    speciesName: creature.speciesName,
    collectionTitle: creature.collectionTitle,
    inventoryRecord,
  };
}

export function buildOrbCaptureCompletedEvent({
  reward,
  chargeGoal,
  orbCount,
  hitDistance,
  hitQuality,
}: {
  reward: CapturedCreatureReward;
  chargeGoal: number;
  orbCount: number;
  hitDistance?: number;
  hitQuality?: CapturedCreatureHitQuality;
}): OrbCaptureCompletedEvent {
  return {
    type: "orb_capture_completed",
    source: reward.source,
    chargeGoal,
    orbCount,
    hitDistance,
    hitQuality,
    reward,
  };
}

export function createStorybookMonsterInventory({
  childId,
}: {
  childId: string;
}): StorybookMonsterInventory {
  let currentState: StorybookMonsterInventoryState = {
    childId,
    capturedCreatures: [],
  };

  return {
    recordCapture(reward) {
      const capturedCreatures = currentState.capturedCreatures.filter(
        (record) => record.id !== reward.inventoryRecord.id,
      );
      currentState = {
        childId,
        capturedCreatures: [...capturedCreatures, reward.inventoryRecord],
      };
      console.info(
        " 🎮 [captured-monster-inventory] [record_capture] [storybook_only]",
        {
          type: "monster_inventory_recorded",
          childId,
          creatureId: reward.creatureId,
          recordId: reward.inventoryRecord.id,
          count: currentState.capturedCreatures.length,
        },
      );
      return currentState;
    },
    list() {
      return [...currentState.capturedCreatures];
    },
    state() {
      return {
        childId: currentState.childId,
        capturedCreatures: [...currentState.capturedCreatures],
      };
    },
  };
}
