import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { recordFactAttempt } from "./factBankRecorder";

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
  fs.writeFileSync(
    path.join(base, "learning_profile.json"),
    JSON.stringify({ childId, algorithmParams: { sm2: { defaultEasinessFactor: 2.5, minEasinessFactor: 1.3, intervalModifier: 1, maxNewWordsPerSession: 5, maxReviewWordsPerSession: 12 } } }),
    "utf8",
  );
  fs.writeFileSync(path.join(base, "word_bank.json"), JSON.stringify({ childId, version: 1, words: [] }), "utf8");
  fs.writeFileSync(path.join(base, "fact_bank.json"), JSON.stringify({ childId, version: 1, lastUpdated: "", facts: [] }), "utf8");
}

describe("recordFactAttempt", () => {
  it("writes math facts into fact_bank.json with SM2 schedule", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-fact-bank-"));
    tempDirs.push(rootDir);
    seedChild(rootDir, "demo-pashley");

    recordFactAttempt(
      { childId: "demo-pashley", prompt: "5 x 2", answer: "10", correct: true, quality: 5 },
      { rootDir },
    );

    const bankPath = path.join(rootDir, "src", "context", "demo-pashley", "fact_bank.json");
    const bank = JSON.parse(fs.readFileSync(bankPath, "utf8"));
    expect(bank.facts).toHaveLength(1);
    expect(bank.facts[0].prompt).toBe("5 x 2");
    expect(bank.facts[0].tracks.math.nextReviewDate).toBeTruthy();
    expect(bank.facts[0].tracks.math.interval).toBeGreaterThan(0);
  });
});
