import { describe, it, expect } from "vitest";
import { CompanionRegistry } from "../prompts/companions/registry";

describe("CompanionRegistry", () => {
  it("discovers all prompt companions (elli, matilda, showroom chars)", () => {
    expect(CompanionRegistry.getAll().length).toBe(6);
  });

  it("getById returns elli", () => {
    const elli = CompanionRegistry.getById("elli");
    expect(elli.id).toBe("elli");
    expect(elli.name).toBe("Elli");
    expect(elli.voiceId).toBeTruthy();
    expect(elli.unlockCost).toBe(0);
  });

  it("getById returns matilda", () => {
    const matilda = CompanionRegistry.getById("matilda");
    expect(matilda.id).toBe("matilda");
    expect(matilda.defaultFor).toBe("reina");
  });

  it("getById returns yukari with configured voice", () => {
    const yukari = CompanionRegistry.getById("yukari");
    expect(yukari.id).toBe("yukari");
    expect(yukari.name).toBe("Yukari");
    expect(yukari.voiceId).toBe("piI8Kku0DcvcL6TTSeQt");
    expect(yukari.unlockCost).toBe(750);
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

  it("each personality names only its paired learner", () => {
    expect(CompanionRegistry.getById("elli").personalityMarkdown).toMatch(/\bIla\b/);
    expect(CompanionRegistry.getById("elli").personalityMarkdown).not.toMatch(
      /\bReina\b/,
    );
    expect(CompanionRegistry.getById("matilda").personalityMarkdown).toMatch(
      /\bReina\b/,
    );
    expect(CompanionRegistry.getById("matilda").personalityMarkdown).not.toMatch(
      /\bIla\b/,
    );
  });

  it("getGrowthModifier returns different strings across tiers", () => {
    const elli = CompanionRegistry.getById("elli");
    expect(elli.getGrowthModifier(1)).not.toBe(elli.getGrowthModifier(10));
  });

  it("elli defaultFor is ila", () => {
    expect(CompanionRegistry.getById("elli").defaultFor).toBe("ila");
  });
});
