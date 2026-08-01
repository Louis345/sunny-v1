import type {
  CapturedMonsterConfig,
  CapturedMonsterLifeState,
} from "./capturedMonsterCatalog";

export type CapturedCreatureRewardSource =
  | "spark_orb_learning_shell"
  | "hatch_hunt"
  | "hatch_hunt_orb_capture";
export type CapturedCreatureChartWriteMode = "storybook_only";
export type CapturedCreatureHitQuality = "direct" | "near" | "wide";

export interface CapturedCreatureOrigin {
  source: CapturedCreatureRewardSource;
  domain: string;
  currentTarget: string;
  encounterId?: string;
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
  captureCount: number;
  captureHistory: Array<{
    capturedAt: string;
    origin: CapturedCreatureOrigin;
  }>;
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
  encounterId?: string;
}

export interface OrbCaptureCompletedEvent {
  type: "orb_capture_completed";
  source: CapturedCreatureRewardSource;
  encounterId?: string;
  chargeGoal: number;
  orbCount: number;
  hitDistance?: number;
  hitQuality?: CapturedCreatureHitQuality;
  reward: CapturedCreatureReward;
}

export interface StorybookMonsterInventoryState {
  childId: string;
  activeCreatureId: string | null;
  capturedCreatures: CapturedCreatureInventoryRecord[];
}

export interface StorybookMonsterInventory {
  recordCapture: (reward: CapturedCreatureReward) => StorybookMonsterInventoryState;
  updateCreature: (
    creatureId: string,
    patch: Partial<
      Pick<CapturedCreatureInventoryRecord, "nickname" | "mood" | "bond">
    >,
  ) => StorybookMonsterInventoryState;
  selectActiveCreature: (creatureId: string) => StorybookMonsterInventoryState;
  returnActiveCreature: () => StorybookMonsterInventoryState;
  list: () => CapturedCreatureInventoryRecord[];
  state: () => StorybookMonsterInventoryState;
}

export interface MonsterInventoryStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => unknown;
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
  encounterId?: string;
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
  encounterId,
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
    captureCount: 1,
    captureHistory: [
      {
        capturedAt,
        origin: {
          source,
          domain,
          currentTarget,
          ...(encounterId ? { encounterId } : {}),
        },
      },
    ],
    sidekickSelected: false,
    capturedAt,
    chartWriteMode: "storybook_only",
    origin: {
      source,
      domain,
      currentTarget,
      ...(encounterId ? { encounterId } : {}),
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
  encounterId,
  chargeGoal,
  orbCount,
  hitDistance,
  hitQuality,
}: {
  reward: CapturedCreatureReward;
  encounterId?: string;
  chargeGoal: number;
  orbCount: number;
  hitDistance?: number;
  hitQuality?: CapturedCreatureHitQuality;
}): OrbCaptureCompletedEvent {
  return {
    type: "orb_capture_completed",
    source: reward.source,
    ...(encounterId ? { encounterId } : {}),
    chargeGoal,
    orbCount,
    hitDistance,
    hitQuality,
    reward,
  };
}

export function storybookReceiptForInventoryRecord(
  inventoryRecord: CapturedCreatureInventoryRecord,
): CapturedCreatureRewardGatewayReceipt {
  const reward: CapturedCreatureReward = {
    contractVersion: "spark-orb-reward-v1",
    source: inventoryRecord.origin.source,
    creatureId: inventoryRecord.creatureId,
    speciesName: inventoryRecord.speciesName,
    collectionTitle: inventoryRecord.collectionTitle,
    inventoryRecord,
  };
  return {
    mode: "storybook_only",
    status: "recorded",
    childId: inventoryRecord.childId,
    creatureId: inventoryRecord.creatureId,
    recordId: inventoryRecord.id,
    domain: inventoryRecord.origin.domain,
    currentTarget: inventoryRecord.origin.currentTarget,
    encounterId: inventoryRecord.origin.encounterId,
    chargeGoal: 0,
    orbCount: 0,
    capturedAt: inventoryRecord.capturedAt,
    chartWriteAttempted: false,
    reward,
  };
}

