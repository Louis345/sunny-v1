import "dotenv/config";
import fs from "fs";
import path from "path";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import type { HomeworkCycle } from "../context/schemas/homeworkCycle";
import { generateContentFingerprint } from "../context/schemas/homeworkCycle";
import { recordGradedHomeworkCalibration } from "../engine/learningDecisionContext";

export type GradedHomeworkUpload = {
  childId: string;
  sourceFile: string;
  title?: string;
  returnTag?: string;
  rawText?: string;
  words: string[];
  concepts: string[];
  questions: string[];
  testDate?: string | null;
  score?: number | null;
  gradedItems: Array<{
    target: string;
    correct: boolean;
    observedErrorType?: string;
    note?: string;
  }>;
  contentFingerprint?: string;
};

export type HomeworkMatchCandidate = {
  homeworkId: string;
  title: string;
  confidence: number;
  evidence: string[];
  cycle: HomeworkCycle;
};

type CliArgs = {
  childId: string;
  pdfPath: string;
  dryRun: boolean;
  yes: boolean;
};

type UploadRunOptions = {
  rootDir?: string;
  now?: Date;
  logger?: Pick<Console, "log">;
  confirm?: (candidate: HomeworkMatchCandidate) => Promise<boolean> | boolean;
};

const MIN_CONFIDENT_MATCH = 0.3;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeIdSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function fallbackReturnTag(childId: string, homeworkId: string): string {
  return `#sunny_${normalizeIdSegment(childId)}_${normalizeIdSegment(homeworkId)}`;
}

function extractReturnTag(value: string): string | null {
  return value.match(/#sunny_[a-z0-9_]+/i)?.[0] ?? null;
}

function tokens(value: string): Set<string> {
  return new Set(normalize(value).split(/\s+/).filter((part) => part.length >= 3));
}

function overlapScore(a: Iterable<string>, b: Iterable<string>): number {
  const left = new Set([...a].map((x) => normalize(String(x))).filter(Boolean));
  const right = new Set([...b].map((x) => normalize(String(x))).filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = [...left].filter((item) => right.has(item)).length;
  return intersection / Math.max(left.size, right.size);
}

function dateProximityScore(a?: string | null, b?: string | null): number {
  if (!a || !b) return 0;
  const left = Date.parse(`${a}T00:00:00.000Z`);
  const right = Date.parse(`${b}T00:00:00.000Z`);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return 0;
  const days = Math.abs(left - right) / 86_400_000;
  if (days === 0) return 1;
  if (days <= 2) return 0.7;
  if (days <= 7) return 0.35;
  return 0;
}

function cycleTitle(cycle: HomeworkCycle): string {
  return cycle.capturedContent?.title ?? cycle.contentProfile?.topic ?? cycle.homeworkId;
}

function filenameStem(value: string): string {
  return path.basename(value).replace(/\.[^.]+$/, "");
}

function sourceNames(cycle: HomeworkCycle): string[] {
  return cycle.capturedContent?.sourceDocuments.map((doc) => doc.filename) ?? [];
}

export function scoreHomeworkCycleCandidate(
  upload: GradedHomeworkUpload,
  cycle: HomeworkCycle,
): HomeworkMatchCandidate {
  let score = 0;
  const evidence: string[] = [];
  const expectedReturnTag = cycle.returnTag ?? fallbackReturnTag(upload.childId, cycle.homeworkId);
  const tagHaystack = normalize(
    [
      upload.returnTag,
      upload.rawText,
      upload.title,
      path.basename(upload.sourceFile),
    ].filter(Boolean).join(" "),
  );
  if (tagHaystack && normalize(expectedReturnTag) && tagHaystack.includes(normalize(expectedReturnTag))) {
    score += 0.7;
    evidence.push("return tag match");
  }

  if (upload.contentFingerprint && cycle.contentFingerprint === upload.contentFingerprint) {
    score += 0.55;
    evidence.push("exact content fingerprint");
  }

  const uploadSource = path.basename(upload.sourceFile);
  if (
    sourceNames(cycle).some((name) =>
      normalize(name) === normalize(uploadSource) ||
      normalize(filenameStem(name)) === normalize(filenameStem(uploadSource)))
  ) {
    score += 0.25;
    evidence.push("same source filename");
  }

  const titleOverlap = overlapScore(tokens(upload.title ?? uploadSource), tokens(cycleTitle(cycle)));
  if (titleOverlap > 0) {
    score += titleOverlap * 0.15;
    evidence.push(`title overlap ${(titleOverlap * 100).toFixed(0)}%`);
  }

  const conceptOverlap = overlapScore(
    upload.concepts,
    cycle.contentProfile?.concepts ?? cycle.capturedContent?.contentProfile.concepts ?? [],
  );
  if (conceptOverlap > 0) {
    score += conceptOverlap * 0.2;
    evidence.push(`concept overlap ${(conceptOverlap * 100).toFixed(0)}%`);
  }

  const wordOverlap = overlapScore(upload.words, cycle.wordList);
  if (wordOverlap > 0) {
    score += wordOverlap * 0.25;
    evidence.push(`word overlap ${(wordOverlap * 100).toFixed(0)}%`);
  }

  const dateScore = dateProximityScore(upload.testDate, cycle.testDate);
  if (dateScore > 0) {
    score += dateScore * 0.15;
    evidence.push(`test date proximity ${(dateScore * 100).toFixed(0)}%`);
  }

  return {
    homeworkId: cycle.homeworkId,
    title: cycleTitle(cycle),
    confidence: Math.min(1, Math.round(score * 1000) / 1000),
    evidence,
    cycle,
  };
}

export function rankHomeworkCycleCandidates(
  upload: GradedHomeworkUpload,
  cycles: HomeworkCycle[],
): HomeworkMatchCandidate[] {
  return cycles
    .map((cycle) => scoreHomeworkCycleCandidate(upload, cycle))
    .filter((candidate) => candidate.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence);
}

function cyclesDir(rootDir: string, childId: string): string {
  return path.join(rootDir, "src", "context", childId, "homework", "cycles");
}

function loadCycles(rootDir: string, childId: string): HomeworkCycle[] {
  const dir = cyclesDir(rootDir, childId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as HomeworkCycle;
      } catch {
        return null;
      }
    })
    .filter((cycle): cycle is HomeworkCycle => cycle != null);
}

