import "dotenv/config";
import crypto from "node:crypto";
import fs from "fs";
import path from "path";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import type { HomeworkCycle } from "../context/schemas/homeworkCycle";
import { generateContentFingerprint } from "../context/schemas/homeworkCycle";
import { extractAssignmentSource } from "../engine/assignmentSourceExtraction";
import { recordGradedHomeworkCalibration } from "../engine/learningDecisionContext";
import type { LearningCycleRecordV2 } from "../engine/learningCycleRepository";
import {
  interpretReturnedWorkBatch,
  recordConfirmedReturnedWork,
  type TheoryDecisionContent,
} from "../engine/longitudinalLearning";
import { resolveChildContextDir } from "../utils/contextRoot";

type HomeworkCycleCandidateRecord = HomeworkCycle | LearningCycleRecordV2;

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
  cycle: HomeworkCycleCandidateRecord;
};

type CliArgs = {
  childId: string;
  pdfPath: string;
  homeworkId?: string;
  dryRun: boolean;
  yes: boolean;
};

type UploadRunOptions = {
  rootDir?: string;
  now?: Date;
  logger?: Pick<Console, "log">;
  confirm?: (candidate: HomeworkMatchCandidate) => Promise<boolean> | boolean;
  interpret?: (cycle: LearningCycleRecordV2, sourceId: string) => Promise<TheoryDecisionContent>;
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

function isCanonicalCycle(cycle: HomeworkCycleCandidateRecord): cycle is LearningCycleRecordV2 {
  return "schemaVersion" in cycle && cycle.schemaVersion === 2;
}

function cycleTitle(cycle: HomeworkCycleCandidateRecord): string {
  return isCanonicalCycle(cycle)
    ? cycle.assignment.title
    : cycle.capturedContent?.title ?? cycle.contentProfile?.topic ?? cycle.homeworkId;
}

function filenameStem(value: string): string {
  return path.basename(value).replace(/\.[^.]+$/, "");
}

function sourceNames(cycle: HomeworkCycleCandidateRecord): string[] {
  if (isCanonicalCycle(cycle)) return cycle.assignment.sourceFilename ? [cycle.assignment.sourceFilename] : [];
  return cycle.capturedContent?.sourceDocuments.map((doc) => doc.filename) ?? [];
}

export function scoreHomeworkCycleCandidate(
  upload: GradedHomeworkUpload,
  cycle: HomeworkCycleCandidateRecord,
): HomeworkMatchCandidate {
  let score = 0;
  const evidence: string[] = [];
  const expectedReturnTag = (isCanonicalCycle(cycle) ? cycle.assignment.returnTag : cycle.returnTag)
    ?? fallbackReturnTag(upload.childId, cycle.homeworkId);
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

  const cycleFingerprint = isCanonicalCycle(cycle) ? cycle.assignment.contentFingerprint : cycle.contentFingerprint;
  if (upload.contentFingerprint && cycleFingerprint === upload.contentFingerprint) {
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
    isCanonicalCycle(cycle)
      ? cycle.assignment.targets
      : cycle.contentProfile?.concepts ?? cycle.capturedContent?.contentProfile.concepts ?? [],
  );
  if (conceptOverlap > 0) {
    score += conceptOverlap * 0.2;
    evidence.push(`concept overlap ${(conceptOverlap * 100).toFixed(0)}%`);
  }

  const wordOverlap = overlapScore(upload.words, isCanonicalCycle(cycle) ? [] : cycle.wordList ?? []);
  if (wordOverlap > 0) {
    score += wordOverlap * 0.25;
    evidence.push(`word overlap ${(wordOverlap * 100).toFixed(0)}%`);
  }

  const dateScore = dateProximityScore(upload.testDate, isCanonicalCycle(cycle) ? null : cycle.testDate);
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
  cycles: HomeworkCycleCandidateRecord[],
): HomeworkMatchCandidate[] {
  return cycles
    .map((cycle) => scoreHomeworkCycleCandidate(upload, cycle))
    .filter((candidate) => candidate.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence);
}

export function selectHomeworkMatch(
  candidates: HomeworkMatchCandidate[],
  selectedHomeworkId?: string,
): HomeworkMatchCandidate | null {
  if (!selectedHomeworkId) return candidates[0] ?? null;
  const selected = candidates.find((candidate) => candidate.homeworkId === selectedHomeworkId);
  if (!selected) throw new Error(`returned_work_selected_assignment_missing:${selectedHomeworkId}`);
  return selected;
}

function cyclesDir(rootDir: string, childId: string): string {
  return path.join(rootDir, "src", "context", childId, "homework", "cycles");
}

function loadCycles(rootDir: string, childId: string): HomeworkCycleCandidateRecord[] {
  const dir = cyclesDir(rootDir, childId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as HomeworkCycleCandidateRecord;
      } catch {
        return null;
      }
    })
    .filter((cycle): cycle is HomeworkCycleCandidateRecord => cycle != null);
}

