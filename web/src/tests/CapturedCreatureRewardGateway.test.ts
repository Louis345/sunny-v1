import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LUMIPUFF_MONSTER,
  MOSSBACK_MONSTER,
} from "../components/capturedMonsterCatalog";
import {
  buildCapturedCreatureReward,
  buildOrbCaptureCompletedEvent,
  createStorybookMonsterInventory,
  createPersistentStorybookMonsterInventory,
  recordCapturedCreatureReward,
} from "../components/capturedMonsterReward";

const capturedAt = "2026-05-30T17:00:00.000Z";

afterEach(() => {
  vi.restoreAllMocks();
});

function captureEvent() {
  const reward = buildCapturedCreatureReward({
    creature: LUMIPUFF_MONSTER,
    childId: "ila",
    domain: "spelling",
    currentTarget: "word:because",
    capturedAt,
    source: "spark_orb_learning_shell",
  });

  return buildOrbCaptureCompletedEvent({
    reward,
    chargeGoal: 3,
    orbCount: 7,
    hitDistance: 15,
    hitQuality: "direct",
  });
}

describe("captured creature reward gateway", () => {
  it("records capture payloads through storybook mode without live writes", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("storybook mode must not reach live APIs"),
    );
    const inventory = createStorybookMonsterInventory({ childId: "ila" });

    const receipt = recordCapturedCreatureReward({
      mode: "storybook_only",
      event: captureEvent(),
      inventory,
    });

    expect(receipt).toMatchObject({
      mode: "storybook_only",
      status: "recorded",
      childId: "ila",
      creatureId: "lumipuff",
      recordId: "ila:lumipuff:2026-05-30T17:00:00.000Z",
      domain: "spelling",
      currentTarget: "word:because",
      hitQuality: "direct",
      capturedAt,
      chartWriteAttempted: false,
    });
    expect(inventory.list()).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      " 🎮 [captured-creature-reward-gateway] [record_capture] [storybook_only]",
      expect.objectContaining({
        type: "captured_creature_reward_recorded",
        mode: "storybook_only",
        childId: "ila",
        creatureId: "lumipuff",
      }),
    );
  });

  it("preserves learning origin, capture quality, and creature state in the receipt", () => {
    const receipt = recordCapturedCreatureReward({
      mode: "storybook_only",
      event: captureEvent(),
      inventory: createStorybookMonsterInventory({ childId: "ila" }),
    });

    expect(receipt.reward.inventoryRecord).toMatchObject({
      childId: "ila",
      creatureId: "lumipuff",
      nickname: "Lumi",
      mood: "curious",
      bond: 18,
      sidekickSelected: false,
      capturedAt,
      origin: {
        source: "spark_orb_learning_shell",
        domain: "spelling",
        currentTarget: "word:because",
      },
    });
    expect(receipt).toMatchObject({
      chargeGoal: 3,
      orbCount: 7,
      hitDistance: 15,
      hitQuality: "direct",
    });
  });

  it("keeps one creature per species and derives one active buddy", () => {
    const inventory = createStorybookMonsterInventory({ childId: "ila" });
    inventory.recordCapture(captureEvent().reward);
    inventory.recordCapture(
      buildCapturedCreatureReward({
        creature: LUMIPUFF_MONSTER,
        childId: "ila",
        domain: "spelling",
        currentTarget: "word:garden",
        capturedAt: "2026-06-01T17:00:00.000Z",
        source: "spark_orb_learning_shell",
      }),
    );

    expect(inventory.list()).toHaveLength(1);
    expect(inventory.list()[0]).toMatchObject({
      creatureId: "lumipuff",
      captureCount: 2,
      bond: 20,
      sidekickSelected: false,
    });

    inventory.selectActiveCreature("lumipuff");
    expect(inventory.state().activeCreatureId).toBe("lumipuff");
    expect(inventory.list()[0]?.sidekickSelected).toBe(true);

    inventory.returnActiveCreature();
    expect(inventory.state().activeCreatureId).toBeNull();
    expect(inventory.list()[0]?.sidekickSelected).toBe(false);
  });

  it("records Mossy separately and swaps the one active buddy", () => {
    const inventory = createStorybookMonsterInventory({ childId: "ila" });
    inventory.recordCapture(captureEvent().reward);
    inventory.recordCapture(
      buildCapturedCreatureReward({
        creature: MOSSBACK_MONSTER,
        childId: "ila",
        domain: "spelling",
        currentTarget: "word:garden",
        capturedAt: "2026-06-02T17:00:00.000Z",
        source: "spark_orb_learning_shell",
      }),
    );

    expect(inventory.list().map((record) => record.creatureId).sort()).toEqual([
      "lumipuff",
      "mossback",
    ]);
    inventory.selectActiveCreature("lumipuff");
    inventory.selectActiveCreature("mossback");
    expect(inventory.state().activeCreatureId).toBe("mossback");
    expect(inventory.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ creatureId: "lumipuff", sidekickSelected: false }),
        expect.objectContaining({ creatureId: "mossback", sidekickSelected: true }),
      ]),
    );
  });

  it("restores Farm inventory and active buddy from persistent storage", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const first = createPersistentStorybookMonsterInventory({
      childId: "ila",
      storage,
    });
    first.recordCapture(captureEvent().reward);
    first.updateCreature("lumipuff", {
      nickname: "Sparkle",
      mood: "happy",
      bond: 31,
    });
    first.selectActiveCreature("lumipuff");

    const restored = createPersistentStorybookMonsterInventory({
      childId: "ila",
      storage,
    });
    expect(restored.state()).toMatchObject({
      childId: "ila",
      activeCreatureId: "lumipuff",
    });
    expect(restored.list()[0]).toMatchObject({
      creatureId: "lumipuff",
      nickname: "Sparkle",
      mood: "happy",
      bond: 31,
      sidekickSelected: true,
    });
  });

  it("blocks child chart mode until an explicit chart writer is provided", () => {
    expect(() =>
      recordCapturedCreatureReward({
        mode: "child_chart",
        event: captureEvent(),
      }),
    ).toThrow("captured_creature_child_chart_writer_required");
  });

  it("requires child chart mode to agree with the reward child id", () => {
    const writer = vi.fn();

    expect(() =>
      recordCapturedCreatureReward({
        mode: "child_chart",
        event: captureEvent(),
        childChartContext: {
          childId: "reina",
          source: "child_chart",
          writeCapturedCreature: writer,
        },
      }),
    ).toThrow("captured_creature_child_chart_child_mismatch");
    expect(writer).not.toHaveBeenCalled();
  });
});