function parseCliArgs(argv: string[]): CliArgs {
  const childArg = argv.find((arg) => arg.startsWith("--child="));
  const pdfArg = argv.find((arg) => arg.startsWith("--pdf="));
  const childId = childArg?.slice("--child=".length).trim().toLowerCase() ?? "";
  const pdfPath = pdfArg?.slice("--pdf=".length).trim() ?? "";
  if (!childId) throw new Error("Missing --child=<childId>");
  if (!pdfPath) throw new Error("Missing --pdf=<path>");
  return {
    childId,
    pdfPath,
    dryRun: argv.includes("--dry-run"),
    yes: argv.includes("--yes"),
  };
}

function uploadFromFile(args: CliArgs): GradedHomeworkUpload {
  const sourceFile = path.resolve(args.pdfPath);
  const isText = /\.(txt|md|json)$/i.test(sourceFile);
  const rawText = isText && fs.existsSync(sourceFile) ? fs.readFileSync(sourceFile, "utf8") : "";
  let structured: Partial<GradedHomeworkUpload> = {};
  if (/\.json$/i.test(sourceFile) && rawText.trim()) {
    try {
      structured = JSON.parse(rawText) as Partial<GradedHomeworkUpload>;
    } catch {
      structured = {};
    }
  }
  const sourceName = path.basename(sourceFile);
  const title = structured.title ?? sourceName.replace(/\.[^.]+$/, "");
  const words = Array.isArray(structured.words)
    ? structured.words.map((word) => String(word).toLowerCase())
    : rawText.split(/\s+/).map((w) => w.replace(/[^A-Za-z]/g, "").toLowerCase()).filter((w) => w.length >= 4);
  const concepts = Array.isArray(structured.concepts)
    ? structured.concepts.map((concept) => String(concept).toLowerCase())
    : rawText.match(/\b(erosion|sediment|soil|water|wind|landform|rocks?)\b/gi)?.map((x) => x.toLowerCase()) ?? [];
  const questions = Array.isArray(structured.questions)
    ? structured.questions.map((question) => String(question))
    : [];
  const gradedItems = Array.isArray(structured.gradedItems)
    ? structured.gradedItems
    : [];
  const testDate = typeof structured.testDate === "string" ? structured.testDate : null;
  const returnTag =
    typeof structured.returnTag === "string"
      ? structured.returnTag
      : extractReturnTag(`${sourceName}\n${rawText}`) ?? undefined;
  return {
    childId: args.childId,
    sourceFile,
    title,
    returnTag,
    rawText,
    words,
    concepts,
    questions,
    testDate,
    score: typeof structured.score === "number" ? structured.score : null,
    gradedItems,
    contentFingerprint: generateContentFingerprint({
      childId: args.childId,
      title,
      rawText,
      words,
      questions,
      testDate,
      sourceDocuments: [{ filename: sourceName }],
    }),
  };
}

