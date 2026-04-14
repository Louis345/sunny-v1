import { describe, expect, it } from "vitest";
import { COMPANION_API_VERSION } from "../shared/companions/companionContract";
import { COMPANION_CAPABILITIES } from "../shared/companions/registry";

describe("COMPANION-API-001: companionContract + registry barrel", () => {
  it("exposes runtime COMPANION_API_VERSION as 1.0", () => {
    expect(COMPANION_API_VERSION).toBe("1.0");
  });

  it("exports COMPANION_CAPABILITIES as a Map", () => {
    expect(COMPANION_CAPABILITIES).toBeInstanceOf(Map);
  });

  it("registry keys are unique (no duplicate capability types)", () => {
    const keys = [...COMPANION_CAPABILITIES.keys()];
    expect(new Set(keys).size).toBe(keys.length);
  });
});
