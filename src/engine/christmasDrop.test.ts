import { describe, expect, it } from "vitest";
import { createStarterCompanionCarePlan, grantNodeChest, purchaseWithCoins } from "./companionCareEngine";
import { CHRISTMAS_2026, REWARD_CATALOG, collectionView, eligibleDrops, inSeason } from "../shared/rewardCatalog";

// Christmas drop 2026 (owner, 2026-11-25): Christmas items drop from chests only inside the window, she keeps what
// she wins forever, they cannot be bought, and only the snowflake tiara is legendary. Checklist:
// docs/session-checklists/christmas-drop-2026.md (S2, S3, S5, F3).

const christmas = REWARD_CATALOG.filter(item => item.season === CHRISTMAS_2026.id);
const everythingElse = REWARD_CATALOG.filter(item => item.season === undefined).map(item => item.id);
const IN = "2026-12-10T17:00:00.000Z";
const BEFORE = "2026-11-25T17:00:00.000Z";
const AFTER = "2027-01-08T17:00:00.000Z";
/** Chest rolls in order: rarity, coins, bonus, item share, item pick, then call time. */
const rolls = (...values: number[]) => () => values.shift() ?? 0.5;

describe("the Christmas set", () => {
  it("has about twelve headwear pieces and red and green garments, with only the tiara legendary", () => {
    const headwear = christmas.filter(item => item.slot === "head");
    expect(headwear.length).toBeGreaterThanOrEqual(11);
    expect(christmas.filter(item => item.slot === "body").length).toBeGreaterThanOrEqual(2);
    expect(christmas.filter(item => item.rarity === "legendary").map(item => item.wardrobeItemId)).toEqual(["snowflake-tiara"]);
    expect(christmas.filter(item => item.rarity === "epic").map(item => item.wardrobeItemId).sort())
      .toEqual(expect.arrayContaining(["holly-crown", "reindeer-antlers", "star-topper"]));
    for (const item of christmas) expect(item.price, `${item.id} is chest-only`).toBeUndefined();
  });

  it("runs Dec 1 to Jan 6", () => {
    expect([CHRISTMAS_2026.from, CHRISTMAS_2026.until]).toEqual(["2026-12-01", "2027-01-06"]);
    const tiara = christmas.find(item => item.wardrobeItemId === "snowflake-tiara")!;
    expect(inSeason(tiara, "2026-11-30T12:00:00.000Z")).toBe(false);
    expect(inSeason(tiara, "2026-12-01T12:00:00.000Z")).toBe(true);
    expect(inSeason(tiara, "2027-01-06T12:00:00.000Z")).toBe(true);
    expect(inSeason(tiara, "2027-01-07T12:00:00.000Z")).toBe(false);
  });
});

describe("S2: chests drop Christmas items only inside the window", () => {
  it("a legendary chest's pool holds the Christmas set in the window and none of it outside", () => {
    const inWindow = eligibleDrops("legendary", everythingElse, IN).map(item => item.id).sort();
    expect(inWindow).toEqual(christmas.map(item => item.id).sort());
    expect(eligibleDrops("legendary", everythingElse, BEFORE)).toEqual([]);
    expect(eligibleDrops("legendary", everythingElse, AFTER)).toEqual([]);
  });

  it("a real chest roll gives her a Christmas item in the window and nothing Christmas outside it", () => {
    const plan = { ...createStarterCompanionCarePlan({ childId: "demo-pashley", companionId: "elli", nowIso: IN }) };
    plan.inventory = { ...plan.inventory, rewards: everythingElse };
    const won = grantNodeChest(plan, { homeworkId: "hw", nodeId: "n1", kind: "legendary", nowIso: IN, roll: rolls(0.5, 0.5, 0, 0, 0.99) });
    const itemId = won.chest.bonus?.kind === "item" ? won.chest.bonus.itemId : "";
    expect(christmas.map(item => item.id)).toContain(itemId);
    expect(won.plan.inventory.rewards).toContain(itemId);
    const outside = grantNodeChest(plan, { homeworkId: "hw", nodeId: "n2", kind: "legendary", nowIso: AFTER, roll: rolls(0.5, 0.5, 0, 0, 0.99) });
    expect(outside.chest.bonus?.kind === "item" ? outside.chest.bonus.itemId : "none").toBe("none");
  });
});

describe("S3, S5, F3: hers forever, shown greyed until won, never sold", () => {
  it("shows every Christmas item before and during the window, greyed until won", () => {
    for (const now of [BEFORE, IN]) {
      const shown = collectionView(everythingElse, now).filter(entry => entry.item.season === CHRISTMAS_2026.id);
      expect(shown.map(entry => entry.item.id).sort()).toEqual(christmas.map(item => item.id).sort());
      expect(shown.every(entry => !entry.owned)).toBe(true);
    }
  });

  it("keeps a won item in her collection after the window and drops the ones she never won", () => {
    const tiara = christmas.find(item => item.wardrobeItemId === "snowflake-tiara")!;
    const after = collectionView([tiara.id], AFTER).filter(entry => entry.item.season === CHRISTMAS_2026.id);
    expect(after).toEqual([expect.objectContaining({ owned: true, item: tiara })]);
  });

  it("cannot be bought with coins", () => {
    const plan = { ...createStarterCompanionCarePlan({ childId: "demo-pashley", companionId: "elli", nowIso: IN, coinBalance: 9999 }) };
    const result = purchaseWithCoins(plan, { receiptId: "r1", offer: { kind: "outfit", itemId: christmas[0]!.id }, nowIso: IN });
    expect(result).toEqual(expect.objectContaining({ ok: false, reason: "unknown_offer" }));
  });
});
