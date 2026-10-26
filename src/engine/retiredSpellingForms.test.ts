import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import * as assignmentPlanner from "./assignmentPlanner";

// 2026-10-24: every spelling board is now built through small locked tools. The old single forms
// stayed beside them as a second system: test-only and replay-only, yet still able to send an old
// form or buy a correction. Saved answers remain readable; nothing can send the old forms again.
const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("retired spelling single forms", () => {
  it("has no old intake form, prompt or correction loop to call", () => {
    for (const name of ["planSpellingIntakeFromSource", "buildSpellingIntakePrompt", "spellingIntakeToolJsonSchema", "spellingIntakeAuthoringSchema"]) expect(assignmentPlanner).not.toHaveProperty(name);
    expect(source("src/engine/assignmentPlanner.ts")).not.toContain("authoring-correction");
    for (const file of ["src/scripts/ingestHomework.ts", "src/scripts/prepareMondayPractice.ts"]) expect(source(file)).not.toContain("callPlannerModel");
  });
  it("never writes the old spelling Teaching or next-board prompt", () => {
    expect(source("src/engine/directMathExperience.ts")).not.toContain("Call create_learning_program exactly once");
    const runtime = source("src/engine/learningCycleRuntime.ts");
    expect(runtime).not.toContain("SPELLING_ORDER_BRIEF");
    expect(runtime).not.toContain("Correct only predictionEvaluationIds");
  });
});
