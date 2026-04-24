import { describe, expect, it } from "vitest";
import { generateCompanionCapabilities } from "../shared/companions/generateCompanionCapabilities";
import { COMPANION_CAPABILITIES } from "../shared/companions/registry";
import { ANIMATION_IDS } from "../shared/companions/animations.generated";
import { z } from "zod";

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

  it("animate capability schema only accepts FBX-backed animation IDs from animations.generated.ts", () => {
    const animateDef = COMPANION_CAPABILITIES.get("animate");
    if (!animateDef) throw new Error("animate capability not registered");

    // Every ANIMATION_IDS entry is valid
    for (const id of ANIMATION_IDS) {
      const result = animateDef.payloadSchema.safeParse({ animation: id });
      expect(result.success, `expected ${id} to be valid`).toBe(true);
    }

    // A conceptual name without an FBX (e.g. "walk") is rejected
    const rejected = animateDef.payloadSchema.safeParse({ animation: "walk" });
    expect(rejected.success).toBe(false);
  });

  it("animate capability diagControls options match ANIMATION_IDS", () => {
    const animateDef = COMPANION_CAPABILITIES.get("animate");
    if (!animateDef) throw new Error("animate capability not registered");

    const dropdown = animateDef.diagControls.find(
      (c) => c.kind === "dropdown" && c.key === "animation",
    );
    expect(dropdown).toBeDefined();
    if (dropdown?.kind !== "dropdown") throw new Error("not a dropdown");

    expect(new Set(dropdown.options)).toEqual(new Set(ANIMATION_IDS));
  });
});
