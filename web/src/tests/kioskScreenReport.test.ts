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
