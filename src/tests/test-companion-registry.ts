import { describe, it, expect } from "vitest";
import { CompanionRegistry } from "../prompts/companions/registry";
import { tryLoadIntroOnlyShowroomCompanion } from "../server/introOnlyShowroomCompanion";

describe("CompanionRegistry", () => {
  // Matilda is Hikari (owner, 2026-11-10): one companion, "matilda" is an alias.
  it("discovers all prompt companions (elli, hikari, showroom chars)", () => {
    expect(CompanionRegistry.getAll().length).toBe(7);
  });

  it("getById returns elli", () => {
    const elli = CompanionRegistry.getById("elli");
    expect(elli.id).toBe("elli");
    expect(elli.name).toBe("Elli");
    expect(elli.voiceId).toBeTruthy();
    expect(elli.unlockCost).toBe(0);
  });

  it("getById resolves the old id matilda to hikari, Reina's companion", () => {
    const hikari = CompanionRegistry.getById("matilda");
    expect(hikari.id).toBe("hikari");
    expect(hikari.defaultFor).toBe("reina");
  });

  it("getById returns yukari with configured voice", () => {
    const yukari = CompanionRegistry.getById("yukari");
    expect(yukari.id).toBe("yukari");
    expect(yukari.name).toBe("Yukari");
    expect(yukari.voiceId).toBe("piI8Kku0DcvcL6TTSeQt");
    expect(yukari.unlockCost).toBe(750);
  });

  it("getById throws for intro-only companion kefla (intro showroom only)", () => {
    expect(() => CompanionRegistry.getById("kefla")).toThrow(
      'CompanionRegistry: unknown companion "kefla"',
    );
  });

  it("tryLoadIntroOnlyShowroomCompanion returns voice meta for kefla", () => {
    const row = tryLoadIntroOnlyShowroomCompanion("kefla");
    expect(row).not.toBeNull();
    expect(row!.id).toBe("kefla");
    expect(row!.name).toBe("Kefla");
    expect(row!.voiceId.length).toBeGreaterThan(5);
    expect(row!.voiceModelId).toBeTruthy();
  });

  it("tryLoadIntroOnlyShowroomCompanion returns null for registry companions", () => {
    expect(tryLoadIntroOnlyShowroomCompanion("elli")).toBeNull();
    expect(tryLoadIntroOnlyShowroomCompanion("matilda")).toBeNull();
  });

  it("getById throws on unknown id", () => {
    expect(() => CompanionRegistry.getById("banana")).toThrow(
      'CompanionRegistry: unknown companion "banana"'
    );
  });

  it("every companion has personalityMarkdown", () => {
    for (const c of CompanionRegistry.getAll()) {
      expect(c.personalityMarkdown.length).toBeGreaterThan(50);
    }
  });

  it("keeps Elli child-neutral while preserving explicitly paired companions", () => {
    expect(CompanionRegistry.getById("elli").personalityMarkdown).not.toMatch(/\bIla\b|\bReina\b/);
    expect(CompanionRegistry.getById("elli").personalityMarkdown).toContain("active child");
    // Hikari is called by both girls on FaceTime, so her persona names neither child.
    expect(CompanionRegistry.getById("hikari").personalityMarkdown).not.toMatch(/\bIla\b|\bReina\b/);
  });

  it("getGrowthModifier returns different strings across tiers", () => {
    const elli = CompanionRegistry.getById("elli");
    expect(elli.getGrowthModifier(1)).not.toBe(elli.getGrowthModifier(10));
  });

  it("elli defaultFor is ila", () => {
    expect(CompanionRegistry.getById("elli").defaultFor).toBe("ila");
  });
});
