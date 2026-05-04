import { describe, expect, it } from "vitest";
import { buildProfile } from "../profiles/buildProfile";

describe("profile companionCare view", () => {
  it("buildProfile exposes companionCare while preserving legacy mirrors", async () => {
    const profile = await buildProfile("reina");

    expect(profile).not.toBeNull();
    if (!profile) return;
    expect(profile.companionCare).toBeDefined();
    if (!profile.companionCare) return;
    expect(profile.companionCare).toMatchObject({
      childId: "reina",
      companionId: "matilda",
      vitals: expect.objectContaining({
        hunger: expect.any(Number),
        mood: expect.any(Number),
        bond: expect.any(Number),
        energy: expect.any(Number),
        usefulness: expect.any(Number),
        thoughtClarity: expect.any(Number),
      }),
      inventory: expect.objectContaining({
        food: expect.arrayContaining([
          expect.objectContaining({ id: "apple_bite", label: "Apple Bite" }),
        ]),
      }),
      readiness: expect.objectContaining({
        canContinueTired: true,
      }),
    });
    expect(profile.tamagotchi?.hunger).toBe(profile.companionCare.vitals.hunger);
    expect(profile.companionCurrency).toBe(profile.companionCare.economy.coins);
    expect(profile.care_plan?.companion_care).toBe(profile.companionCare);
    expect(profile.companionContext).toContain("Mood behavior policy");
    expect(profile.companionContext).toContain("never guilt");
  });
});
