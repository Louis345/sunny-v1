import { expect, it } from "vitest";
import { REWARD_CATALOG } from "../../../src/shared/rewardCatalog";
import { WARDROBE_STORE_CATALOG } from "../lib/wardrobeStore";

// The reward catalog names wardrobe items by id instead of copying them: this fails if one stops matching.
it("every outfit she can earn is a real wardrobe store item", () => {
  const wardrobeIds = new Set(WARDROBE_STORE_CATALOG.map(item => item.id));
  for (const item of REWARD_CATALOG.filter(row => row.kind === "outfit")) expect(wardrobeIds.has(item.wardrobeItemId!), item.id).toBe(true);
});