function unmatchedPath(rootDir: string, childId: string, now: Date): string {
  const dir = path.join(rootDir, "src", "context", childId, "homework", "unmatched");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `graded-upload-${now.toISOString().replace(/[:.]/g, "-")}.json`);
}

async function confirmCandidate(
  candidate: HomeworkMatchCandidate,
  autoYes: boolean,
  injectedConfirm: UploadRunOptions["confirm"],
): Promise<boolean> {
  if (autoYes) return true;
  if (injectedConfirm) return Boolean(await injectedConfirm(candidate));
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(`Use ${candidate.homeworkId} (${candidate.title})? [Y/n] `);
    return answer.trim().toLowerCase() !== "n";
  } finally {
    rl.close();
  }
}

export async function runUploadGradedHomework(
  argv: string[],
  opts: UploadRunOptions = {},
): Promise<void> {
  const args = parseCliArgs(argv);
  const rootDir = opts.rootDir ?? process.cwd();
  const now = opts.now ?? new Date();
  const logger = opts.logger ?? console;
  const upload = uploadFromFile(args);
  const candidates = rankHomeworkCycleCandidates(upload, loadCycles(rootDir, args.childId));
  logger.log(`📄 Graded upload: ${path.basename(upload.sourceFile)}`);
  if (candidates.length === 0 || (candidates[0]?.confidence ?? 0) < MIN_CONFIDENT_MATCH) {
    logger.log("⚠️  No confident assignment match found.");
    if (candidates[0]) {
      logger.log(
        `Best guess was ${candidates[0].homeworkId} at confidence ${candidates[0].confidence.toFixed(2)}; queued for human remap.`,
      );
    }
    if (!args.dryRun) {
      fs.writeFileSync(unmatchedPath(rootDir, args.childId, now), JSON.stringify(upload, null, 2), "utf8");
    }
    return;
  }
  logger.log("Likely assignment matches:");
  candidates.slice(0, 5).forEach((candidate, idx) => {
    logger.log(`${idx + 1}. ${candidate.homeworkId} — ${candidate.title} — confidence ${candidate.confidence.toFixed(2)}`);
    logger.log(`   evidence: ${candidate.evidence.join(", ") || "weak metadata match"}`);
  });
  if (args.dryRun) {
    logger.log("Dry run: no calibration written.");
    return;
  }
  for (const candidate of candidates) {
    if (!(await confirmCandidate(candidate, args.yes, opts.confirm))) continue;
    const entry = recordGradedHomeworkCalibration(args.childId, {
      homeworkId: candidate.homeworkId,
      score: upload.score ?? null,
      gradedItems: upload.gradedItems,
      teacherNotes: `Uploaded graded homework from ${path.basename(upload.sourceFile)}.`,
    }, {
      rootDir,
      now,
    });
    logger.log(`✅ Calibration written: ${entry.status} (${entry.calibrationId})`);
    return;
  }
  fs.writeFileSync(unmatchedPath(rootDir, args.childId, now), JSON.stringify(upload, null, 2), "utf8");
  logger.log("No candidate accepted. Wrote graded upload to unmatched queue.");
}

if (typeof require !== "undefined" && require.main === module) {
  runUploadGradedHomework(process.argv.slice(2)).catch((err) => {
    console.error("🎮 [homework-upload] failed", err);
    process.exit(1);
  });
}
