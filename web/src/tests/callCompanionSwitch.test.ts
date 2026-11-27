import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canSwitchShowroomCompanion } from "../components/CompanionShowroom";

// S42 (owner 2026-11-20: "FaceTime was abruptly interrupted"). Ila's earned call with Matilda, 11/20 01:45 UTC: 0.5 s
// after the call started listening, the call's own speech connection sent end_session (server: session_end 01:45:27.1),
// then the showroom's "Say Hi" intro was requested and the call returned to the map at 01:45:30. Inferred, not seen:
// a swipe on the stage, the ◀ ▶ arrows or an arrow key switched companion mid-call; that switch stops the call's
// listening and closes the call with no farewell and no log. Why the human caught it: the call she earned vanished.
// Why logs missed it: the switch logs only in the kiosk browser console, and the call's end had no cause until
// 82c42024. Why the lab missed it: no test touched the stage while a call was open.

describe("an open call cannot be swapped for another companion", () => {
  it("blocks switching while a call is open", () => {
    expect(canSwitchShowroomCompanion({ companionCount: 3, spotlightOpen: false, picking: false, callOpen: true })).toBe(false);
  });

  it("still lets her browse companions when no call is open", () => {
    expect(canSwitchShowroomCompanion({ companionCount: 3, spotlightOpen: false, picking: false, callOpen: false })).toBe(true);
  });

  it("keeps the old rules: one companion, the spotlight, or the picker block switching", () => {
    expect(canSwitchShowroomCompanion({ companionCount: 1, spotlightOpen: false, picking: false, callOpen: false })).toBe(false);
    expect(canSwitchShowroomCompanion({ companionCount: 3, spotlightOpen: true, picking: false, callOpen: false })).toBe(false);
    expect(canSwitchShowroomCompanion({ companionCount: 3, spotlightOpen: false, picking: true, callOpen: false })).toBe(false);
  });

  it("swipe, arrow keys and the arrow buttons all ask the same rule", () => {
    const source = readFileSync(resolve(__dirname, "../components/CompanionShowroom.tsx"), "utf8");
    const cycleBody = source.slice(source.indexOf("const cycle = useCallback("), source.indexOf("const cycle = useCallback(") + 400);
    expect(cycleBody).toContain("canSwitchShowroomCompanion(");
    expect(source).not.toMatch(/disabled=\{entries\.length <= 1 \|\| spotlightOpen \|\| picking\}/);
  });
});
