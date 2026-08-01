import { describe, expect, it, vi } from "vitest";
import {
  publishNativeActiveCreature,
  readNativeActiveCreatureSelection,
  publishNativeCreatureMoment,
  publishNativeCreatureReturn,
  returnNativeCreatureToFarmSafely,
  selectionIdForReceipt,
} from "../components/nativeCreatureBridge";
import {
  buildCapturedCreatureReward,
  buildOrbCaptureCompletedEvent,
  createStorybookMonsterInventory,
  recordCapturedCreatureReward,
} from "../components/capturedMonsterReward";
import { LUMIPUFF_MONSTER } from "../components/capturedMonsterCatalog";

function recordedReceipt() {
  const reward = buildCapturedCreatureReward({
    creature: LUMIPUFF_MONSTER,
    childId: "ila",
    domain: "spelling",
    currentTarget: "retrieval",
    capturedAt: "2026-07-30T12:00:00.000Z",
    source: "spark_orb_learning_shell",
  });
  return recordCapturedCreatureReward({
    mode: "storybook_only",
    inventory: createStorybookMonsterInventory({ childId: "ila" }),
    event: buildOrbCaptureCompletedEvent({
      reward,
      chargeGoal: 3,
      orbCount: 3,
    }),
  });
}

describe("native creature bridge", () => {
  it("publishes a recorded Farm selection as the active desktop buddy", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    const receipt = recordedReceipt();

    await publishNativeActiveCreature(receipt, {
      fetcher,
      assetOrigin: "http://127.0.0.1:6007",
    });

    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:47831/events",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          type: "active-creature-selected",
          selection_id: "active:ila:lumipuff",
          child_id: "ila",
          inventory_record_id: receipt.recordId,
          creature_id: receipt.creatureId,
          species_name: receipt.reward.speciesName,
          nickname: "Lumi",
          mood: "curious",
          bond: 18,
          presentation_asset_url:
            "http://127.0.0.1:6007/encounters/spark-orb/lumipuff.png",
          presentation: {
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
          },
        }),
      }),
    );
  });

  it("publishes learning moments as engagement-only silent buddy context", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 202 });

    await publishNativeCreatureMoment(
      {
        selectionId: "active:ila:lumipuff",
        moment: "recovery",
        streakCount: 2,
        protectedInteraction: false,
      },
      { fetcher },
    );

    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:47831/events",
      expect.objectContaining({
        body: JSON.stringify({
          type: "active-creature-moment",
          selection_id: "active:ila:lumipuff",
          moment: "recovery",
          streak_count: 2,
          protected_interaction: false,
          evidence_class: "engagement_only",
        }),
      }),
    );
  });

  it("reads the native selection so Farm state can reconcile a native return", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ active_selection_id: "active:ila:lumipuff" }),
    }));

    await expect(
      readNativeActiveCreatureSelection({ fetcher }),
    ).resolves.toBe("active:ila:lumipuff");
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:47831/active-creature",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("returns the selected buddy to the Farm", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    const receipt = recordedReceipt();

    await publishNativeCreatureReturn(
      {
        childId: receipt.childId,
        selectionId: selectionIdForReceipt(receipt),
      },
      { fetcher },
    );

    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:47831/events",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          type: "active-creature-returned",
          child_id: "ila",
          selection_id: "active:ila:lumipuff",
        }),
      }),
    );
  });

  it("changes Farm state only after the native return is accepted", async () => {
    const onAccepted = vi.fn();
    const acceptedFetcher = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    await returnNativeCreatureToFarmSafely(
      { childId: "ila", selectionId: "active:ila:lumipuff" },
      { fetcher: acceptedFetcher, onAccepted },
    );
    expect(onAccepted).toHaveBeenCalledOnce();

    onAccepted.mockClear();
    const rejectedFetcher = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(
      returnNativeCreatureToFarmSafely(
        { childId: "ila", selectionId: "active:ila:lumipuff" },
        { fetcher: rejectedFetcher, onAccepted },
      ),
    ).rejects.toThrow("Persona active-creature bridge rejected return: 503");
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it("reports a rejected active-buddy bridge instead of silently swallowing it", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 422 });

    await expect(
      publishNativeActiveCreature(recordedReceipt(), { fetcher }),
    ).rejects.toThrow("Persona active-creature bridge rejected selection: 422");
  });

  it("keeps one stable selection identity across repeat captures", () => {
    const first = recordedReceipt();
    const repeat = {
      ...first,
      recordId: "ila:lumipuff:2026-07-31T12:00:00.000Z",
      capturedAt: "2026-07-31T12:00:00.000Z",
    };

    expect(selectionIdForReceipt(first)).toBe("active:ila:lumipuff");
    expect(selectionIdForReceipt(repeat)).toBe("active:ila:lumipuff");
  });
});
