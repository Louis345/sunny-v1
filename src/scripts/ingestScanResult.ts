import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import {
  generateHomeworkId,
  matchScanToHomework,
  computeCycleDelta,
  computeIndependenceRate,
} from "../context/schemas/homeworkCycle";
import type { HomeworkCycle, CycleDelta, ScanResult } from "../context/schemas/homeworkCycle";
import { readWordBank, writeWordBank } from "../utils/wordBankIO";
import { parseExtractedJson, textFromMessage } from "./generateGame";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

// ---------------------------------------------------------------------------
// File I/O helpers (exported for tests)
// ---------------------------------------------------------------------------

export function loadCycles(childId: string): HomeworkCycle[] {
  const dir = cyclesDirFor(childId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as HomeworkCycle;
      } catch {
        return null;
      }
    })
    .filter((c): c is HomeworkCycle => c !== null);
}

export function writeCycle(childId: string, cycle: HomeworkCycle): void {
  const dir = cyclesDirFor(childId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${cycle.homeworkId}.json`), JSON.stringify(cycle, null, 2), "utf8");
}

function cyclesDirFor(childId: string): string {
  return path.join(process.cwd(), "src", "context", childId, "homework", "cycles");
}

function assumptionsDirFor(childId: string): string {
  return path.join(process.cwd(), "src", "context", childId, "assumptions");
}

function readPreAssumptions(childId: string, homeworkId: string): string | null {
  const dir = assumptionsDirFor(childId);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith("-pre.md")).sort();
  if (files.length === 0) return null;
  // Prefer the most recent pre.md that mentions this homeworkId
  const byId = files.find((f) => {
    const content = fs.readFileSync(path.join(dir, f), "utf8");
    return content.includes(homeworkId);
  });
  const target = byId ?? files[files.length - 1]!;
  return fs.readFileSync(path.join(dir, target), "utf8");
}

// ---------------------------------------------------------------------------
// Post-analysis prompt (exported for tests)
// ---------------------------------------------------------------------------

export function buildPostAnalysisPrompt(args: {
  preAssumptions: string | null;
  deltaData: CycleDelta[];
  independenceRate: number | null;
}): string {
  const { preAssumptions, deltaData, independenceRate } = args;

  const deltaTable = deltaData
    .map(
      (d) =>
        `- **${d.word}**: inSystem=${d.inSystemAccuracy.toFixed(2)}, isolated=${d.isolatedAccuracy.toFixed(2)}, delta=${d.accuracyDelta >= 0 ? "+" : ""}${d.accuracyDelta.toFixed(2)}, transfer=${d.isolatedImprovedOverSystem ? "yes" : "no"}`,
    )
    .join("\n");

  return `You are writing a post-session analysis for a learning psychologist.
Be factual. Write what was predicted vs what happened.
Adjust SM-2 recommendations only based on evidence.

## What was predicted
${preAssumptions ?? "No prior assumptions recorded."}

## What actually happened
Per-word delta (inSystem vs isolated performance):
${deltaTable || "No delta data."}

Independence rate (words not drilled this week, correct in isolation): ${
    independenceRate === null ? "N/A (all words were drilled)" : `${(independenceRate * 100).toFixed(0)}%`
  }

---

Write a post-analysis using exactly these section headers:

## What was predicted
## What actually happened
## Words that transferred (independent success)
## Words that didn't transfer
## SM-2 dial adjustments recommended
## Assumptions to update`;
}

// ---------------------------------------------------------------------------
// Haiku scan extraction
// ---------------------------------------------------------------------------

type ScanWordResult = {
  word: string;
  writtenAs: string;
  correct: boolean;
};

async function extractScanResults(
  client: Anthropic,
  filePath: string,
): Promise<ScanWordResult[]> {
  const prompt = `Extract each spelling word from this handwritten homework scan and whether it was written correctly.
Return JSON only:
{ "words": [{ "word": string, "writtenAs": string, "correct": boolean }] }`;
  const isPdf = filePath.toLowerCase().endsWith(".pdf");
  const content = isPdf
    ? [
        {
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: fs.readFileSync(filePath).toString("base64"),
          },
        },
        { type: "text" as const, text: prompt },
      ]
    : `${prompt}\n\nHomework scan text:\n${fs.readFileSync(filePath, "utf8")}`;
  const msg = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content }],
  });
  const parsed = parseExtractedJson(textFromMessage(msg)) as {
    words?: Partial<ScanWordResult>[];
  };
  return (parsed.words ?? []).map((w) => ({
    word: String(w.word ?? ""),
    writtenAs: String(w.writtenAs ?? ""),
    correct: Boolean(w.correct),
  }));
}

