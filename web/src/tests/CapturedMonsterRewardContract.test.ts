import { afterEach, describe, expect, it, vi } from "vitest";
import { LUMIPUFF_MONSTER } from "../components/capturedMonsterCatalog";
import {
  buildCapturedCreatureReward,
  buildOrbCaptureCompletedEvent,
  createStorybookMonsterInventory,
} from "../components/capturedMonsterReward";

const capturedAt = "2026-05-30T17:00:00.000Z";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("captured monster reward contract", () => {
  it("builds a durable orb capture reward and completion event", () => {
    const reward = buildCapturedCreatureReward({
      creature: LUMIPUFF_MONSTER,
      childId: "ila",
      domain: "spelling",
      currentTarget: "word:because",
      capturedAt,
      source: "spark_orb_learning_shell",
    });

    expect(reward).toMatchObject({
      contractVersion: "spark-orb-reward-v1",
      source: "spark_orb_learning_shell",
      creatureId: "lumipuff",
      speciesName: "Lumipuff",
      collectionTitle: "Spark Garden friend",
      inventoryRecord: {
        id: "ila:lumipuff:2026-05-30T17:00:00.000Z",
        childId: "ila",
        creatureId: "lumipuff",
        speciesName: "Lumipuff",
        nickname: "Lumi",
        mood: "curious",
        bond: 18,
        sidekickSelected: false,
        capturedAt,
        chartWriteMode: "storybook_only",
        origin: {
          source: "spark_orb_learning_shell",
          domain: "spelling",
          currentTarget: "word:because",
        },
      },
    });

    const event = buildOrbCaptureCompletedEvent({
      reward,
      chargeGoal: 3,
      orbCount: 7,
      hitDistance: 18,
      hitQuality: "direct",
    });

    expect(event).toMatchObject({
      type: "orb_capture_completed",
      source: "spark_orb_learning_shell",
      chargeGoal: 3,
      orbCount: 7,
      hitDistance: 18,
      hitQuality: "direct",
      reward,
    });
  });

  it("records storybook inventory without live chart writes", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("live chart writes are forbidden in storybook plumbing"),
    );
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const inventory = createStorybookMonsterInventory({ childId: "ila" });
    const reward = buildCapturedCreatureReward({
      creature: LUMIPUFF_MONSTER,
      childId: "ila",
      domain: "spelling",
      currentTarget: "word:because",
      capturedAt,
      source: "spark_orb_learning_shell",
    });

    const state = inventory.recordCapture(reward);

    expect(state.capturedCreatures).toHaveLength(1);
    expect(state.capturedCreatures[0]).toMatchObject({
      creatureId: "lumipuff",
      nickname: "Lumi",
      chartWriteMode: "storybook_only",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      " 🎮 [captured-monster-inventory] [record_capture] [storybook_only]",
      expect.objectContaining({
        type: "monster_inventory_recorded",
        childId: "ila",
        creatureId: "lumipuff",
      }),
    );
  });
});
