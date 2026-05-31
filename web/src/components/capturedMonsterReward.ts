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

export type CapturedCreatureRewardGatewayMode = "storybook_only" | "child_chart";

export interface CapturedCreatureRewardChildChartContext {
  childId: string;
  source: "child_chart";
  writeCapturedCreature: (
    event: OrbCaptureCompletedEvent,
  ) => CapturedCreatureRewardGatewayReceipt;
}

export interface CapturedCreatureRewardGatewayInput {
  mode: CapturedCreatureRewardGatewayMode;
  event: OrbCaptureCompletedEvent;
  inventory?: StorybookMonsterInventory;
  childChartContext?: CapturedCreatureRewardChildChartContext;
}

export interface CapturedCreatureRewardGatewayReceipt {
  mode: CapturedCreatureRewardGatewayMode;
  status: "recorded";
  childId: string;
  creatureId: string;
  recordId: string;
  domain: string;
  currentTarget: string;
  chargeGoal: number;
  orbCount: number;
  hitDistance?: number;
  hitQuality?: CapturedCreatureHitQuality;
  capturedAt: string;
  chartWriteAttempted: boolean;
  reward: CapturedCreatureReward;
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

function receiptFor(
  mode: CapturedCreatureRewardGatewayMode,
  event: OrbCaptureCompletedEvent,
  chartWriteAttempted: boolean,
): CapturedCreatureRewardGatewayReceipt {
  const record = event.reward.inventoryRecord;
  return {
    mode,
    status: "recorded",
    childId: record.childId,
    creatureId: record.creatureId,
    recordId: record.id,
    domain: record.origin.domain,
    currentTarget: record.origin.currentTarget,
    chargeGoal: event.chargeGoal,
    orbCount: event.orbCount,
    hitDistance: event.hitDistance,
    hitQuality: event.hitQuality,
    capturedAt: record.capturedAt,
    chartWriteAttempted,
    reward: event.reward,
  };
}

export function recordCapturedCreatureReward({
  mode,
  event,
  inventory,
  childChartContext,
}: CapturedCreatureRewardGatewayInput): CapturedCreatureRewardGatewayReceipt {
  if (mode === "storybook_only") {
    const storybookInventory =
      inventory ?? createStorybookMonsterInventory({ childId: event.reward.inventoryRecord.childId });
    storybookInventory.recordCapture(event.reward);
    const receipt = receiptFor("storybook_only", event, false);
    console.info(
      " 🎮 [captured-creature-reward-gateway] [record_capture] [storybook_only]",
      {
        type: "captured_creature_reward_recorded",
        mode: "storybook_only",
        childId: receipt.childId,
        creatureId: receipt.creatureId,
        recordId: receipt.recordId,
        domain: receipt.domain,
        currentTarget: receipt.currentTarget,
        hitQuality: receipt.hitQuality,
      },
    );
    return receipt;
  }

  if (!childChartContext) {
    throw new Error("captured_creature_child_chart_writer_required");
  }

  const rewardChildId = event.reward.inventoryRecord.childId;
  if (childChartContext.childId !== rewardChildId) {
    throw new Error("captured_creature_child_chart_child_mismatch");
  }

  const receipt = childChartContext.writeCapturedCreature(event);
  console.info(
    " 🎮 [captured-creature-reward-gateway] [record_capture] [child_chart]",
    {
      type: "captured_creature_reward_recorded",
      mode: "child_chart",
      childId: receipt.childId,
      creatureId: receipt.creatureId,
      recordId: receipt.recordId,
      domain: receipt.domain,
      currentTarget: receipt.currentTarget,
      hitQuality: receipt.hitQuality,
    },
  );
  return receipt;
}
