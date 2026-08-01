import type { CapturedCreatureRewardGatewayReceipt } from "./capturedMonsterReward";

const PERSONA_CREATURE_EVENT_URL = "http://127.0.0.1:47831/events";
const PERSONA_ACTIVE_CREATURE_URL =
  "http://127.0.0.1:47831/active-creature";

interface NativeCreatureBridgeResponse {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
}

type NativeCreatureBridgeFetch = (
  input: string,
  init: RequestInit,
) => Promise<NativeCreatureBridgeResponse>;

interface NativeCreatureBridgeOptions {
  fetcher?: NativeCreatureBridgeFetch;
  assetOrigin?: string;
}

interface SafeNativeCreatureReturnOptions extends NativeCreatureBridgeOptions {
  onAccepted: () => void;
}

export type NativeCreatureMoment =
  | "correct"
  | "recovery"
  | "streak"
  | "idle"
  | "session-complete";

const DEFAULT_BUDDY_PRESENTATION = {
  preferred_anchor: "bottom-right",
  protected_regions: [
    {
      x: 0,
      y: 0,
      width: 0.6,
      height: 1,
      role: "learning-controls",
    },
  ],
} as const;

export function selectionIdForReceipt(
  receipt: CapturedCreatureRewardGatewayReceipt,
): string {
  return `active:${receipt.childId}:${receipt.creatureId}`;
}

export async function publishNativeActiveCreature(
  receipt: CapturedCreatureRewardGatewayReceipt,
  {
    fetcher = globalThis.fetch,
    assetOrigin = globalThis.location?.origin ?? "http://127.0.0.1:6007",
  }: NativeCreatureBridgeOptions = {},
): Promise<void> {
  const presentationAssetUrl = new URL(
    receipt.reward.inventoryRecord.imageSrc,
    assetOrigin,
  ).href;
  const response = await fetcher(PERSONA_CREATURE_EVENT_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "active-creature-selected",
      selection_id: selectionIdForReceipt(receipt),
      child_id: receipt.childId,
      inventory_record_id: receipt.recordId,
      creature_id: receipt.creatureId,
      species_name: receipt.reward.speciesName,
      nickname: receipt.reward.inventoryRecord.nickname,
      mood: receipt.reward.inventoryRecord.mood,
      bond: receipt.reward.inventoryRecord.bond,
      presentation_asset_url: presentationAssetUrl,
      presentation: DEFAULT_BUDDY_PRESENTATION,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Persona active-creature bridge rejected selection: ${response.status}`,
    );
  }
  console.info(
    " 🎮 [sunny-farm] [active-creature-selected] [accepted]",
    {
      recordId: receipt.recordId,
      creatureId: receipt.creatureId,
      childId: receipt.childId,
    },
  );
}

export async function publishNativeCreatureMoment(
  moment: {
    selectionId: string;
    moment: NativeCreatureMoment;
    streakCount?: number;
    protectedInteraction: boolean;
  },
  { fetcher = globalThis.fetch }: NativeCreatureBridgeOptions = {},
): Promise<void> {
  const response = await fetcher(PERSONA_CREATURE_EVENT_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "active-creature-moment",
      selection_id: moment.selectionId,
      moment: moment.moment,
      ...(moment.streakCount == null
        ? {}
        : { streak_count: moment.streakCount }),
      protected_interaction: moment.protectedInteraction,
      evidence_class: "engagement_only",
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Persona active-creature bridge rejected moment: ${response.status}`,
    );
  }
  console.info(" 🎮 [sunny-buddy] [learning-moment] [accepted]", {
    selectionId: moment.selectionId,
    moment: moment.moment,
    evidenceClass: "engagement_only",
  });
}

export async function readNativeActiveCreatureSelection(
  { fetcher = globalThis.fetch }: NativeCreatureBridgeOptions = {},
): Promise<string | null> {
  const response = await fetcher(PERSONA_ACTIVE_CREATURE_URL, {
    method: "GET",
  });
  if (!response.ok || !response.json) {
    throw new Error(
      `Persona active-creature bridge rejected status: ${response.status}`,
    );
  }
  const body = await response.json();
  if (
    body == null ||
    typeof body !== "object" ||
    !("active_selection_id" in body)
  ) {
    throw new Error("Persona active-creature bridge returned invalid status");
  }
  const selectionId = body.active_selection_id;
  if (selectionId !== null && typeof selectionId !== "string") {
    throw new Error("Persona active-creature bridge returned invalid selection");
  }
  return selectionId;
}

export async function publishNativeCreatureReturn(
  selection: { childId: string; selectionId: string },
  { fetcher = globalThis.fetch }: NativeCreatureBridgeOptions = {},
): Promise<void> {
  const response = await fetcher(PERSONA_CREATURE_EVENT_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "active-creature-returned",
      child_id: selection.childId,
      selection_id: selection.selectionId,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Persona active-creature bridge rejected return: ${response.status}`,
    );
  }
  console.info(" 🎮 [sunny-farm] [active-creature-returned] [accepted]", selection);
}

export async function returnNativeCreatureToFarmSafely(
  selection: { childId: string; selectionId: string },
  { onAccepted, ...bridgeOptions }: SafeNativeCreatureReturnOptions,
): Promise<void> {
  await publishNativeCreatureReturn(selection, bridgeOptions);
  onAccepted();
}
