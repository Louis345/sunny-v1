import { describe, expect, it } from "vitest";
import {
  COMPANION_MOVE_OFFSETS,
  mapAnimationToEmote,
  moveSpeedToLerpPerFrame,
  isCompanionAnimationId,
} from "../shared/companions/companionAnimateBridge";

describe("companionAnimateBridge (COMPANION-API-009)", () => {
  it("maps known animations to emotes", () => {
    expect(mapAnimationToEmote("dance_victory")).toBe("happy");
    expect(mapAnimationToEmote("think")).toBe("thinking");
    expect(mapAnimationToEmote("jump")).toBe("surprised");
    expect(mapAnimationToEmote("wave")).toBe("happy");
    expect(mapAnimationToEmote("idle")).toBe("neutral");
  });

  it("rejects unknown animation ids", () => {
    expect(mapAnimationToEmote("tPose")).toBeNull();
    expect(isCompanionAnimationId("tPose")).toBe(false);
  });

  it("move speed lerp ordering slow < normal < fast", () => {
    const slow = moveSpeedToLerpPerFrame("slow");
    const normal = moveSpeedToLerpPerFrame("normal");
    const fast = moveSpeedToLerpPerFrame("fast");
    expect(slow).toBeLessThan(normal);
    expect(normal).toBeLessThan(fast);
  });

  it("defines offsets for diag move targets", () => {
    expect(COMPANION_MOVE_OFFSETS.center).toEqual({ x: 0, z: 0 });
    expect(COMPANION_MOVE_OFFSETS.castle).toBeDefined();
    expect(COMPANION_MOVE_OFFSETS.node_1).toBeDefined();
  });
});
