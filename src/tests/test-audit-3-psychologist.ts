import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { ChildProfile } from "../shared/childProfile";
import { COMPANION_DEFAULTS } from "../shared/companionTypes";
import type { LearningProfile } from "../context/schemas/learningProfile";
import {
  archiveHomeworkReasoningToHistory,
  readLatestTutoringContext,
  readPriorReasoning,
} from "../scripts/ingestHomework";
import {
  buildHomeworkAlgorithmSummary,
  buildPsychologistHomeworkPlanUserMessage,
} from "../scripts/homeworkPlanner";
import { resolveWordBankPath } from "../utils/wordBankIO";

const CHILD = "audit3psych";
const ctxRoot = path.join(process.cwd(), "src", "context", CHILD);

function rmCtx(): void {
  if (fs.existsSync(ctxRoot)) {
    fs.rmSync(ctxRoot, { recursive: true, force: true });
  }
}

const stubProfile = {
  childId: CHILD,
  ttsName: CHILD,
  level: 1,
  interests: { tags: [] },
  ui: { accentColor: "#000" },
  unlockedThemes: ["default"],
  attentionWindow_ms: 120_000,
  childContext: "",
  companion: { ...COMPANION_DEFAULTS, companionId: "test" },
} as ChildProfile;

describe("audit-3 psychologist / ingest context", () => {
  afterEach(() => {
    rmCtx();
  });

  it("algorithmSummary includes per-word SM-2 confidence", () => {
    rmCtx();
    fs.mkdirSync(path.dirname(resolveWordBankPath(CHILD)), { recursive: true });
    fs.writeFileSync(
      resolveWordBankPath(CHILD),
      JSON.stringify(
        {
          childId: CHILD,
          version: 1,
          lastUpdated: new Date().toISOString(),
          words: [
            {
              word: "alpha",
              addedAt: "2026-01-01",
              source: "test",
              tracks: {
                spelling: {
                  quality: 2,
                  easinessFactor: 1.8,
                  interval: 1,
                  repetition: 2,
                  nextReviewDate: "2026-04-01",
                  lastReviewDate: "2026-04-01",
                  scaffoldLevel: 0,
                  history: [],
                  mastered: false,
                  regressionCount: 0,
                },
              },
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );
    const lp = {
      childId: CHILD,
      version: 1,
      createdAt: "",
      lastUpdated: "",
      demographics: {} as LearningProfile["demographics"],
      algorithmParams: {} as LearningProfile["algorithmParams"],
      bondPatterns: {} as LearningProfile["bondPatterns"],
      moodHistory: [],
      moodTrend: "stable" as const,
      moodAdjustment: false,
      iepTargets: [],
      readingProfile: {} as LearningProfile["readingProfile"],
      sessionStats: {
        totalSessions: 1,
        averageAccuracy: 0.75,
        averageDurationMinutes: 10,
        currentWilsonStep: 3,
        streakRecord: 0,
        totalWordsMastered: 0,
        perfectSessions: 0,
        lastSessionDate: "2026-04-01",
        recentAccuracy: [0.7, 0.8, 0.9, 0.85, 0.72],
        sessionsAbove80: 2,
      },
    } as unknown as LearningProfile;
    const summary = buildHomeworkAlgorithmSummary(CHILD, ["alpha"], lp, stubProfile);
    expect(summary.wordConfidence).toHaveLength(1);
    expect(summary.wordConfidence[0]?.word).toBe("alpha");
    expect(summary.wordConfidence[0]?.confidence).toBe(1.8);
    expect(summary.wordConfidence[0]?.repetitions).toBe(2);
    expect(summary.wilsonStep).toBe(3);
    expect(summary.recentAccuracy).toEqual([0.7, 0.8, 0.9, 0.85, 0.72]);
    expect(summary.sessionsAbove80).toBe(2);
    expect(summary.averageAccuracy).toBe(0.75);
  });

  it("algorithmSummary flags previouslyStruggled words", () => {
    rmCtx();
    fs.mkdirSync(path.dirname(resolveWordBankPath(CHILD)), { recursive: true });
    fs.writeFileSync(
      resolveWordBankPath(CHILD),
      JSON.stringify(
        {
          childId: CHILD,
          version: 1,
          lastUpdated: new Date().toISOString(),
          words: [
            {
              word: "weak",
              addedAt: "2026-01-01",
              source: "test",
              tracks: {
                spelling: {
                  quality: 2,
                  easinessFactor: 1.7,
                  interval: 1,
                  repetition: 1,
                  nextReviewDate: "2026-04-01",
                  lastReviewDate: "2026-04-01",
                  scaffoldLevel: 0,
                  history: [],
                  mastered: false,
                  regressionCount: 0,
                },
              },
            },
            {
              word: "strong",
              addedAt: "2026-01-01",
              source: "test",
              tracks: {
                spelling: {
                  quality: 5,
                  easinessFactor: 2.6,
                  interval: 4,
                  repetition: 3,
                  nextReviewDate: "2026-04-01",
                  lastReviewDate: "2026-04-01",
                  scaffoldLevel: 0,
                  history: [],
                  mastered: false,
                  regressionCount: 0,
                },
              },
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );
    const summary = buildHomeworkAlgorithmSummary(
      CHILD,
      ["weak", "strong"],
      null,
      stubProfile,
    );
    const weak = summary.wordConfidence.find((w) => w.word === "weak");
    const strong = summary.wordConfidence.find((w) => w.word === "strong");
    expect(weak?.previouslyStruggled).toBe(true);
    expect(strong?.previouslyStruggled).toBe(false);
  });

  it("readLatestTutoringContext returns most recent session", () => {
    rmCtx();
    const dir = path.join(ctxRoot, "tutoring", "processed");
    fs.mkdirSync(dir, { recursive: true });
    const oldPath = path.join(dir, "old.txt");
    const newPath = path.join(dir, "new.txt");
    fs.writeFileSync(oldPath, "older transcript", "utf8");
    const tOld = Date.now() - 60_000;
    fs.utimesSync(oldPath, tOld / 1000, tOld / 1000);
    fs.writeFileSync(newPath, "newest body", "utf8");
    expect(readLatestTutoringContext(CHILD)).toBe("newest body");
  });

  it("readPriorReasoning returns most recent reasoning.md", () => {
    rmCtx();
    const p1 = path.join(ctxRoot, "homework", "pending", "2026-04-10");
    const p2 = path.join(ctxRoot, "homework", "pending", "2026-04-11");
    fs.mkdirSync(p1, { recursive: true });
    fs.mkdirSync(p2, { recursive: true });
    fs.writeFileSync(path.join(p1, "reasoning.md"), "older assumptions", "utf8");
    fs.writeFileSync(path.join(p2, "reasoning.md"), "newer assumptions", "utf8");
    const tOld = Date.now() - 120_000;
    fs.utimesSync(path.join(p1, "reasoning.md"), tOld / 1000, tOld / 1000);
    expect(readPriorReasoning(CHILD)).toBe("newer assumptions");
  });

  it("reasoning archived to reasoning-history/ after ingest helper", () => {
    rmCtx();
    const pending = path.join(ctxRoot, "homework", "pending", "2026-04-21");
    fs.mkdirSync(pending, { recursive: true });
    const src = path.join(pending, "reasoning.md");
    fs.writeFileSync(src, "plan body", "utf8");
    const dest = archiveHomeworkReasoningToHistory({
      childId: CHILD,
      date: "2026-04-21",
      reasoningSourcePath: src,
    });
    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.readFileSync(dest, "utf8")).toBe("plan body");
  });

  it("Psychologist prompt includes all 4 sources", () => {
    const algorithmSummary = buildHomeworkAlgorithmSummary(
      CHILD,
      ["x"],
      null,
      stubProfile,
    );
    const msg = buildPsychologistHomeworkPlanUserMessage({
      algorithmSummary,
      tutoringContext: "tutor said: practice cat",
      sessionNotes: ["note a", "note b"],
      priorReasoning: "assumed fatigue",
      extraction: {
        title: "T",
        type: "spelling_test",
        gradeLevel: 2,
        testDate: "2026-04-25",
        words: ["cat"],
        questions: [],
      },
      testDate: "2026-04-25",
      daysUntilTest: 4,
    });
    expect(msg).toContain("ALGORITHM FEEDBACK");
    expect(msg).toContain('"wilsonStep"');
    expect(msg).toContain("HUMAN TUTOR SESSION");
    expect(msg).toContain("tutor said: practice cat");
    expect(msg).toContain("RECENT SESSION NOTES");
    expect(msg).toContain("note a");
    expect(msg).toContain("PRIOR ASSUMPTIONS");
    expect(msg).toContain("assumed fatigue");
    expect(msg).toContain("TODAY'S HOMEWORK");
    expect(msg).toContain('"title": "T"');
    expect(msg).toContain("CHILD INDEPENDENCE");
  });

  it("go-live companion prompt has parent prefix", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src", "server", "session-bootstrap.ts"),
      "utf8",
    );
    const idx = src.indexOf('SUNNY_PREVIEW_MODE?.trim() === "go-live"');
    expect(idx).toBeGreaterThan(-1);
    const slice = src.slice(idx, idx + 2200);
    expect(slice).toContain("PARENT REVIEW MODE");
    expect(slice).toContain(
      "systemPrompt: parentPrefix + session.companion.systemPrompt",
    );
  });

  it("go-live companion openingLine mentions review mode", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src", "server", "session-bootstrap.ts"),
      "utf8",
    );
    const idx = src.indexOf('SUNNY_PREVIEW_MODE?.trim() === "go-live"');
    const slice = src.slice(idx, idx + 2200);
    expect(slice).toContain("parent review mode active");
  });

  it("go-live openingLine does not hardcode child name", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src", "server", "session-bootstrap.ts"),
      "utf8",
    );
    const idx = src.indexOf('SUNNY_PREVIEW_MODE?.trim() === "go-live"');
    const slice = src.slice(idx, idx + 2200);
    expect(slice).not.toMatch(/\bIla\b/);
    expect(slice).toContain("${childDisplay}");
  });

  it("free preview companion prompt unchanged (demo block intact)", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src", "server", "session-bootstrap.ts"),
      "utf8",
    );
    expect(src).toContain(
      "DEMO_MODE_PROMPT(session.childName, session.companion.name)",
    );
    expect(src.match(/PARENT REVIEW MODE/g)?.length).toBe(1);
  });
});
