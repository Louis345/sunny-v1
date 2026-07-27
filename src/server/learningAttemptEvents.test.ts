import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeLearningAttemptEvent, recordLearningAttempt } from "./learningAttemptEvents";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function seedChild(rootDir: string, childId: string): void {
  const base = path.join(rootDir, "src", "context", childId);
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(
    path.join(base, "child_profile.json"),
    JSON.stringify({
      childId,
      identity: { displayName: "Demo", ttsName: "Demo" },
      chartLinks: {
        learningProfile: "learning_profile.json",
        wordBank: "word_bank.json",
        factBank: "fact_bank.json",
        currentHomework: "homework/current.json",
        currentSessionPlan: "plans/active_session_plan.json",
        currentCarePlan: "care_plan/current.json",
        contentCatalog: "content_catalog.json",
      },
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(base, "learning_profile.json"), JSON.stringify({ childId }), "utf8");
  fs.writeFileSync(path.join(base, "word_bank.json"), JSON.stringify({ childId, version: 1, words: [] }), "utf8");
  fs.writeFileSync(path.join(base, "fact_bank.json"), JSON.stringify({ childId, version: 1, lastUpdated: "", facts: [] }), "utf8");
}

describe("recordLearningAttempt math branch", () => {
  it("accepts the generated-math targetId alias without losing target identity", () => {
    const recorded = normalizeLearningAttemptEvent({
      childId: "reina",
      domain: "math",
      targetId: "item-5x4",
      attemptedValue: "20",
      correct: true,
    });

    expect(recorded.attempt.word).toBe("item-5x4");
    expect(recorded.attempt.attemptedValue).toBe("20");
  });

  it("routes math domain attempts to fact bank instead of word bank", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-attempt-math-"));
    tempDirs.push(rootDir);
    seedChild(rootDir, "demo-pashley");

    const recorded = recordLearningAttempt(
      {
        childId: "demo-pashley",
        attemptId: `test-math-attempt-${Date.now()}`,
        target: "5 x 2",
        domain: "math",
        correct: true,
        quality: 5,
        attemptedValue: "10",
      },
      undefined,
      { rootDir },
    );

    expect(recorded.skipped).toBe(false);
    const bank = JSON.parse(
      fs.readFileSync(path.join(rootDir, "src", "context", "demo-pashley", "fact_bank.json"), "utf8"),
    );
    expect(bank.facts.some((fact: { prompt: string }) => fact.prompt === "5 x 2")).toBe(true);
  });
});
