import { describe, expect, it } from "vitest";
import { createEmptyFactBank } from "../context/schemas/factBank";
import { sm2Facts } from "../algorithms/sm2Facts";

describe("sm2Facts", () => {
  it("returns due math facts for review sessions", () => {
    const today = new Date().toISOString().slice(0, 10);
    const bank = createEmptyFactBank("demo-pashley");
    bank.facts.push({
      factId: "5x2::10",
      prompt: "5 x 2",
      answer: "10",
      domain: "math",
      tracks: {
        math: {
          interval: 1,
          easinessFactor: 2.5,
          nextReviewDate: today,
        },
      },
    });
    const result = sm2Facts(bank);
    expect(result.dueFacts).toHaveLength(1);
    expect(result.dueFacts[0]?.prompt).toBe("5 x 2");
  });
});
