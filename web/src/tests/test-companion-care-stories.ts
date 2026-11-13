import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const storyPath = resolve(
  __dirname,
  "../stories/CompanionCareStates.stories.tsx",
);

describe("Companion care Storybook visual lab", () => {
  it("provides the approved deterministic care-state stories", () => {
    expect(existsSync(storyPath)).toBe(true);
    if (!existsSync(storyPath)) return;

    const source = readFileSync(storyPath, "utf8");
    for (const story of [
      "Steady",
      "Hungry",
      "Tired",
      "Restored",
      "HungryToRestoredFeeding",
      "StateComparison",
      "SadIdleCandidate",
      "RejectedCandidate",
      "RejectedExpressionAudition",
      "TamagotchiCareLoopPreview",
      "CompatibilityVrm",
      "ReducedMotion",
      "MissingAnimationFallback",
    ]) {
      expect(source).toContain(`export const ${story}`);
    }
  });

  it("exposes the complete no-persistence Tamagotchi preview controls", () => {
    if (!existsSync(storyPath)) return;

    const source = readFileSync(storyPath, "utf8");
    for (const control of [
      "Advance time",
      "Complete assignment",
      "Give apple",
      "Replay feeding",
      "Trigger reaction",
      "Reset",
      "Care meter",
      "Gift progress",
    ]) {
      expect(source).toContain(control);
    }
    expect(source).toContain("companion_care_completed");
    expect(source).toContain("No profile, inventory, or assignment APIs");
  });

  it("uses production companion rendering with local fixtures only", () => {
    if (!existsSync(storyPath)) return;

    const source = readFileSync(storyPath, "utf8");
    expect(source).toContain("CompanionLayer");
    expect(source).toContain("deriveCompanionBehavior");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("/api/");
  });

  it("exposes the human-review controls from the approved plan", () => {
    if (!existsSync(storyPath)) return;

    const source = readFileSync(storyPath, "utf8");
    for (const control of [
      "companionId",
      "careState",
      "hunger",
      "energy",
      "expression",
      "baseAnimation",
      "playbackRate",
      "movementIntensity",
      "cameraFraming",
      "reducedMotion",
    ]) {
      expect(source).toContain(control);
    }
  });

  it("provides visible expression buttons for rejected-animation auditioning", () => {
    if (!existsSync(storyPath)) return;

    const source = readFileSync(storyPath, "utf8");
    expect(source).toContain("expression-${emote}");
    expect(source).toContain("ExpressionAuditionStage");
  });
});
