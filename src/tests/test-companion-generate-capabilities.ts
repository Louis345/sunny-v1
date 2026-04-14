import { describe, expect, it } from "vitest";
import { generateCompanionCapabilities } from "../shared/companions/generateCompanionCapabilities";

describe("generateCompanionCapabilities (COMPANION-API-005)", () => {
  it("includes emote and camera for phase 0.5 prompt", () => {
    const md = generateCompanionCapabilities(0.5);
    expect(md).toContain("### emote");
    expect(md).toContain("### camera");
    expect(md).toContain("companionAct");
    expect(md).not.toContain("### animate");
    expect(md).not.toContain("### move");
  });

  it("includes phase 1 capabilities when maxPhase is 1", () => {
    const md = generateCompanionCapabilities(1);
    expect(md).toContain("### animate");
    expect(md).toContain("### move");
  });
});
