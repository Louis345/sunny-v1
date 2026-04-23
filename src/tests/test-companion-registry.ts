import { describe, it, expect } from "vitest";
import { CompanionRegistry } from "../prompts/companions/registry";

describe("CompanionRegistry", () => {
  it("discovers exactly 2 companions", () => {
    expect(CompanionRegistry.getAll().length).toBe(2);
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

  it("no hardcoded child names in any personality.md", () => {
    for (const c of CompanionRegistry.getAll()) {
      expect(c.personalityMarkdown).not.toMatch(/\bIla\b/);
      expect(c.personalityMarkdown).not.toMatch(/\bReina\b/);
    }
  });

  it("getGrowthModifier returns different strings across tiers", () => {
    const elli = CompanionRegistry.getById("elli");
    expect(elli.getGrowthModifier(1)).not.toBe(elli.getGrowthModifier(10));
  });

  it("elli defaultFor is ila", () => {
    expect(CompanionRegistry.getById("elli").defaultFor).toBe("ila");
  });
});