function parseCliArgs(argv: string[]): CliArgs {
  const childArg = argv.find((arg) => arg.startsWith("--child="));
  const pdfArg = argv.find((arg) => arg.startsWith("--pdf="));
  const childId = childArg?.slice("--child=".length).trim().toLowerCase() ?? "";
  const pdfPath = pdfArg?.slice("--pdf=".length).trim() ?? "";
  const homeworkArg = argv.find((arg) => arg.startsWith("--homework="));
  if (!childId) throw new Error("Missing --child=<childId>");
  if (!pdfPath) throw new Error("Missing --pdf=<path>");
  return {
    childId,
    pdfPath,
    homeworkId: homeworkArg?.slice("--homework=".length).trim(),
    dryRun: argv.includes("--dry-run"),
    yes: argv.includes("--yes"),
  };
}

async function uploadFromFile(args: CliArgs): Promise<GradedHomeworkUpload> {
  const sourceFile = path.resolve(args.pdfPath);
  const isText = /\.(txt|md|json)$/i.test(sourceFile);
  let rawText = isText && fs.existsSync(sourceFile) ? fs.readFileSync(sourceFile, "utf8") : "";
  if (/\.pdf$/i.test(sourceFile)) {
    rawText = (await extractAssignmentSource(sourceFile)).fullText;
  }
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

async function recordCanonicalUpload(input: {
  rootDir: string;
  now: Date;
  upload: GradedHomeworkUpload;
  candidate: HomeworkMatchCandidate & { cycle: LearningCycleRecordV2 };
  explicitSelection: boolean;
  interpret?: UploadRunOptions["interpret"];
}): Promise<{ status: string; calibrationId: string }> {
  if (input.upload.gradedItems.length === 0) {
    throw new Error("returned_work_item_review_required");
  }
  const bytes = fs.readFileSync(input.upload.sourceFile);
  const fileFingerprint = crypto.createHash("sha256").update(bytes).digest("hex");
  const sourceId = `returned-work:${crypto.createHash("sha256").update(`${input.upload.childId}:${input.candidate.homeworkId}:${fileFingerprint}`).digest("hex").slice(0, 20)}`;
  const sourceDir = path.join(resolveChildContextDir(input.upload.childId, { rootDir: input.rootDir }), "homework", "returned-work", "sources", sourceId.replace(/:/g, "-"));
  fs.mkdirSync(sourceDir, { recursive: true });
  const sourceFile = path.join(sourceDir, path.basename(input.upload.sourceFile));
  if (!fs.existsSync(sourceFile)) fs.copyFileSync(input.upload.sourceFile, sourceFile, fs.constants.COPYFILE_EXCL);
  const cycle = recordConfirmedReturnedWork({
    childId: input.upload.childId,
    homeworkId: input.candidate.homeworkId,
    source: {
      sourceId,
      type: "graded_work",
      fileFingerprint,
      sourceFile,
      provenance: "caregiver",
      capturedAt: input.now.toISOString(),
      assignmentLink: {
        homeworkId: input.candidate.homeworkId,
        method: input.explicitSelection ? "explicit_selection" : "content_match",
        confidence: input.explicitSelection ? 1 : input.candidate.confidence,
        confirmedBy: "caregiver",
      },
      status: "confirmed",
    },
    ...(typeof input.upload.score === "number" ? { score: { earned: input.upload.score, possible: input.upload.score <= 1 ? 1 : 100 } } : {}),
    items: input.upload.gradedItems.map((item, index) => ({
      itemId: `item-${index + 1}`,
      prompt: item.target,
      correct: item.correct,
      ...(item.observedErrorType ? { observedErrorType: item.observedErrorType } : {}),
      ...(item.note ? { teacherNote: item.note } : {}),
      extractionConfidence: 1,
      constructLinks: [{ constructId: item.target, role: "primary", confidence: 1 }],
    })),
  }, { rootDir: input.rootDir, now: input.now });
  const result = await interpretReturnedWorkBatch({
    childId: input.upload.childId,
    homeworkId: input.candidate.homeworkId,
    sourceId,
    rootDir: input.rootDir,
    now: input.now,
    interpret: input.interpret,
  });
  return {
    status: result.reason === "already_interpreted" ? "already_interpreted" : cycle.calibrations?.at(-1)?.status ?? "inconclusive",
    calibrationId: cycle.calibrations?.at(-1)?.calibrationId ?? sourceId,
  };
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
  const upload = await uploadFromFile(args);
  const candidates = rankHomeworkCycleCandidates(upload, loadCycles(rootDir, args.childId));
  const selected = args.homeworkId
    ? selectHomeworkMatch(
        loadCycles(rootDir, args.childId).map((cycle) => scoreHomeworkCycleCandidate(upload, cycle)),
        args.homeworkId,
      )
    : null;
  const orderedCandidates = selected
    ? [selected, ...candidates.filter((candidate) => candidate.homeworkId !== selected.homeworkId)]
    : candidates;
  logger.log(`📄 Graded upload: ${path.basename(upload.sourceFile)}`);
  if (orderedCandidates.length === 0 || (!selected && (orderedCandidates[0]?.confidence ?? 0) < MIN_CONFIDENT_MATCH)) {
    logger.log("⚠️  No confident assignment match found.");
    if (orderedCandidates[0]) {
      logger.log(
        `Best guess was ${orderedCandidates[0].homeworkId} at confidence ${orderedCandidates[0].confidence.toFixed(2)}; queued for human remap.`,
      );
    }
    if (!args.dryRun) {
      fs.writeFileSync(unmatchedPath(rootDir, args.childId, now), JSON.stringify(upload, null, 2), "utf8");
    }
    return;
  }
  logger.log("Likely assignment matches:");
  orderedCandidates.slice(0, 5).forEach((candidate, idx) => {
    logger.log(`${idx + 1}. ${candidate.homeworkId} — ${candidate.title} — confidence ${candidate.confidence.toFixed(2)}`);
    logger.log(`   evidence: ${candidate.evidence.join(", ") || "weak metadata match"}`);
  });
  if (args.dryRun) {
    logger.log("Dry run: no calibration written.");
    return;
  }
  for (const candidate of orderedCandidates) {
    if (!(await confirmCandidate(candidate, args.yes || candidate.homeworkId === args.homeworkId, opts.confirm))) continue;
    let entry: { status: string; calibrationId: string };
    if (isCanonicalCycle(candidate.cycle)) {
      try {
        entry = await recordCanonicalUpload({
          rootDir,
          now,
          upload,
          candidate: { ...candidate, cycle: candidate.cycle },
          explicitSelection: candidate.homeworkId === args.homeworkId,
          interpret: opts.interpret,
        });
      } catch (error) {
        if (error instanceof Error && error.message === "returned_work_item_review_required") {
          fs.writeFileSync(unmatchedPath(rootDir, args.childId, now), JSON.stringify(upload, null, 2), "utf8");
          logger.log("⚠️  Item-level review is required; queued the upload without changing learning state.");
          return;
        }
        logger.log(`⚠️  Evidence saved; Planner interpretation is pending: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
    } else {
      entry = recordGradedHomeworkCalibration(args.childId, {
        homeworkId: candidate.homeworkId,
        score: upload.score ?? null,
        gradedItems: upload.gradedItems,
        teacherNotes: `Uploaded graded homework from ${path.basename(upload.sourceFile)}.`,
        sourceFile: path.basename(upload.sourceFile),
      }, {
        rootDir,
        now,
      });
    }
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
