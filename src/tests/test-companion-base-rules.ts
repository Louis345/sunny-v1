/**
 * BUG 4 — companion-base.md must contain GAME_REVEAL_RULE.
 * Matilda must never state the target word or letters while a game is active.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const companionBase = readFileSync(
  resolve(__dirname, "../../src/souls/companion-base.md"),
  "utf8",
);

describe("companion-base.md rules (BUG 4)", () => {
  it("contains GAME_REVEAL_RULE", () => {
    expect(companionBase).toContain("GAME_REVEAL_RULE");
  });

  it("GAME_REVEAL_RULE forbids narrating target word", () => {
    const ruleIdx = companionBase.indexOf("GAME_REVEAL_RULE");
    const ruleSection = companionBase.slice(ruleIdx, ruleIdx + 400);
    expect(ruleSection.toLowerCase()).toContain("target word");
  });

  it("GAME_REVEAL_RULE applies during active game", () => {
    const ruleIdx = companionBase.indexOf("GAME_REVEAL_RULE");
    const ruleSection = companionBase.slice(ruleIdx, ruleIdx + 400);
    expect(ruleSection.toLowerCase()).toContain("game");
  });
});
