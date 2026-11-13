import { expect, it } from "vitest";
import { COMPANION_MANIFEST } from "../companion/companions.generated";
import { resolvePreparedWardrobePresentation } from "../lib/wardrobeBodyProfiles";
import { WARDROBE_STORE_CATALOG, getCompatibleWardrobeItems } from "../lib/wardrobeStore";
import { getXwearOutfitDefinition, isXwearOutfitApprovedForAvatar } from "../lib/xwearDress";

// Owner 2026-11-12: "sometimes when you click wearables, they don't show everything." Towa's shop listed four
// dresses and a hoodie; each click showed only an "Unavailable" bubble on her plain model. Her prepared body is not
// on Saori, so the dressing room falls back to her own model, where the shop's check said yes and the renderer's
// said no. Why the human caught it: she clicked and nothing appeared. Why logs missed it: the shop logs no refusal.
// Why the lab missed it: shop and renderer were tested apart. Rule: the shop offers a garment only where it renders.
const models = COMPANION_MANIFEST.flatMap(entry => {
  const own = entry.companionConfig?.vrmUrl ?? entry.vrmUrl;
  const prepared = resolvePreparedWardrobePresentation(entry.id)?.bodyModelUrl;
  return [own, ...(prepared ? [prepared] : [])].map(model => [entry.id, model] as const);
});

it.each(models)("every garment the shop offers %s on %s renders there", (companionId, model) => {
  for (const item of getCompatibleWardrobeItems(WARDROBE_STORE_CATALOG, model, companionId)) {
    if (item.asset.kind !== "outfit") continue;
    const outfit = getXwearOutfitDefinition(item.asset.outfitId);
    expect(outfit && isXwearOutfitApprovedForAvatar(outfit, model), `${companionId} ${item.id} on ${model}`).toBe(true);
  }
});
