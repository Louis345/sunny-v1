import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  CapturedHomeworkContentRecord,
  HomeworkCycle,
} from "../context/schemas/homeworkCycle";
import type { LearningProfile } from "../context/schemas/learningProfile";
import { initializeLearningProfile } from "../utils/learningProfileIO";
import {
  formatAdaptiveEvidenceReport,
  runInspectAdaptiveEvidence,
} from "./inspectAdaptiveEvidence";

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-inspect-evidence-"));
}

function writeJson(root: string, rel: string, value: unknown): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function writeText(root: string, rel: string, value: string): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, "utf8");
}

function listFiles(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        out[path.relative(root, full)] = fs.readFileSync(full, "utf8");
      }
    }
  };
  walk(root);
  return out;
}

function profile(childId: string): LearningProfile {
  const out = initializeLearningProfile({
    childId,
    age: 8,
    grade: 2,
    diagnoses: [],
    learningGoals: [],
  });
  out.attentionModel = undefined;
  const captured = capturedContent("Current Erosion Guide");
  out.pendingHomework = {
    weekOf: "2026-05-05",
    testDate: "2026-05-07",
    wordList: ["erosion", "soil"],
    homeworkId: "hw-current",
    capturedContent: captured,
    contentProfile: captured.contentProfile,
    generatedAt: "2026-05-05T00:00:00.000Z",
    nodes: [],
  };
  return out;
}

function capturedContent(title: string): CapturedHomeworkContentRecord {
  return {
    title,
    type: "reading",
    rawText: "Water and wind wear away rocks and soil.",
    words: ["erosion", "soil"],
    questions: [{ id: 1, question: "What causes erosion?", correctAnswer: "water" }],
    sourceDocuments: [{ filename: "erosions.pdf", mediaType: "application/pdf" }],
    contentProfile: {
      practiceDomain: "reading",
      contentDomain: "science",
      topic: "Erosion",
      primarySkill: "reading_comprehension",
      assignmentFormat: "study_guide",
      concepts: ["erosion", "water"],
      sourceEvidence: ["PDF says water causes erosion."],
    },
  };
}

function cycle(homeworkId: string, title = "Current Erosion Guide"): HomeworkCycle {
  const captured = capturedContent(title);
  return {
    homeworkId,
    subject: "reading",
    wordList: ["erosion", "soil"],
    capturedContent: captured,
    contentProfile: captured.contentProfile,
    contentFingerprint: `${homeworkId}-fingerprint`,
    calibrationStatus: "unverified",
    ingestedAt: "2026-05-05T00:00:00.000Z",
    testDate: "2026-05-07",
    assumptions: "Pre-quest assumption exists.",
    theory: {
      theoryId: `${homeworkId}:pre_quest:test`,
      stage: "pre_quest",
      createdAt: "2026-05-05T00:00:00.000Z",
      hypothesis: `Hypothesis for ${title}.`,
      predictedPattern: "concept_transfer_gap",
      predictedRiskWords: ["soil"],
      intervention: "Short cause/effect quest.",
      successCriteria: { minAccuracy: 0.8, minImprovement: 0.15 },
      evidence: ["captured homework", "baseline activity"],
      status: "pending",
      markdown: "## Hypothesis\nConcept transfer may be the gap.",
    },
    interventionHistory: [{
      nodeId: `${homeworkId}-baseline`,
      nodeType: "word-radar",
      measuredAt: "2026-05-05T00:10:00.000Z",
      baselineAccuracy: 0.7,
      interventionAccuracy: 0.7,
      improvement: 0,
      predictionMet: false,
      status: "falsified",
    }],
    postAnalysis: null,
    scanResult: null,
    delta: null,
    metrics: null,
  };
}

function writeChild(root: string, childId: string): void {
  writeJson(root, `src/context/${childId}/learning_profile.json`, profile(childId));
  writeJson(root, `src/context/${childId}/word_bank.json`, {
    childId,
    version: 1,
    lastUpdated: "2026-05-05T00:00:00.000Z",
    words: [],
  });
  writeJson(root, `src/context/${childId}/homework/cycles/hw-current.json`, cycle("hw-current"));
  writeJson(root, `src/context/${childId}/homework/cycles/hw-other.json`, cycle("hw-other", "Other Homework"));
  writeText(root, `src/context/${childId}/session_notes/2026-05-05.md`, "- Companion saw strong flow.\n");
}

