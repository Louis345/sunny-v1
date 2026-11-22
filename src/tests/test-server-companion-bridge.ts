import { describe, expect, it, vi } from "vitest";
import * as mapCoord from "../server/map-coordinator";
import { sessionEventBus } from "../server/session-event-bus";
import { ServerCompanionBridge } from "../server/companion-bridge";
import * as creatureCare from "../server/creatureCare";

describe("ServerCompanionBridge", () => {
  it("routes correct_answer to map broadcast via global EventBus", () => {
    const spy = vi.spyOn(mapCoord, "broadcastCompanionEventToMapChild");
    sessionEventBus.fire({
      type: "correct_answer",
      sessionId: "x",
      childId: "ila",
      timestamp: Date.now(),
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("reactive companion events still route on global bus (preview is write-gated elsewhere)", () => {
    const spy = vi.spyOn(mapCoord, "broadcastCompanionEventToMapChild");
    sessionEventBus.fire({
      type: "correct_answer",
      sessionId: "preview-session-id",
      childId: "ila",
      timestamp: Date.now(),
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("expressCompanion still sends when bridge attached", async () => {
    const spy = vi.spyOn(mapCoord, "broadcastCompanionEventToMapChild");
    const sent: string[] = [];
    const bridge = new ServerCompanionBridge();
    bridge.attach(
      "ila",
      (type) => {
        sent.push(type);
      },
      true,
    );
    await bridge.expressCompanion({ emote: "happy" });
    expect(sent).toContain("companion_event");
    expect(spy).toHaveBeenCalled();
    bridge.detach();
    spy.mockRestore();
  });

  // 2026-11-22: "Elli, bring out Sparky": the companion's pet call runs the den rules and tells the kiosk to show it.
  it("runs her pet call and tells the kiosk only when the pet really came out", async () => {
    const map = vi.spyOn(mapCoord, "broadcastCompanionEventToMapChild").mockImplementation(() => undefined);
    const summon = vi.spyOn(creatureCare, "summonPetForChild");
    const sent: string[] = [];
    const bridge = new ServerCompanionBridge();
    bridge.attach("ila", (type) => { sent.push(type); }, true);
    summon.mockReturnValueOnce({ ok: true, pet: "Sparky", pets: ["Sparky"] });
    expect(await bridge.companionAct({ type: "pet", payload: { action: "bring", name: "Sparky" } })).toMatchObject({ ok: true, pet: "Sparky" });
    expect(summon).toHaveBeenCalledWith("ila", { action: "bring", name: "Sparky" });
    expect(sent).toEqual(["companion_command"]);
    summon.mockReturnValueOnce({ ok: false, reason: "no_pet_by_that_name", pets: ["Sparky"] });
    expect(await bridge.companionAct({ type: "pet", payload: { action: "bring", name: "Rex" } })).toMatchObject({ ok: false, pets: ["Sparky"] });
    expect(sent).toEqual(["companion_command"]);
    bridge.detach();
    summon.mockRestore();
    map.mockRestore();
  });
});