// ---------------------------------------------------------------------------
// SM-2 adjustments
// ---------------------------------------------------------------------------

function applyDeltaToWordBank(childId: string, delta: CycleDelta[], today: string): void {
  const bank = readWordBank(childId);
  for (const d of delta) {
    const entry = bank.words.find((w) => w.word.toLowerCase() === d.word.toLowerCase());
    if (!entry?.tracks.spelling) continue;
    const st = entry.tracks.spelling;
    if (d.isolatedAccuracy > d.inSystemAccuracy) {
      st.easinessFactor = Math.min(st.easinessFactor + 0.1, 5.0);
    } else if (d.isolatedAccuracy < d.inSystemAccuracy) {
      st.easinessFactor = Math.max(st.easinessFactor - 0.1, 1.3);
    }
    // Significant boost for independent mastery (correct in isolation without drilling)
    if (d.isolatedAccuracy === 1 && d.inSystemAccuracy < 1) {
      st.easinessFactor = Math.min(st.easinessFactor + 0.3, 5.0);
    }
  }
  writeWordBank(childId, bank);
}

// ---------------------------------------------------------------------------
// Post-analysis via Haiku
// ---------------------------------------------------------------------------

async function generatePostMd(
  client: Anthropic,
  args: {
    preAssumptions: string | null;
    deltaData: CycleDelta[];
    independenceRate: number | null;
  },
): Promise<string> {
  const systemPrompt = buildPostAnalysisPrompt(args);
  const msg = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 1500,
    messages: [{ role: "user", content: systemPrompt }],
  });
  return textFromMessage(msg).trim();
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

function parseCliArgs(argv: string[]): { childId: string } {
  const childArg = argv.find((a) => a.startsWith("--child="));
  if (!childArg) throw new Error("Missing required argument --child=<childId>");
  const childId = childArg.slice("--child=".length).trim().toLowerCase();
  if (!childId) throw new Error("Missing required argument --child=<childId>");
  return { childId };
}

function listScanFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(pdf|txt)$/i.test(f))
    .map((f) => path.join(dir, f));
}

