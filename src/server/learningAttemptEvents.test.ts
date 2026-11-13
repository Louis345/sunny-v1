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

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

describe("recordLearningAttempt math branch", () => {
  it("normalizes the exact canonical Hatch Hunt browser attempt payload", () => {
    const recorded = normalizeLearningAttemptEvent({
      attemptId: "hatch-hunt:science:attempt-1",
      childId: "reina",
      domain: "science",
      target: "science.ecosystems.food_chains",
      attemptedValue: "producer",
      correct: true,
      quality: 4,
      scaffoldLevel: 1,
      responseTimeMs: 1200,
      sessionId: "encounter:reina:science:1",
    });

    expect(recorded.attempt).toMatchObject({
      word: "science.ecosystems.food_chains",
      domain: "science",
      attemptedValue: "producer",
      correct: true,
      scaffoldLevel: 1,
      responseTimeMs: 1200,
    });
  });

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

  it("retains a practice-only math observation without mutating fact-bank mastery state", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-attempt-practice-math-"));
    tempDirs.push(rootDir);
    seedChild(rootDir, "demo-pashley");
    const factBankPath = path.join(rootDir, "src", "context", "demo-pashley", "fact_bank.json");
    const before = {
      childId: "demo-pashley",
      version: 1,
      lastUpdated: "2026-08-01T00:00:00.000Z",
      facts: [{
        factId: "5_x_2::10",
        prompt: "5 x 2",
        answer: "10",
        domain: "math",
        tracks: { math: { interval: 24, repetition: 5, mastered: true } },
      }],
    };
    fs.writeFileSync(factBankPath, JSON.stringify(before), "utf8");

    recordLearningAttempt({
      childId: "demo-pashley",
      attemptId: "hatch-practice-math-1",
      encounterId: "encounter:math:1",
      domain: "math",
      target: "5 x 2",
      attemptedValue: "10",
      correct: true,
      scaffoldLevel: 0,
      responseTimeMs: 875,
      maximumClaim: "practice_only",
      masteryClaimAllowed: false,
      homeworkId: "hw-math-1",
      sourceEvidenceIds: ["worksheet:item-1"],
    }, undefined, { rootDir });

    expect(readJson(factBankPath)).toEqual(before);
    const attemptsDir = path.join(rootDir, "src", "context", "demo-pashley", "attempts");
    const observation = JSON.parse(fs.readFileSync(path.join(attemptsDir, fs.readdirSync(attemptsDir)[0]!), "utf8").trim());
    expect(observation).toMatchObject({
      word: "5 x 2",
      domain: "math",
      evidenceLimit: "practice_only",
      attemptId: "hatch-practice-math-1",
      encounterId: "encounter:math:1",
      responseTimeMs: 875,
      scaffoldLevel: 0,
      homeworkId: "hw-math-1",
      sourceEvidenceIds: ["worksheet:item-1"],
    });
  });

  it("retains a practice-only science observation without mutating word-bank mastery state", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-attempt-practice-science-"));
    tempDirs.push(rootDir);
    seedChild(rootDir, "demo-pashley");
    const wordBankPath = path.join(rootDir, "src", "context", "demo-pashley", "word_bank.json");
    const before = {
      childId: "demo-pashley",
      version: 1,
      words: [{
        word: "science.ecosystems.food_chains",
        addedAt: "2026-08-01T00:00:00.000Z",
        source: "worksheet",
        tracks: { science: { interval: 1, repetition: 0, mastered: false } },
      }],
    };
    fs.writeFileSync(wordBankPath, JSON.stringify(before), "utf8");

    recordLearningAttempt({
      childId: "demo-pashley",
      attemptId: "hatch-practice-science-1",
      encounterId: "encounter:science:1",
      domain: "science",
      target: "science.ecosystems.food_chains",
      attemptedValue: "producer",
      correct: true,
      scaffoldLevel: 1,
      responseTimeMs: 1400,
      maximumClaim: "practice_only",
      masteryClaimAllowed: false,
      homeworkId: "hw-science-1",
      sourceEvidenceIds: ["worksheet:item-2"],
    }, undefined, { rootDir });

    expect(readJson(wordBankPath)).toEqual(before);
    const attemptsDir = path.join(rootDir, "src", "context", "demo-pashley", "attempts");
    const observation = JSON.parse(fs.readFileSync(path.join(attemptsDir, fs.readdirSync(attemptsDir)[0]!), "utf8").trim());
    expect(observation).toMatchObject({
      word: "science.ecosystems.food_chains",
      domain: "science",
      evidenceLimit: "practice_only",
      attemptId: "hatch-practice-science-1",
      encounterId: "encounter:science:1",
      responseTimeMs: 1400,
      scaffoldLevel: 1,
      homeworkId: "hw-science-1",
      sourceEvidenceIds: ["worksheet:item-2"],
    });
  });
});
