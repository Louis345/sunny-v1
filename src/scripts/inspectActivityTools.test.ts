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
import { runInspectActivityTools } from "./inspectActivityTools";

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-activity-tools-"));
}

function writeJson(root: string, rel: string, value: unknown): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
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

function capturedContent(input: {
  title: string;
  type: "reading" | "spelling";
  practiceDomain: string;
  contentDomain: string;
  topic: string;
  primarySkill: string;
  words: string[];
  concepts?: string[];
}): CapturedHomeworkContentRecord {
  return {
    title: input.title,
    type: input.type,
    rawText: input.type === "reading"
      ? "Water and wind wear away rocks and soil."
      : input.words.join("\n"),
    words: input.words,
    questions: input.type === "reading"
      ? [{ id: 1, question: "What causes erosion?", correctAnswer: "water and wind" }]
      : [],
    sourceDocuments: [{ filename: `${input.title}.pdf`, mediaType: "application/pdf" }],
    contentProfile: {
      practiceDomain: input.practiceDomain,
      contentDomain: input.contentDomain,
      topic: input.topic,
      primarySkill: input.primarySkill,
      assignmentFormat: input.type === "reading" ? "study_guide" : "spelling_list",
      concepts: input.concepts ?? [],
      sourceEvidence: [`Captured from ${input.title}.pdf`],
    },
  };
}

function cycle(homeworkId: string, captured: CapturedHomeworkContentRecord): HomeworkCycle {
  return {
    homeworkId,
    subject: captured.type,
    wordList: captured.words,
    capturedContent: captured,
    contentProfile: captured.contentProfile,
    contentFingerprint: `${homeworkId}-fingerprint`,
    calibrationStatus: "unverified",
    ingestedAt: "2026-05-05T00:00:00.000Z",
    testDate: "2026-05-07",
    assumptions: null,
    theory: null,
    interventionHistory: [],
    postAnalysis: null,
    scanResult: null,
    delta: null,
    metrics: null,
  };
}

function profile(childId: string, pending: HomeworkCycle): LearningProfile {
  const out = initializeLearningProfile({
    childId,
    age: 8,
    grade: 2,
    diagnoses: [],
    learningGoals: [],
  });
  out.pendingHomework = {
    weekOf: "2026-05-05",
    testDate: "2026-05-07",
    wordList: pending.wordList,
    homeworkId: pending.homeworkId,
    capturedContent: pending.capturedContent ?? undefined,
    contentProfile: pending.contentProfile ?? undefined,
    generatedAt: "2026-05-05T00:00:00.000Z",
    nodes: [],
  };
  return out;
}

function writeChild(root: string, childId: string): void {
  const erosion = cycle("hw-erosion-current", capturedContent({
    title: "Erosion Study Guide",
    type: "reading",
    practiceDomain: "reading",
    contentDomain: "science",
    topic: "Erosion",
    primarySkill: "reading_comprehension",
    words: ["erosion", "soil", "wear away"],
    concepts: ["erosion", "weathering", "deposition"],
  }));
  const spelling = cycle("hw-spelling-week", capturedContent({
    title: "Week 5 Spelling",
    type: "spelling",
    practiceDomain: "spelling",
    contentDomain: "spelling",
    topic: "Week 5 spelling",
    primarySkill: "spelling_recall",
    words: ["again", "because", "right", "where"],
  }));

  writeJson(root, `src/context/${childId}/learning_profile.json`, profile(childId, erosion));
  writeJson(root, `src/context/${childId}/word_bank.json`, {
    childId,
    version: 1,
    lastUpdated: "2026-05-05T00:00:00.000Z",
    words: [],
  });
  writeJson(root, `src/context/${childId}/homework/cycles/${erosion.homeworkId}.json`, erosion);
  writeJson(root, `src/context/${childId}/homework/cycles/${spelling.homeworkId}.json`, spelling);
}

