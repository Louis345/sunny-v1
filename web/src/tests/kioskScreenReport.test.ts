import { expect, it } from "vitest";
import { kioskScreenReport } from "../utils/kioskScreenReport";

// 2026-10-22 human catch: Elli's request described a screen the child could not see. One function names what
// the kiosk renders, from the same decisions the App uses to render it; nothing else describes the screen.
const packet = { activeSessionPlan: { adventureBoard: { boardId: "b2", title: "Long i Rescue" } } } as never;
const base = { packet, packetLoading: false, sessionReady: true, directDiscovery: false, waiting: null, heldStatusShown: false, launch: null };

it("names each screen the kiosk can render", () => {
  expect(kioskScreenReport({ ...base, packet: null, packetLoading: true })).toEqual({ screen: "loading" });
  expect(kioskScreenReport({ ...base, packet: null })).toEqual({ screen: "unavailable" });
  expect(kioskScreenReport({ ...base, waiting: { step: "Your map is ready. Let's go!", detail: "", ready: 3, total: 3 } }))
    .toEqual({ screen: "waiting", boardId: "b2", waiting: { step: "Your map is ready. Let's go!", detail: "", ready: 3, total: 3 } });
  expect(kioskScreenReport({ ...base, heldStatusShown: true })).toEqual({ screen: "waiting", boardId: "b2" });
  expect(kioskScreenReport(base)).toEqual({ screen: "board", boardId: "b2", boardTitle: "Long i Rescue" });
  expect(kioskScreenReport({ ...base, launch: { nodeId: "radar", title: "Final Radar" } }))
    .toEqual({ screen: "activity", boardId: "b2", nodeId: "radar", activityTitle: "Final Radar" });
});

it("reports the spelling check only once its activity is actually open", () => {
  expect(kioskScreenReport({ ...base, directDiscovery: true, sessionReady: false })).toEqual({ screen: "loading" });
  expect(kioskScreenReport({ ...base, directDiscovery: true })).toEqual({ screen: "loading" });
  expect(kioskScreenReport({ ...base, directDiscovery: true, launch: { nodeId: "diagnostic", title: "Spelling check" } }))
    .toEqual({ screen: "evaluation", boardId: "b2", nodeId: "diagnostic", activityTitle: "Spelling check" });
});

// 2026-11-01: the log said screen=board after her session ended, though the kiosk had moved to its resting
// screen. Only the report was wrong: the app renders the resting screen before anything else.
it("names the resting screen once the session has ended, whatever is still loaded", () => {
  expect(kioskScreenReport({ ...base, finished: true })).toEqual({ screen: "resting" });
  expect(kioskScreenReport({ ...base, finished: true, launch: { nodeId: "n" }, heldStatusShown: true })).toEqual({ screen: "resting" });
});

// 2026-11-15 (W8): the report carries the look the board portrait draws, so Elli can "look at her dress".
it("reports the companion's look the portrait is drawing, by name", () => {
  expect(kioskScreenReport({ ...base, companionLook: { outfit: "Sky Ribbon Dress", accessory: "none" } }))
    .toEqual({ screen: "board", boardId: "b2", boardTitle: "Long i Rescue", companionLook: { outfit: "Sky Ribbon Dress", accessory: "none" } });
  expect(kioskScreenReport({ ...base, companionLook: null })).toEqual({ screen: "board", boardId: "b2", boardTitle: "Long i Rescue" });
});

it("names a look from the store catalog, her own clothes when none", async () => {
  const { companionLookNames } = await import("../lib/boardPortraitLook");
  const { WARDROBE_STORE_CATALOG } = await import("../lib/wardrobeStore");
  const sky = WARDROBE_STORE_CATALOG.find((item) => item.id === "sky-ribbon-dress")!.asset as unknown as { outfitId: string; materialVariant?: { id: string; tint: string } };
  const ears = WARDROBE_STORE_CATALOG.find((item) => item.id === "cat-ears")!;
  expect(companionLookNames({ outfitId: sky.outfitId, outfitMaterialVariant: sky.materialVariant, accessoryId: "cat-ears" } as never))
    .toEqual({ outfit: "Sky Ribbon Dress", accessory: ears.name });
  expect(companionLookNames({ outfitId: "none", accessoryId: "none" })).toEqual({ outfit: "", accessory: "" });
});