export function createStorybookMonsterInventory({
  childId,
  initialState,
  onStateChange,
}: {
  childId: string;
  initialState?: StorybookMonsterInventoryState;
  onStateChange?: (state: StorybookMonsterInventoryState) => void;
}): StorybookMonsterInventory {
  let currentState: StorybookMonsterInventoryState =
    initialState?.childId === childId
      ? {
          childId,
          activeCreatureId: initialState.activeCreatureId ?? null,
          capturedCreatures: [...initialState.capturedCreatures],
        }
      : {
          childId,
          activeCreatureId: null,
          capturedCreatures: [],
        };

  function publicState(): StorybookMonsterInventoryState {
    return {
      childId,
      activeCreatureId: currentState.activeCreatureId,
      capturedCreatures: currentState.capturedCreatures.map((record) => ({
        ...record,
        sidekickSelected: record.creatureId === currentState.activeCreatureId,
      })),
    };
  }

  function update(nextState: StorybookMonsterInventoryState): StorybookMonsterInventoryState {
    currentState = nextState;
    const snapshot = publicState();
    onStateChange?.(snapshot);
    return snapshot;
  }

  return {
    recordCapture(reward) {
      const existing = currentState.capturedCreatures.find(
        (record) => record.creatureId === reward.creatureId,
      );
      const nextRecord = existing
        ? {
            ...existing,
            bond: Math.min(100, existing.bond + 2),
            captureCount: (existing.captureCount ?? 1) + 1,
            captureHistory: [
              ...(existing.captureHistory ?? []),
              {
                capturedAt: reward.inventoryRecord.capturedAt,
                origin: reward.inventoryRecord.origin,
              },
            ],
          }
        : reward.inventoryRecord;
      const capturedCreatures = currentState.capturedCreatures.filter(
        (record) => record.creatureId !== reward.creatureId,
      );
      const snapshot = update({
        childId,
        activeCreatureId: currentState.activeCreatureId,
        capturedCreatures: [...capturedCreatures, nextRecord],
      });
      console.info(
        " 🎮 [captured-monster-inventory] [record_capture] [storybook_only]",
        {
          type: "monster_inventory_recorded",
          childId,
          creatureId: reward.creatureId,
          recordId: nextRecord.id,
          count: snapshot.capturedCreatures.length,
        },
      );
      return snapshot;
    },
    updateCreature(creatureId, patch) {
      if (!currentState.capturedCreatures.some((record) => record.creatureId === creatureId)) {
        throw new Error("captured_creature_not_in_farm");
      }
      const snapshot = update({
        ...currentState,
        capturedCreatures: currentState.capturedCreatures.map((record) =>
          record.creatureId === creatureId ? { ...record, ...patch } : record,
        ),
      });
      console.info(" 🎮 [sunny-farm] [creature_state_updated] [recorded]", {
        childId,
        creatureId,
        fields: Object.keys(patch),
      });
      return snapshot;
    },
    selectActiveCreature(creatureId) {
      if (!currentState.capturedCreatures.some((record) => record.creatureId === creatureId)) {
        throw new Error("captured_creature_not_in_farm");
      }
      const snapshot = update({
        ...currentState,
        activeCreatureId: creatureId,
      });
      console.info(" 🎮 [sunny-farm] [active_creature_selected] [recorded]", {
        childId,
        creatureId,
      });
      return snapshot;
    },
    returnActiveCreature() {
      const returnedCreatureId = currentState.activeCreatureId;
      const snapshot = update({
        ...currentState,
        activeCreatureId: null,
      });
      console.info(" 🎮 [sunny-farm] [active_creature_returned] [recorded]", {
        childId,
        creatureId: returnedCreatureId,
      });
      return snapshot;
    },
    list() {
      return publicState().capturedCreatures;
    },
    state() {
      return publicState();
    },
  };
}

export function createPersistentStorybookMonsterInventory({
  childId,
  storage = globalThis.localStorage,
}: {
  childId: string;
  storage?: MonsterInventoryStorage;
}): StorybookMonsterInventory {
  const key = `sunny:farm:v1:${childId}`;
  let initialState: StorybookMonsterInventoryState | undefined;
  try {
    const serialized = storage.getItem(key);
    if (serialized) {
      const parsed = JSON.parse(serialized) as StorybookMonsterInventoryState;
      if (parsed.childId === childId && Array.isArray(parsed.capturedCreatures)) {
        initialState = parsed;
      }
    }
  } catch (error) {
    console.error(" 🎮 [sunny-farm] [restore] [failed]", error);
  }

  return createStorybookMonsterInventory({
    childId,
    initialState,
    onStateChange(state) {
      try {
        storage.setItem(key, JSON.stringify(state));
      } catch (error) {
        console.error(" 🎮 [sunny-farm] [persist] [failed]", error);
      }
    },
  });
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
    encounterId: event.encounterId ?? record.origin.encounterId,
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
