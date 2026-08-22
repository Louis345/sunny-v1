import { describe, expect, it } from "vitest";
import { COMPANION_MANIFEST } from "../companion/companions.generated";
import {
  WARDROBE_BODY_PROFILES,
  WARDROBE_COMPANION_BODY_ASSIGNMENTS,
  WARDROBE_COMPATIBILITY_CASES,
  resolveWardrobeBodyProfileId,
} from "../lib/wardrobeBodyProfiles";

describe("wardrobe body profiles", () => {
  it("classifies every showroom companion and both of its model contracts", () => {
    expect(Object.keys(WARDROBE_COMPANION_BODY_ASSIGNMENTS).sort()).toEqual(
      COMPANION_MANIFEST.map((entry) => entry.id).sort(),
    );

    for (const entry of COMPANION_MANIFEST) {
      const assignment = WARDROBE_COMPANION_BODY_ASSIGNMENTS[entry.id];
      expect(assignment?.activeModelUrl).toBe(
        entry.companionConfig?.vrmUrl ?? entry.vrmUrl,
      );
      expect(assignment?.sourceModelUrl).toBe(entry.vrmUrl);
      expect(WARDROBE_BODY_PROFILES[assignment!.activeBodyProfileId]).toBeTruthy();
      expect(WARDROBE_BODY_PROFILES[assignment!.sourceBodyProfileId]).toBeTruthy();
    }
  });

  it("keeps unknown or unreviewed models outside approved store profiles", () => {
    expect(resolveWardrobeBodyProfileId("/companions/sample.vrm")).toBe(
      "sunny-standard-v1",
    );
    expect(resolveWardrobeBodyProfileId("/companions/Kefla.vrm")).toBe("kefla-v1");
    expect(resolveWardrobeBodyProfileId("/companions/unknown.vrm")).toBeNull();
  });

  it("builds one full-size review case per character plus the approved reference", () => {
    expect(WARDROBE_COMPATIBILITY_CASES).toHaveLength(
      COMPANION_MANIFEST.length + 1,
    );
    expect(WARDROBE_COMPATIBILITY_CASES[0]).toMatchObject({
      id: "elli-store-reference",
      modelUrl: "/companions/sample.vrm",
      bodyProfileId: "sunny-standard-v1",
      dressQaStatus: "approved",
    });
    expect(
      WARDROBE_COMPATIBILITY_CASES.filter((testCase) => testCase.kind === "source")
        .map((testCase) => testCase.companionId)
        .sort(),
    ).toEqual(COMPANION_MANIFEST.map((entry) => entry.id).sort());
    expect(
      WARDROBE_COMPATIBILITY_CASES.filter((testCase) => testCase.kind === "source")
        .every((testCase) => testCase.dressQaStatus === "candidate"),
    ).toBe(true);
  });
});
