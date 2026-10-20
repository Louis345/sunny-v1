import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setupRoutes } from "./routes";

vi.mock("../utils/learningProfileIO", () => ({
  readLearningProfile: vi.fn(),
  writeLearningProfile: vi.fn(),
}));

describe("activity config route", () => {
  const roots: string[] = [];
  const servers: Array<{ close: () => void }> = [];
  const originalCwd = process.cwd();

  afterEach(() => {
    process.chdir(originalCwd);
    for (const server of servers.splice(0)) server.close();
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  async function getJson(route: string) {
    const app = express();
    app.use(express.json());
    setupRoutes(app);
    const server = app.listen(0);
    servers.push(server);
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}${route}`);
    return {
      status: res.status,
      body: await res.json() as Record<string, unknown>,
    };
  }

  function writeGameConfig(root: string, childId: string, homeworkId: string, filename: string, config: unknown) {
    const file = path.join(
      root,
      "src/context",
      childId,
      "homework/games",
      homeworkId,
      filename,
    );
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(config), "utf8");
  }

  function validLetterRushConfig(overrides: Record<string, unknown> = {}) {
    return {
      schemaVersion: 1,
      activityId: "letter-rush",
      mode: "mastery-run",
      topic: "Week 5 spelling",
      domain: "spelling",
      learningGoal: "Check weekly spelling recall without seeing the words.",
      gradeBand: "early_elementary",
      scaffolds: {
        showWord: false,
        letterBank: false,
        allowRetryBeforeScore: false,
        companionHints: false,
      },
      words: [{
        id: "farmer",
        text: "farmer",
        definition: "A person who grows food or raises animals.",
        traps: ["farmar", "farmor"],
        imposterChunks: ["ar", "or", "ur", "ir"],
        targetPatterns: ["er-ending"],
      }],
      evidencePolicy: {
        writesPracticeEvidence: true,
        writesMasteryEvidence: true,
        requiresPerTargetResult: true,
        allowedEvidence: ["practice", "mastery"],
      },
      ...overrides,
    };
  }

  it("serves a valid spelling Visual Explainer config through its runtime route", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-activity-config-"));
    roots.push(root);
    process.chdir(root);
    writeGameConfig(root, "ila", "hw-spelling-week-5", "visual.json", {
      artifactId: "hw-spelling-week-5:visual",
      type: "visual-explainer",
      concept: "The ight chunk",
      learningGoal: "Notice and remember the ight chunk.",
      misconception: "The middle sound maps to one letter.",
      sourceEvidence: { source: "assignment:hw-spelling-week-5", capturedAt: "2026-10-08T12:00:00Z", summary: "A committed spelling miss." },
      algorithmTargets: ["error-pattern-remediation", "retrieval-practice"],
      reuseDecision: { status: "candidate", reason: "Awaiting checkpoint evidence." },
      parentApproval: { status: "pending" },
      mode: { default: "pause-for-question" },
      preview: { allowPlaythrough: true },
      narration: { enabled: false, provider: "companion", voiceId: "runtime-companion", modelId: "runtime-companion", audioPath: "none", scriptPath: "none", timings: [{ id: "strategy", startProgress: 0, endProgress: 100, text: "Keep the chunk together" }] },
      questions: [{ id: "check", prompt: "Which chunk stays together?", options: [{ id: "ight", label: "ight", correct: true }, { id: "ite", label: "ite", correct: false }], correctOptionId: "ight", targetConcept: "spelling.word.light", pauseAtProgress: 48, scaffoldLevel: 2 }],
      companionContext: { role: "hint_only", maxSentences: 3, canRevealAnswer: true },
      evidence: { targetResults: ["spelling.word.light"], completion: "visual-complete" },
      chrome: { childShowsEvidence: false, parentShowsEvidence: true, childShowsCarePlan: false, parentShowsCarePlan: true },
      spellingModel: { strategy: { title: "Keep the chunk together", steps: ["Say light.", "Notice ight."] }, words: [{ id: "spelling.word.light", text: "light", chunks: ["l", "ight"], focusChunk: "ight", tip: "Keep ight together." }] },
    });

    const out = await getJson("/api/activity-config/ila/hw-spelling-week-5/visual.json");

    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({
      type: "visual-explainer",
      spellingModel: { words: [{ text: "light", chunks: ["l", "ight"] }] },
    });
  });

  it("serves a valid Concept Check config from homework games after validation", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-activity-config-"));
    roots.push(root);
    process.chdir(root);
    const file = path.join(
      root,
      "src/context/ila/homework/games/hw-reading-erosion/concept-check.json",
    );
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      schemaVersion: 1,
      activityId: "concept-check",
      engine: { id: "concept-check", mode: "diagnostic" },
      topic: "Erosion",
      domain: "science",
      learningGoal: "Explain erosion causes.",
      gradeBand: "early_elementary",
      targets: [{ id: "erosion", label: "Erosion", type: "concept" }],
      rounds: [{
        id: "q1",
        mechanic: "choose",
        targetId: "erosion",
        prompt: "What causes erosion?",
        options: [
          { id: "water", label: "Water", correct: true },
          { id: "sun", label: "Only sunlight", correct: false },
        ],
        scaffoldLevel: 0,
      }],
      evidencePolicy: {
        writesPracticeEvidence: true,
        writesMasteryEvidence: true,
        requiresPerTargetResult: true,
        allowedEvidence: ["practice", "mastery"],
      },
    }), "utf8");

    const out = await getJson("/api/activity-config/ila/hw-reading-erosion/concept-check.json");

    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({
      activityId: "concept-check",
      topic: "Erosion",
    });
  });

  it("rejects invalid generated activity config before a child can launch it", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-activity-config-"));
    roots.push(root);
    process.chdir(root);
    const file = path.join(
      root,
      "src/context/ila/homework/games/hw-reading-erosion/concept-check.json",
    );
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      schemaVersion: 1,
      activityId: "concept-check",
      engine: { id: "concept-check", mode: "diagnostic" },
      topic: "Erosion",
      domain: "science",
      learningGoal: "Explain erosion causes.",
      gradeBand: "early_elementary",
      targets: [{ id: "erosion", label: "Erosion", type: "concept" }],
      rounds: [{
        id: "q1",
        mechanic: "choose",
        prompt: "What causes erosion?",
        options: [{ id: "water", label: "Water", correct: true }],
        scaffoldLevel: 0,
      }],
      evidencePolicy: {
        writesPracticeEvidence: true,
        writesMasteryEvidence: true,
        requiresPerTargetResult: true,
        allowedEvidence: ["practice", "mastery"],
      },
    }), "utf8");

    const out = await getJson("/api/activity-config/ila/hw-reading-erosion/concept-check.json");

    expect(out.status).toBe(422);
    expect(out.body).toMatchObject({
      error: "invalid_activity_config",
    });
    expect(JSON.stringify(out.body)).toContain("round_missing_target");
  });

  it("serves a valid Letter Rush config after dispatching to the Letter Rush validator", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-activity-config-"));
    roots.push(root);
    process.chdir(root);
    writeGameConfig(
      root,
      "ila",
      "hw-spelling-week-5",
      "letter-rush.json",
      validLetterRushConfig(),
    );

    const out = await getJson("/api/activity-config/ila/hw-spelling-week-5/letter-rush.json");

    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({
      activityId: "letter-rush",
      mode: "mastery-run",
      topic: "Week 5 spelling",
      words: [expect.objectContaining({ text: "farmer" })],
    });
  });

  it("rejects scaffolded Letter Rush Mastery Run configs before launch", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-activity-config-"));
    roots.push(root);
    process.chdir(root);
    writeGameConfig(
      root,
      "ila",
      "hw-spelling-week-5",
      "letter-rush.json",
      validLetterRushConfig({
        scaffolds: {
          showWord: true,
          letterBank: false,
          allowRetryBeforeScore: false,
          companionHints: false,
        },
      }),
    );

    const out = await getJson("/api/activity-config/ila/hw-spelling-week-5/letter-rush.json");

    expect(out.status).toBe(422);
    expect(out.body).toMatchObject({
      error: "invalid_activity_config",
    });
    expect(JSON.stringify(out.body)).toContain("letter_rush_mastery_scaffolded");
  });

  it("rejects unknown activity engine configs instead of falling through to the wrong validator", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-activity-config-"));
    roots.push(root);
    process.chdir(root);
    writeGameConfig(
      root,
      "ila",
      "hw-custom",
      "mystery-engine.json",
      {
        schemaVersion: 1,
        activityId: "mystery-engine",
        topic: "Mystery",
      },
    );

    const out = await getJson("/api/activity-config/ila/hw-custom/mystery-engine.json");

    expect(out.status).toBe(422);
    expect(out.body).toMatchObject({
      error: "unsupported_activity_engine",
      activityId: "mystery-engine",
    });
  });
});
