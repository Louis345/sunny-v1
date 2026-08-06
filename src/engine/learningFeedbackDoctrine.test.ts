import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("learning feedback-loop authority", () => {
  const root = process.cwd();

  it("is required reading from both architecture entry points", () => {
    for (const file of ["AGENTS.md", "ARCHITECTURE.md"]) {
      expect(fs.readFileSync(path.join(root, file), "utf8")).toContain("LEARNING_FEEDBACK_LOOP.md");
    }
  });

  it("defines one canonical many-to-many loop without a second writable factsheet", () => {
    const doctrine = fs.readFileSync(path.join(root, "LEARNING_FEEDBACK_LOOP.md"), "utf8");
    expect(doctrine).toContain("sole normative");
    expect(doctrine).toContain("many-to-many");
    expect(doctrine).toContain("No second writable factsheet");
    expect(doctrine).toContain("prediction");
    expect(doctrine).toContain("returned graded work");
  });
});
