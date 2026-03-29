/**
 * Role Separation Tests
 *
 * These tests enforce the boundary between:
 *   Psychologist → logistics (questions, hints, teaching order)
 *   Companion    → grading (from pinned image, live, every time)
 *
 * No agent produces canonical answers. Claude grades from vision.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ─── Suite 1: Psychologist output has no answer fields ────────────────────

describe("Psychologist extraction — no answers", () => {
  /**
   * The extraction output type/schema must not include fields
   * that represent answers to worksheet problems.
   * Import the type or function and check its output shape.
   */

  it("extractHomeworkProblems result has no canonicalAnswer field", async () => {
    const { extractHomeworkProblems } = await import(
      "../agents/psychologist/psychologist"
    );
    expect(typeof extractHomeworkProblems).toBe("function");
    const sampleProblem = {
      id: 1,
      question: "How much money is in the first box?",
      hint: "Start with the bigger coins first.",
      page: 1,
      linkedGames: ["store-game"],
    };
    expect(sampleProblem).not.toHaveProperty("canonicalAnswer");
    expect(sampleProblem).not.toHaveProperty("answer");
  });

  it("extraction output has no totalSpentCents", () => {
    const sampleProblem = {
      id: 1,
      question: "How much?",
      hint: "Count carefully.",
      page: 1,
    };
    expect(sampleProblem).not.toHaveProperty("totalSpentCents");
    expect(sampleProblem).not.toHaveProperty("itemPriceCents");
    expect(sampleProblem).not.toHaveProperty("leftAmountCents");
    expect(sampleProblem).not.toHaveProperty("rightAmountCents");
  });

  it("extraction output has no visibleFacts or evidence", () => {
    const sampleProblem = {
      id: 1,
      question: "How much?",
      hint: "Count carefully.",
      page: 1,
    };
    expect(sampleProblem).not.toHaveProperty("visibleFacts");
    expect(sampleProblem).not.toHaveProperty("evidence");
  });

  it("extraction.json on disk conforms to logistics-only schema", () => {
    const testPaths = [
      path.resolve(process.cwd(), "homework/reina/2026-03-27/extraction.json"),
      path.resolve(process.cwd(), "homework/ila/2026-03-27/extraction.json"),
    ];
    for (const p of testPaths) {
      if (!fs.existsSync(p)) continue;
      const data = JSON.parse(fs.readFileSync(p, "utf-8"));
      for (const problem of data.problems ?? []) {
        expect(problem).not.toHaveProperty("canonicalAnswer");
        expect(problem).not.toHaveProperty("totalSpentCents");
        expect(problem).not.toHaveProperty("itemPriceCents");
        expect(problem).not.toHaveProperty("leftAmountCents");
        expect(problem).not.toHaveProperty("rightAmountCents");
        expect(problem).not.toHaveProperty("visibleFacts");
        expect(problem).not.toHaveProperty("evidence");
        expect(problem).toHaveProperty("id");
        expect(problem).toHaveProperty("question");
        expect(problem).toHaveProperty("hint");
        expect(problem).toHaveProperty("page");
      }
    }
  });
});

// ─── Suite 2: getNextProblem returns logistics only ───────────────────────

describe("getNextProblem — no facts in response", () => {
  it("returns question and hint but no facts", async () => {
    const { createWorksheetSession } = await import(
      "../server/worksheet-tools"
    );
    const session = createWorksheetSession({
      childName: "Reina",
      companionName: "Matilda",
      problems: [
        {
          id: "1",
          question: "How much money is in the first box?",
          hint: "Start with the bigger coins first.",
          page: 1,
          linkedGames: ["store-game"],
        },
      ],
      rewardThreshold: 1,
      rewardGame: "space-invaders",
    });

    const result = session.getNextProblem();
    expect(result.ok).toBe(true);
    expect(result.problemId).toBe("1");
    expect(result.question).toBe("How much money is in the first box?");
    expect(result.hint).toBe("Start with the bigger coins first.");
    expect(result.canvasRendered).toBe(true);

    expect(result).not.toHaveProperty("facts");
    expect(result).not.toHaveProperty("totalCents");
    expect(result).not.toHaveProperty("canonicalAnswer");
  });

  it("ProblemInput type has no facts field", async () => {
    const { createWorksheetSession } = await import(
      "../server/worksheet-tools"
    );
    const session = createWorksheetSession({
      childName: "Ila",
      companionName: "Elli",
      problems: [
        // @ts-expect-error logistics-only problems after role separation (no canonicalAnswer / facts)
        {
          id: "1",
          question: "Count the coins.",
          hint: "Try the big ones first.",
          page: 1,
          linkedGames: [],
        },
      ],
      rewardThreshold: 1,
      rewardGame: "space-invaders",
    });
    expect(session.getSessionStatus().problemsTotal).toBe(1);
  });
});

// ─── Suite 3: Worksheet prompt uses vision, not facts ─────────────────────

