import { describe, expect, it } from "vitest";
import { COMPANION_CAPABILITIES } from "../shared/companions/registry";
import { validateCompanionCommand } from "../shared/companions/validateCompanionCommand";

describe("validateCompanionCommand (COMPANION-API-006)", () => {
  it("accepts valid emote payload", () => {
    const cmd = validateCompanionCommand(
      { type: "emote", payload: { emote: "happy", intensity: 0.5 } },
      COMPANION_CAPABILITIES,
      { childId: "ila", source: "claude", now: 100 },
    );
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe("emote");
    expect(cmd!.payload.emote).toBe("happy");
    expect(cmd!.childId).toBe("ila");
    expect(cmd!.timestamp).toBe(100);
    expect(cmd!.source).toBe("claude");
  });

  it("applies default intensity for emote when omitted", () => {
    const cmd = validateCompanionCommand(
      { type: "emote", payload: { emote: "neutral" } },
      COMPANION_CAPABILITIES,
      { childId: "ila", source: "diag" },
    );
    expect(cmd).not.toBeNull();
    expect(cmd!.payload.intensity).toBe(0.8);
  });

  it("returns null for unknown capability type", () => {
    expect(
      validateCompanionCommand(
        { type: "teleport", payload: {} },
        COMPANION_CAPABILITIES,
        { childId: "ila", source: "claude" },
      ),
    ).toBeNull();
  });

  it("returns null for invalid emote", () => {
    expect(
      validateCompanionCommand(
        { type: "emote", payload: { emote: "not_real", intensity: 0.5 } },
        COMPANION_CAPABILITIES,
        { childId: "ila", source: "claude" },
      ),
    ).toBeNull();
  });

  it("returns null when payload is not an object", () => {
    expect(
      validateCompanionCommand(
        { type: "emote", payload: "nope" },
        COMPANION_CAPABILITIES,
        { childId: "ila", source: "claude" },
      ),
    ).toBeNull();
  });

  it("accepts valid camera payload", () => {
    const cmd = validateCompanionCommand(
      {
        type: "camera",
        payload: { angle: "close-up", transition_ms: 300 },
      },
      COMPANION_CAPABILITIES,
      { childId: "reina", source: "claude" },
    );
    expect(cmd).not.toBeNull();
    expect(cmd!.payload.angle).toBe("close-up");
  });
});