export async function runIngestScanResult(argv: string[]): Promise<void> {
  const { childId } = parseCliArgs(argv);
  const client = new Anthropic();
  const today = new Date().toISOString().slice(0, 10);

  const scanIncomingDir = path.join(
    process.cwd(),
    "src",
    "context",
    childId,
    "homework",
    "incoming",
  );
  const scanFiles = listScanFiles(scanIncomingDir);
  if (scanFiles.length === 0) {
    throw new Error(`No scan files found in ${scanIncomingDir}. Expected .pdf or .txt file.`);
  }
  const scanFile = scanFiles[0]!;

  // Step 1: Extract scan with Haiku
  console.log("📄 Step 1/6: Extracting scan results...");
  const scanWords = await extractScanResults(client, scanFile);
  const scanWordList = scanWords.map((w) => w.word);
  const overallScore =
    scanWords.length > 0 ? scanWords.filter((w) => w.correct).length / scanWords.length : 0;
  console.log(`✅ Extracted ${scanWords.length} words, overall score: ${(overallScore * 100).toFixed(0)}%`);

  // Step 2: Match to existing cycle
  console.log("🔍 Step 2/6: Matching scan to homework cycle...");
  const cycles = loadCycles(childId);
  const matched = matchScanToHomework(scanWordList, cycles);

  if (!matched) {
    const unmatchedDir = path.join(
      process.cwd(),
      "src",
      "context",
      childId,
      "homework",
      "unmatched",
    );
    fs.mkdirSync(unmatchedDir, { recursive: true });
    const dest = path.join(unmatchedDir, `scan-${today}.json`);
    fs.writeFileSync(
      dest,
      JSON.stringify({ scannedAt: today, words: scanWords }, null, 2),
      "utf8",
    );
    console.warn(`⚠️  No cycle matched (>80% overlap required). Written to unmatched/${path.basename(dest)}`);
    return;
  }
  console.log(`✅ Matched to cycle: ${matched.homeworkId}`);

  // Step 3: Compute delta
  console.log("📊 Step 3/6: Computing delta...");
  const bank = readWordBank(childId);
  const inSystemAttempts = matched.wordList.map((word) => {
    const entry = bank.words.find((w) => w.word.toLowerCase() === word.toLowerCase());
    const st = entry?.tracks?.spelling;
    const correct = st ? st.repetition > 0 && st.easinessFactor >= 2.0 : false;
    return { word, correct };
  });
  const isolatedAttempts = scanWords.map((w) => ({ word: w.word, correct: w.correct }));
  const delta = computeCycleDelta(inSystemAttempts, isolatedAttempts);
  const drilledThisWeek = matched.wordList;
  const independenceRate = computeIndependenceRate(isolatedAttempts, drilledThisWeek);
  console.log(
    `✅ Delta computed for ${delta.length} words. Independence rate: ${independenceRate === null ? "N/A" : `${(independenceRate * 100).toFixed(0)}%`}`,
  );

  // Step 4: Write cycle update
  console.log("💾 Step 4/6: Writing cycle update...");
  const scanResult: ScanResult = {
    scannedAt: today,
    wordAccuracy: scanWords.map((w) => ({ word: w.word, correct: w.correct, attempts: 1 })),
    overallScore,
    rawExtraction: JSON.stringify(scanWords),
  };
  const avgAccuracyDelta =
    delta.length > 0 ? delta.reduce((sum, d) => sum + d.accuracyDelta, 0) / delta.length : 0;
  const updatedCycle: HomeworkCycle = {
    ...matched,
    scanResult,
    delta,
    metrics: {
      accuracyDelta: avgAccuracyDelta,
      sm2Growth: 0,
      independenceRate: independenceRate ?? 0,
    },
  };
  writeCycle(childId, updatedCycle);
  console.log(`✅ Cycle updated → cycles/${matched.homeworkId}.json`);

  // Step 5: Post-analysis via Haiku
  console.log("🧠 Step 5/6: Generating post-analysis...");
  const preAssumptions = readPreAssumptions(childId, matched.homeworkId);
  const postMd = await generatePostMd(client, { preAssumptions, deltaData: delta, independenceRate });
  const assumptionsDir = assumptionsDirFor(childId);
  fs.mkdirSync(assumptionsDir, { recursive: true });
  const postMdPath = path.join(assumptionsDir, `${today}-post.md`);
  fs.writeFileSync(postMdPath, postMd, "utf8");
  console.log(`✅ Post-analysis written → assumptions/${today}-post.md`);

  // Write postAnalysis back to cycle
  const finalCycle: HomeworkCycle = { ...updatedCycle, postAnalysis: postMd };
  writeCycle(childId, finalCycle);

  // Step 6: Apply SM-2 adjustments
  console.log("🎓 Step 6/6: Applying SM-2 adjustments...");
  applyDeltaToWordBank(childId, delta, today);
  console.log("✅ word_bank.json updated with easiness factor adjustments");

  console.log("");
  console.log(`🎮 [ingestScanResult] Scan-back complete for ${childId}`);
  console.log(`   Cycle: ${matched.homeworkId}`);
  console.log(`   Overall score: ${(overallScore * 100).toFixed(0)}%`);
  console.log(
    `   Independence rate: ${independenceRate === null ? "N/A" : `${(independenceRate * 100).toFixed(0)}%`}`,
  );
}

if (typeof require !== "undefined" && require.main === module) {
  runIngestScanResult(process.argv.slice(2)).catch((err) => {
    console.error("🎮 [ingestScanResult] failed", err);
    process.exit(1);
  });
}
