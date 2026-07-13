import { describe, expect, it } from "vitest";
import { buildContextStartGreeting } from "./session-bootstrap";

describe("homework context greeting", () => {
  it("uses live homework context and stays concise", () => {
    const greeting = buildContextStartGreeting({
      nodes: [{ locked: false, targetLane: "multiplication_fluency", words: ["5 x 2"] }],
    });
    expect(greeting).toContain("Multiplication Fluency");
    expect(greeting.split(/\s+/).length).toBeLessThanOrEqual(12);
  });

  it("falls back to the first challenge when context is sparse", () => {
    expect(buildContextStartGreeting({ nodes: [{ locked: false }] })).toBe(
      "Your first challenge is ready. Want to try it?",
    );
  });
});
