import { fittedCallLook } from "./callStartLook";
import { resolvePreparedWardrobePresentation } from "./wardrobeBodyProfiles";
import type { WardrobeSelection } from "./wardrobeStore";
import { savedEquippedLook, type ServerWallet } from "./wardrobeWallet";

/** Sent by the closet whenever a child saves a look, so the board portrait redraws in it (BUGS.md 2026-11-12). */
export const WARDROBE_LOOK_CHANGED_EVENT = "sunny:wardrobe-look-changed";

export type BoardPortraitLook = { modelUrl: string; look: WardrobeSelection };

const NO_LOOK: WardrobeSelection = { accessoryId: "none", outfitId: "none" };

/**
 * The look the board portrait draws: the same saved look a FaceTime call starts in, on the companion's dressable
 * body. With no saved look, or when the wallet cannot be read, the companion keeps her own model.
 */
export async function loadBoardPortraitLook(input: {
  childId: string;
  companionId: string;
  defaultModelUrl: string;
  fetchWallet: (childId: string) => Promise<ServerWallet>;
  storage: Pick<Storage, "getItem"> | undefined;
}): Promise<BoardPortraitLook> {
  const plain = { modelUrl: input.defaultModelUrl, look: NO_LOOK };
  const body = resolvePreparedWardrobePresentation(input.companionId)?.bodyModelUrl;
  if (!body) return plain;
  let wallet: ServerWallet;
  try {
    wallet = await input.fetchWallet(input.childId);
  } catch (error: unknown) {
    console.error(` 🎮 [board-portrait] [look] [wallet-unavailable] child=${input.childId} companion=${input.companionId} drawing=own-model`, error);
    return plain;
  }
  const look = fittedCallLook(savedEquippedLook(input.storage, input.childId, wallet, input.companionId, body), body, input.companionId);
  const result = look.outfitId === "none" && look.accessoryId === "none" ? plain : { modelUrl: body, look };
  console.log(` 🎮 [board-portrait] [look] [resolved] child=${input.childId} companion=${input.companionId} outfit=${result.look.outfitId} accessory=${result.look.accessoryId} model=${result.modelUrl}`);
  return result;
}
