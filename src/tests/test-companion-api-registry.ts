import { describe, expect, it } from "vitest";
import type { CapabilityDefinition, CompanionCommand } from "../shared/companions/companionContract";
import { COMPANION_CAPABILITIES } from "../shared/companions/registry";

describe("companion capability registry (COMPANION-API-002)", () => {
  it("exports COMPANION_CAPABILITIES as a Map", () => {
    expect(COMPANION_CAPABILITIES).toBeInstanceOf(Map);
  });

  it("returns undefined for unknown capability type", () => {
    expect(COMPANION_CAPABILITIES.get("teleport")).toBeUndefined();
    expect(COMPANION_CAPABILITIES.get("")).toBeUndefined();
  });

  it("registers emote, camera, animate, move", () => {
    expect(COMPANION_CAPABILITIES.size).toBe(4);
    expect(COMPANION_CAPABILITIES.has("emote")).toBe(true);
    expect(COMPANION_CAPABILITIES.has("camera")).toBe(true);
    expect(COMPANION_CAPABILITIES.has("animate")).toBe(true);
    expect(COMPANION_CAPABILITIES.has("move")).toBe(true);
  });

  it("CompanionCommand shape is structurally valid when stamped by server", () => {
    const cmd: CompanionCommand = {
      apiVersion: "1.0",
      type: "emote",
      payload: { emote: "happy", intensity: 0.8 },
      childId: "ila",
      timestamp: 1_700_000_000_000,
      source: "claude",
    };
    expect(cmd.apiVersion).toBe("1.0");
    expect(cmd.source).toBe("claude");
  });

  it("CapabilityDefinition requires unique type string (contract only)", () => {
    const mockSchema = {
      _def: {},
      parse: (x: unknown) => x,
    } as unknown as CapabilityDefinition["payloadSchema"];
    const def: CapabilityDefinition = {
      type: "test",
      version: "1.0",
      phase: 0.5,
      description: "test",
      whenToUse: ["when testing"],
      payloadSchema: mockSchema,
      defaultPayload: {},
      diagLabel: "Test",
      diagControls: [],
    };
    expect(def.type).toBe("test");
  });
});
