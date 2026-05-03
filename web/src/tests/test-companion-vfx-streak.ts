import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CompanionEventPayload } from "../../../src/shared/companionTypes";
import {
  resolveSaiyanVfxLevel,
  shouldUseSaiyanVfx,
} from "../companion/companionVfxState";

function event(
  trigger: CompanionEventPayload["trigger"],
  metadata: Record<string, unknown> = {},
): CompanionEventPayload {
  return {
    trigger,
    metadata,
    childId: "reina",
    timestamp: Date.now(),
  };
}

describe("companion streak VFX state", () => {
  it("keeps non-Saiyan companions out of Kefla's streak aura", () => {
    expect(shouldUseSaiyanVfx("matilda")).toBe(false);
    expect(resolveSaiyanVfxLevel({ companionId: "matilda", correctStreak: 5 }))
      .toBe("idle");
  });

  it("maps Kefla streaks into visible Saiyan aura levels", () => {
    expect(resolveSaiyanVfxLevel({ companionId: "kefla", correctStreak: 0 }))
      .toBe("idle");
    expect(resolveSaiyanVfxLevel({ companionId: "kefla", correctStreak: 2 }))
      .toBe("focused");
    expect(resolveSaiyanVfxLevel({ companionId: "kefla", correctStreak: 3 }))
      .toBe("powered_up");
    expect(resolveSaiyanVfxLevel({ companionId: "kefla", correctStreak: 5 }))
      .toBe("limit_break");
  });

  it("can derive the streak from companion event metadata", () => {
    expect(resolveSaiyanVfxLevel({
      companionId: "kefla",
      companionEvents: [event("correct_answer", { correctStreak: 5 })],
    })).toBe("limit_break");
  });

  it("drops the aura immediately after the newest event is a miss", () => {
    expect(resolveSaiyanVfxLevel({
      companionId: "kefla",
      correctStreak: 5,
      companionEvents: [
        event("correct_answer", { correctStreak: 5 }),
        event("wrong_answer"),
      ],
    })).toBe("idle");
  });

  it("wires streak mode through the live VFX layer without animation or bone pose APIs", () => {
    const companionLayerSource = readFileSync(
      resolve(__dirname, "../components/CompanionLayer.tsx"),
      "utf8",
    );
    const vfxStateSource = readFileSync(
      resolve(__dirname, "../companion/companionVfxState.ts"),
      "utf8",
    );

    expect(companionLayerSource).toContain("resolveSaiyanVfxLevel");
    expect(companionLayerSource).toContain("correctStreak");
    expect(companionLayerSource).toContain('new CompanionVfxLayer("yellow_power_aura")');
    expect(vfxStateSource).not.toContain("playAnimation");
    expect(vfxStateSource).not.toContain("createShowroomAnimateCommand");
    expect(vfxStateSource).not.toContain("getNormalizedBoneNode");
    expect(vfxStateSource).not.toContain("leftUpperArm");
    expect(vfxStateSource).not.toContain("rightUpperArm");
  });
});
