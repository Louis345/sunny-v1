import {
  WARDROBE_STORE_CATALOG,
  isWardrobeOutfitCompatible,
  isWardrobeStoreItemCompatible,
  type WardrobeSelection,
} from "./wardrobeStore";
import { savedEquippedLook, type ServerWallet } from "./wardrobeWallet";

/** The look as it can be worn on this body: the outfit and the accessory are each checked for fit. */
export function fittedCallLook(look: WardrobeSelection, modelUrl: string, companionId: string): WardrobeSelection {
  const accessory = look.accessoryId === "none"
    ? undefined
    : WARDROBE_STORE_CATALOG.find((item) => item.asset.kind === "accessory" && item.asset.accessoryId === look.accessoryId);
  const accessoryFits = accessory ? isWardrobeStoreItemCompatible(accessory, modelUrl, companionId) : false;
  const outfitFits = look.outfitId !== "none" && isWardrobeOutfitCompatible(look.outfitId, modelUrl, companionId);
  return {
    accessoryId: accessoryFits ? look.accessoryId : "none",
    outfitId: outfitFits ? look.outfitId : "none",
    ...(outfitFits && look.outfitMaterialVariant ? { outfitMaterialVariant: look.outfitMaterialVariant } : {}),
  };
}

/**
 * A call starts in her saved look (BUGS.md 2026-11-07/08). The resolved look is always applied, "none" included,
 * so a companion with no look never keeps the previous companion's clothes, and a result that arrives after the
 * companion changed is ignored.
 */
export async function loadCallStartLook(input: {
  childId: string;
  companionId: string;
  modelUrl: string;
  fetchWallet: (childId: string) => Promise<ServerWallet>;
  storage: Pick<Storage, "getItem"> | undefined;
  isCurrent: () => boolean;
  apply: (look: WardrobeSelection) => void;
}): Promise<void> {
  const wallet = await input.fetchWallet(input.childId);
  if (!input.isCurrent()) {
    console.log(` 🎮 [wardrobe-wallet] [call-start-look] [stale-ignored] child=${input.childId} companion=${input.companionId}`);
    return;
  }
  const look = fittedCallLook(
    savedEquippedLook(input.storage, input.childId, wallet, input.companionId, input.modelUrl),
    input.modelUrl,
    input.companionId,
  );
  console.log(` 🎮 [wardrobe-wallet] [call-start-look] [${look.outfitId}] child=${input.childId} companion=${input.companionId} accessory=${look.accessoryId}`);
  input.apply(look);
}