describe("inspectActivityTools CLI", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("prints a human-readable activity audit", async () => {
    const lines: string[] = [];

    await runInspectActivityTools(["--audit"], {
      logger: { log: (line) => lines.push(line) },
    });

    const out = lines.join("\n");
    expect(out).toContain("Activity Tool Audit");
    expect(out).toContain("word-radar");
    expect(out).toContain("writesMasteryEvidence: false");
    expect(out).toContain("visible-word");
    expect(out).toContain("spelling-recall");
  });

  it("prints parseable audit JSON", async () => {
    const lines: string[] = [];

    await runInspectActivityTools(["--audit", "--json"], {
      logger: { log: (line) => lines.push(line) },
    });

    const parsed = JSON.parse(lines.join("\n")) as {
      blockers?: string[];
      contracts?: Array<{ id: string; evidence: { writesMasteryEvidence: boolean } }>;
    };
    const wordRadar = parsed.contracts?.find((contract) => contract.id === "word-radar");
    expect(parsed.blockers).toEqual([]);
    expect(wordRadar?.evidence.writesMasteryEvidence).toBe(false);
  });

  it("plans the pending homework without changing files", async () => {
    const root = makeRoot();
    roots.push(root);
    writeChild(root, "ila");
    const before = listFiles(root);
    const lines: string[] = [];

    await runInspectActivityTools(["--plan", "--child=ila"], {
      rootDir: root,
      logger: { log: (line) => lines.push(line) },
    });

    const out = lines.join("\n");
    expect(out).toContain("Instructional Activity Plan");
    expect(out).toContain("Child: ila");
    expect(out).toContain("Homework: hw-erosion-current");
    expect(out).toContain("Domain: science");
    expect(out).toContain("Step 1: concept-check");
    expect(out).toContain("Step 2: visual-explainer");
    expect(out).toMatch(/word-radar[\s\S]*practice-only|practice-only[\s\S]*word-radar/);
    expect(listFiles(root)).toEqual(before);
  });

  it("honors --homework-id so spelling and science produce different plans", async () => {
    const root = makeRoot();
    roots.push(root);
    writeChild(root, "reina");
    const lines: string[] = [];

    await runInspectActivityTools(["--plan", "--child=reina", "--homework-id=hw-spelling-week"], {
      rootDir: root,
      logger: { log: (line) => lines.push(line) },
    });

    const out = lines.join("\n");
    expect(out).toContain("Child: reina");
    expect(out).toContain("Homework: hw-spelling-week");
    expect(out).toContain("Domain: spelling");
    expect(out).toContain("Step 1: spelling-recall");
    expect(out).toMatch(/word-radar[\s\S]*practice-only|practice-only[\s\S]*word-radar/);
  });

  it("infers spelling from a pending spelling homework id when profile fields are sparse", async () => {
    const root = makeRoot();
    roots.push(root);
    const sparse = initializeLearningProfile({
      childId: "reina",
      age: 8,
      grade: 2,
      diagnoses: [],
      learningGoals: [],
    });
    sparse.pendingHomework = {
      weekOf: "2026-05-05",
      testDate: "2026-05-07",
      wordList: ["shiny", "slowly", "lucky"],
      homeworkId: "hw-spelling_test-adaptive",
      generatedAt: "2026-05-05T00:00:00.000Z",
      nodes: [],
    };
    writeJson(root, "src/context/reina/learning_profile.json", sparse);
    writeJson(root, "src/context/reina/word_bank.json", {
      childId: "reina",
      version: 1,
      lastUpdated: "2026-05-05T00:00:00.000Z",
      words: [],
    });
    const lines: string[] = [];

    await runInspectActivityTools(["--plan", "--child=reina"], {
      rootDir: root,
      logger: { log: (line) => lines.push(line) },
    });

    const out = lines.join("\n");
    expect(out).toContain("Homework: hw-spelling_test-adaptive");
    expect(out).toContain("Domain: spelling");
    expect(out).toContain("Step 1: spelling-recall");
  });

  it("fails clearly when the child profile is missing", async () => {
    const root = makeRoot();
    roots.push(root);

    await expect(
      runInspectActivityTools(["--plan", "--child=missing"], {
        rootDir: root,
        logger: { log: () => undefined },
      }),
    ).rejects.toThrow("Learning profile not found for child: missing");
  });

  it("has npm scripts for audit and plan commands", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.["sunny:activity:audit"]).toBe("npx tsx src/scripts/inspectActivityTools.ts --audit");
    expect(pkg.scripts?.["sunny:activity:plan"]).toBe("npx tsx src/scripts/inspectActivityTools.ts --plan");
  });
});
