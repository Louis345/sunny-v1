/**
 * Dressing a companion from her chart (owner, 2026-11-25): "When they change their clothes, they should be wearing
 * their clothes throughout the entire experience." The chart is the patient card; every room (board portrait, FaceTime,
 * 3D games) plans the look from it and dresses the model the same way, with the same fit rules. One file, so a new room
 * gets her clothes for free. The 3D games load it as /companion/sunny-dress.js (web/vite.dress.config.ts).
 */
import type * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { fittedCallLook } from "./callStartLook";
import { attachWardrobeAccessory } from "./wardrobeAccessory";
import { retainIntrinsicAccessories } from "./wardrobeAccessoryFit";
import { resolvePreparedWardrobePresentation } from "./wardrobeBodyProfiles";
import { attachWardrobeHairCollisions } from "./wardrobeHairCollision";
import { createInitialWardrobeStoreState, resolveEquippedWardrobeSelection, type WardrobeSelection } from "./wardrobeStore";
import type { ChartWearing } from "./wardrobeWallet";
import { attachXwearOutfit, captureXwearAvatarBindPose, getXwearOutfitDefinition, isXwearOutfitApprovedForAvatar } from "./xwearDress";

export { captureXwearAvatarBindPose };

export type PlannedCompanionLook = { modelUrl: string; look: WardrobeSelection };

const OWN_CLOTHES: WardrobeSelection = { accessoryId: "none", outfitId: "none" };

/**
 * The model and look a room draws, from the companion card alone: her dressable body wearing what fits it, or her own
 * model when she wears nothing from the shop. The card's items were checked against what she owns when they were saved.
 */
export function planCompanionLook(card: { companionId: string; vrmUrl: string; wearing?: ChartWearing | null }): PlannedCompanionLook {
  const plain = { modelUrl: card.vrmUrl, look: OWN_CLOTHES };
  const body = resolvePreparedWardrobePresentation(card.companionId)?.bodyModelUrl;
  const wearing = card.wearing;
  if (!body || !wearing || (!wearing.outfitItemId && !wearing.accessoryItemId)) return plain;
  const equipped = {
    ...(wearing.outfitItemId ? { outfitItemId: wearing.outfitItemId } : {}),
    ...(wearing.accessoryItemId ? { accessoryItemId: wearing.accessoryItemId } : {}),
  };
  const state = {
    ...createInitialWardrobeStoreState(),
    ownedItemIds: [wearing.outfitItemId, wearing.accessoryItemId].filter((id): id is string => Boolean(id)),
    equippedByCompanion: { [card.companionId]: equipped },
  };
  const look = fittedCallLook(resolveEquippedWardrobeSelection(state, card.companionId, body), body, card.companionId);
  return look.outfitId === "none" && look.accessoryId === "none" ? plain : { modelUrl: body, look };
}

/**
 * Puts the planned outfit and accessory on a loaded companion. A failure leaves her in her own clothes and is logged;
 * it never throws into the room, so a game keeps playing (outfit-follows-companion F2).
 */
export async function dressCompanionVrm(
  vrm: VRM,
  look: WardrobeSelection,
  modelUrl: string,
  isCancelled: () => boolean = () => false,
  room = "companion",
): Promise<void> {
  const head = vrm.humanoid?.getRawBoneNode("head") ?? null;
  const intrinsic = retainIntrinsicAccessories(vrm.scene, look.accessoryId);
  if (head && look.accessoryId !== "none" && !intrinsic) {
    try {
      attachWardrobeAccessory(head, look.accessoryId, modelUrl);
    } catch (error: unknown) {
      console.error(` 🎮 [${room}] [accessory] [failed] accessory=${look.accessoryId}`, error);
    }
  }
  const outfit = look.outfitId === "none" ? null : getXwearOutfitDefinition(look.outfitId);
  if (!outfit || !isXwearOutfitApprovedForAvatar(outfit, modelUrl)) {
    console.log(` 🎮 [${room}] [look] [wearing] outfit=none accessory=${look.accessoryId} model=${modelUrl}`);
    return;
  }
  try {
    const part: THREE.Object3D = await attachXwearOutfit(vrm.scene, outfit, look.outfitMaterialVariant ?? null, modelUrl);
    if (isCancelled()) {
      part.removeFromParent();
      return;
    }
    part.userData.disposeWardrobeColliders = attachWardrobeHairCollisions(vrm, outfit.id);
    console.log(` 🎮 [${room}] [look] [wearing] outfit=${outfit.id} accessory=${look.accessoryId} model=${modelUrl}`);
  } catch (error: unknown) {
    console.error(` 🎮 [${room}] [outfit] [failed] outfit=${outfit.id} model=${modelUrl}`, error);
  }
}
