/**
 * What a FaceTime companion knows about how she looks (BUGS.md S34, 2026-11-19). She cannot see herself, so every
 * call turn carries what the call draws her wearing and the outfits the child just tried on her; when that is not
 * enough she can ask for a picture of herself (lookAtMyself), which the kiosk takes from her own portrait.
 */
import { companionLookNames } from "./boardPortraitLook";
import type { WardrobeAccessoryId, WardrobeOutfitId } from "./wardrobeStore";

export type CallCompanionLook = { outfit: string; accessory: string; recentTryOns: string[] };
export type PortraitSnapshot = {
  base64: string; mimeType: "image/jpeg"; reason: "self_look"; capturedAt: number; width: number; height: number;
};

const MAX_TRY_ONS = 3;
const MAX_LOOKS_PER_CALL = 10;
const SNAPSHOT_WIDTH = 512;

/** The call's drawn look by shop names ("" = her own clothes / no accessory) plus the recent try-ons. */
export function callCompanionLook(
  look: { outfitId: string; accessoryId: string; materialVariant: { id: string; tint: string } | null },
  recentTryOns: string[],
): CallCompanionLook {
  const names = companionLookNames({
    outfitId: look.outfitId as WardrobeOutfitId,
    accessoryId: look.accessoryId as WardrobeAccessoryId,
    ...(look.materialVariant ? { outfitMaterialVariant: look.materialVariant } : {}),
  });
  return { ...names, recentTryOns: recentTryOns.slice(-MAX_TRY_ONS) };
}

/** Adds a try-on, newest last: the same item again moves to the end, and only the last three stay. */
export function noteTryOn(list: string[], name: string): string[] {
  if (!name || list.at(-1) === name) return list;
  return [...list.filter(item => item !== name), name].slice(-MAX_TRY_ONS);
}

/** One look per question and at most ten per call, so a look can never repeat itself (AGENTS Law 2). */
export function createSelfLookGuard(max = MAX_LOOKS_PER_CALL) {
  const seen = new Set<string>();
  return {
    allow(questionKey: string): boolean {
      if (seen.has(questionKey) || seen.size >= max) return false;
      seen.add(questionKey);
      return true;
    },
    reset(): void { seen.clear(); },
  };
}

/**
 * A JPEG of her portrait, drawn over a soft backdrop (the portrait is transparent). Call it right after the
 * portrait renders, in the same task, or the canvas reads back empty; an empty read gives null.
 */
export function portraitSnapshot(canvas: HTMLCanvasElement | null, now = Date.now()): PortraitSnapshot | null {
  if (!canvas || !canvas.width || !canvas.height) return null;
  const width = Math.min(SNAPSHOT_WIDTH, canvas.width);
  const height = Math.max(1, Math.round(canvas.height * (width / canvas.width)));
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(canvas, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  let drawn = 0;
  for (let index = 3; index < pixels.length; index += 4 * 16) if (pixels[index] > 0) drawn += 1;
  if (drawn === 0) {
    console.warn(" 🎮 [self-look] [capture] [empty] the portrait read back blank");
    return null;
  }
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#eef0f6";
  ctx.fillRect(0, 0, width, height);
  const base64 = out.toDataURL("image/jpeg", 0.7).replace(/^data:image\/jpeg;base64,/, "");
  return base64 ? { base64, mimeType: "image/jpeg", reason: "self_look", capturedAt: now, width, height } : null;
}