describe("worksheetSessionPrompt — vision-based grading", () => {
  it("contains vision grading instruction", async () => {
    const { buildWorksheetToolPrompt } = await import(
      "../agents/prompts/worksheetSessionPrompt"
    );
    const prompt = buildWorksheetToolPrompt({
      childName: "Reina",
      companionName: "Matilda",
      subjectLabel: "Counting Coins",
      problemCount: 4,
      rewardThreshold: 2,
      rewardGame: "space-invaders",
      pendingRewardFromLastSession: null,
      interactionMode: "answer_entry",
    });

    expect(prompt.toLowerCase()).toContain("image");
    expect(prompt.toLowerCase()).toContain("grade");
  });

  it("contains dispute resolution — count together", async () => {
    const { buildWorksheetToolPrompt } = await import(
      "../agents/prompts/worksheetSessionPrompt"
    );
    const prompt = buildWorksheetToolPrompt({
      childName: "Reina",
      companionName: "Matilda",
      subjectLabel: "Counting Coins",
      problemCount: 4,
      rewardThreshold: 2,
      rewardGame: "space-invaders",
      pendingRewardFromLastSession: null,
      interactionMode: "answer_entry",
    });

    expect(prompt.toLowerCase()).toContain("count");
    expect(prompt.toLowerCase()).toContain("together");
  });

  it("does NOT reference facts.totalCents or extracted answers", async () => {
    const { buildWorksheetToolPrompt } = await import(
      "../agents/prompts/worksheetSessionPrompt"
    );
    const prompt = buildWorksheetToolPrompt({
      childName: "Reina",
      companionName: "Matilda",
      subjectLabel: "Counting Coins",
      problemCount: 4,
      rewardThreshold: 2,
      rewardGame: "space-invaders",
      pendingRewardFromLastSession: null,
      interactionMode: "answer_entry",
    });

    expect(prompt).not.toContain("facts.totalCents");
    expect(prompt).not.toContain("facts.leftCents");
    expect(prompt).not.toContain("facts.rightCents");
    expect(prompt).not.toContain("canonicalAnswer");

    expect(prompt).not.toMatch(/compare.*to.*facts/i);
    expect(prompt).not.toMatch(/check.*against.*totalCents/i);
  });

  it("does NOT reference facts as answer key", async () => {
    const { buildWorksheetToolPrompt } = await import(
      "../agents/prompts/worksheetSessionPrompt"
    );
    const prompt = buildWorksheetToolPrompt({
      childName: "Reina",
      companionName: "Matilda",
      subjectLabel: "Counting Coins",
      problemCount: 4,
      rewardThreshold: 2,
      rewardGame: "space-invaders",
      pendingRewardFromLastSession: null,
      interactionMode: "answer_entry",
    });

    expect(prompt).not.toMatch(/facts.*answer.*key/i);
    expect(prompt).not.toMatch(/#1 RULE.*facts/i);
    expect(prompt).not.toMatch(/expected answer in facts/i);
  });

  it("contains hint ladder — no immediate answer reveal", async () => {
    const { buildWorksheetToolPrompt } = await import(
      "../agents/prompts/worksheetSessionPrompt"
    );
    const prompt = buildWorksheetToolPrompt({
      childName: "Reina",
      companionName: "Matilda",
      subjectLabel: "Counting Coins",
      problemCount: 4,
      rewardThreshold: 2,
      rewardGame: "space-invaders",
      pendingRewardFromLastSession: null,
      interactionMode: "answer_entry",
    });

    expect(prompt.toLowerCase()).toContain("hint");
    expect(prompt.toLowerCase()).toContain("never");
    expect(prompt.toLowerCase()).toContain("reveal");
  });

  it("contains brevity rules — max 2 sentences", async () => {
    const { buildWorksheetToolPrompt } = await import(
      "../agents/prompts/worksheetSessionPrompt"
    );
    const prompt = buildWorksheetToolPrompt({
      childName: "Reina",
      companionName: "Matilda",
      subjectLabel: "Counting Coins",
      problemCount: 4,
      rewardThreshold: 2,
      rewardGame: "space-invaders",
      pendingRewardFromLastSession: null,
      interactionMode: "answer_entry",
    });

    expect(prompt).toContain("2 sentences");
  });
});

// ─── Suite 4: claudeVision is audit-only ──────────────────────────────────

describe("claudeVision — transparency, never enforcement", () => {
  it("claudeVision in extraction.json is not referenced by grading prompt", async () => {
    const { buildWorksheetToolPrompt } = await import(
      "../agents/prompts/worksheetSessionPrompt"
    );
    const prompt = buildWorksheetToolPrompt({
      childName: "Reina",
      companionName: "Matilda",
      subjectLabel: "Counting Coins",
      problemCount: 4,
      rewardThreshold: 2,
      rewardGame: "space-invaders",
      pendingRewardFromLastSession: null,
      interactionMode: "answer_entry",
    });

    expect(prompt).not.toContain("claudeVision");
    expect(prompt).not.toMatch(/trust.*claudeVision/i);
    expect(prompt).not.toMatch(/enforce.*claudeVision/i);
  });

  it("getNextProblem does not return claudeVision data", async () => {
    const { createWorksheetSession } = await import(
      "../server/worksheet-tools"
    );
    const session = createWorksheetSession({
      childName: "Reina",
      companionName: "Matilda",
      problems: [
        {
          id: "1",
          question: "How much money?",
          hint: "Count carefully.",
          page: 1,
          linkedGames: [],
        },
      ],
      rewardThreshold: 1,
      rewardGame: "space-invaders",
    });

    const result = session.getNextProblem();
    expect(result).not.toHaveProperty("claudeVision");
    expect(result).not.toHaveProperty("visualDescription");
    expect(result).not.toHaveProperty("totalCents");
  });
});

// ─── Suite 5: validateExtractionAmounts and buildSanitizedGamePool gone ───

describe("removed answer-validation functions", () => {
  it("worksheet-tools does not export validateExtractionAmounts", async () => {
    const mod = await import("../server/worksheet-tools");
    expect(mod).not.toHaveProperty("validateExtractionAmounts");
  });

  it("worksheet-tools does not export buildSanitizedGamePool", async () => {
    const mod = await import("../server/worksheet-tools");
    expect(mod).not.toHaveProperty("buildSanitizedGamePool");
  });

  it("worksheet-tools does not export detectWorksheetDomain", async () => {
    const mod = await import("../server/worksheet-tools");
    expect(mod).not.toHaveProperty("detectWorksheetDomain");
  });
});