describe("inspectAdaptiveEvidence CLI", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("prints a human-readable evidence report", async () => {
    const root = makeRoot();
    roots.push(root);
    writeChild(root, "ila");
    const lines: string[] = [];

    await runInspectAdaptiveEvidence(["--child=ila"], {
      rootDir: root,
      logger: { log: (line) => lines.push(line) },
    });

    const out = lines.join("\n");
    expect(out).toContain("Adaptive Evidence Snapshot");
    expect(out).toContain("Child: ila");
    expect(out).toContain("Homework: hw-current");
    expect(out).toContain("Quest readiness: medium");
    expect(out).toContain("Attention: source=legacy_demographic");
    expect(out).toContain("capturedHomework: ready");
    expect(out).toContain("baselineActivities: ready");
    expect(out).toContain("companionSignals: ready");
    expect(out).toContain("Pre-quest theory: hw-current:pre_quest:test");
  });

  it("prints parseable JSON when --json is used", async () => {
    const root = makeRoot();
    roots.push(root);
    writeChild(root, "ila");
    const lines: string[] = [];

    await runInspectAdaptiveEvidence(["--child=ila", "--json"], {
      rootDir: root,
      logger: { log: (line) => lines.push(line) },
    });

    const parsed = JSON.parse(lines.join("\n")) as { childId?: string; homeworkId?: string };
    expect(parsed.childId).toBe("ila");
    expect(parsed.homeworkId).toBe("hw-current");
    expect(parsed).toHaveProperty("evaluator");
  });

  it("honors --homework-id and remains read-only", async () => {
    const root = makeRoot();
    roots.push(root);
    writeChild(root, "ila");
    const before = listFiles(root);
    const lines: string[] = [];

    await runInspectAdaptiveEvidence(["--child=ila", "--homework-id=hw-other"], {
      rootDir: root,
      logger: { log: (line) => lines.push(line) },
    });

    expect(lines.join("\n")).toContain("Homework: hw-other");
    expect(lines.join("\n")).toContain("Hypothesis for Other Homework");
    expect(listFiles(root)).toEqual(before);
  });

  it("lists available homework cycles without changing files", async () => {
    const root = makeRoot();
    roots.push(root);
    writeChild(root, "ila");
    const before = listFiles(root);
    const lines: string[] = [];

    await runInspectAdaptiveEvidence(["--child=ila", "--list"], {
      rootDir: root,
      logger: { log: (line) => lines.push(line) },
    });

    const out = lines.join("\n");
    expect(out).toContain("Adaptive Evidence Homework Cycles");
    expect(out).toContain("Child: ila");
    expect(out).toContain("hw-current");
    expect(out).toContain("pending");
    expect(out).toContain("hw-other");
    expect(out).toContain("reading");
    expect(out).toContain("Other Homework");
    expect(out).toContain("measurements=1");
    expect(out).toContain("theory=yes");
    expect(listFiles(root)).toEqual(before);
  });

  it("fails clearly when the child profile is missing", async () => {
    const root = makeRoot();
    roots.push(root);
    await expect(
      runInspectAdaptiveEvidence(["--child=missing"], {
        rootDir: root,
        logger: { log: () => undefined },
      }),
    ).rejects.toThrow("Learning profile not found for child: missing");
  });

  it("formats snapshot output as a pure function", () => {
    const root = makeRoot();
    roots.push(root);
    writeChild(root, "ila");
    const report = formatAdaptiveEvidenceReport({
      childId: "ila",
      homeworkId: "hw-current",
      createdAt: "2026-05-05T00:00:00.000Z",
      attention: {
        source: "legacy_demographic",
        status: "insufficient-data",
        currentWindow_ms: 300000,
        bestWindow_ms: 300000,
        trend: "unknown",
        confidence: 0.1,
        evidence: ["fallback"],
        label: "moderate",
        legacyDemographicLabel: "moderate",
      },
      sources: {
        capturedHomework: { status: "ready", confidence: 0.9, evidenceIds: ["homework:hw-current"], summary: "captured" },
        baselineActivities: { status: "missing", confidence: 0, evidenceIds: [], summary: "missing" },
        attention: { status: "provisional", confidence: 0.1, evidenceIds: ["attention:legacy_demographic"], summary: "attention" },
        tutoringContext: { status: "missing", confidence: 0, evidenceIds: [], summary: "missing" },
        companionSignals: { status: "missing", confidence: 0, evidenceIds: [], summary: "missing" },
      },
      evidenceIds: ["homework:hw-current"],
      evaluator: {
        status: "ready",
        confidence: 0.5,
        summary: "2 target(s): mastered_now=1, known_but_slow=0, fragile=0, unknown=1.",
        evidenceIds: ["evaluator:erosion:attempt_log"],
        buckets: {
          mastered_now: ["erosion"],
          known_but_slow: [],
          fragile: [],
          unknown: ["soil"],
        },
        items: [
          {
            target: "erosion",
            domain: "reading",
            bucket: "mastered_now",
            confidence: 0.8,
            attempts: { total: 1, correct: 1, incorrect: 0 },
            evidenceIds: ["evaluator:erosion:attempt_log"],
            reasons: ["high_quality_correct"],
          },
          {
            target: "soil",
            domain: "reading",
            bucket: "unknown",
            confidence: 0.25,
            attempts: { total: 0, correct: 0, incorrect: 0 },
            evidenceIds: [],
            reasons: ["no_evaluator_evidence_yet"],
          },
        ],
      },
      questReadiness: {
        level: "blocked",
        confidence: 0.2,
        blockers: ["baseline_measurements_missing"],
        reason: "Quest blocked: baseline_measurements_missing.",
      },
      preQuestTheory: null,
    });
    expect(report).toContain("Blockers: baseline_measurements_missing");
    expect(report).toContain("Quest gate: blocked");
    expect(report).toContain("Required missing evidence: baseline_measurements, pre_quest_theory");
    expect(report).toContain("Evaluator buckets:");
    expect(report).toContain("- mastered_now: erosion");
    expect(report).toContain("- unknown: soil");
  });
});
