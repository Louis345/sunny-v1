import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { parseExtractedJson, textFromMessage } from "./generateGame";
import { readLearningProfile, writeLearningProfile } from "../utils/learningProfileIO";
import type { LearningProfile } from "../context/schemas/learningProfile";
import { reorderHomeworkNodesForSession } from "../engine/learningEngine";
import { readWordBank, writeWordBank } from "../utils/wordBankIO";
import { createFreshSM2Track } from "../context/schemas/wordBank";
import { generateHomeworkId } from "../context/schemas/homeworkCycle";
import type { HomeworkCycle } from "../context/schemas/homeworkCycle";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

type HomeworkType =
  | "spelling_test"
  | "reading"
  | "math"
  | "coins"
  | "clocks"
  | "generic";

type ExtractionShape = {
  title: string;
  type: HomeworkType;
  gradeLevel: number;
  testDate: string | null;
  words: string[];
  questions: Array<{
    id: number;
    question: string;
    type: "multiple_choice" | "written" | "fill_in";
    options: string[] | null;
    correctAnswer: string | null;
    hint: string;
  }>;
};

type PlannedNode = {
  id: string;
  type: "spell-check" | "pronunciation" | "karaoke" | "word-builder" | "quest" | "boss";
  words: string[];
  difficulty: 1 | 2 | 3;
  rationale: string;
  gameFile?: string | null;
  storyFile?: string | null;
  storyText?: string;
  date?: string;
};

type NodePlan = {
  nodes: PlannedNode[];
  sessionNotes: string;
};

function nextFriday(): string {
  const d = new Date();
  const day = d.getDay();
  const daysUntil = day <= 5 ? 5 - day : 6;
  d.setDate(d.getDate() + daysUntil);
  return d.toISOString().slice(0, 10);
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const today = new Date();
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function difficultyFromDaysUntil(days: number): 1 | 2 | 3 {
  if (days >= 3) return 1;
  if (days === 2) return 2;
  return 3;
}

const REQUIRED_NODE_ORDER = [
  "pronunciation",
  "karaoke",
  "word-builder",
  "quest",
  "boss",
] as const;

/** Spelling test: templates + mandatory AI quest before boss. */
const SPELLING_TEST_NODE_ORDER = [
  "spell-check",
  "pronunciation",
  "karaoke",
  "word-builder",
  "quest",
  "boss",
] as const;

const SPELLING_QUEST_RATIONALE =
  "AI-generated game provides fresh dynamic content to complement pre-built template practice";

function spellingDifficultyFromDaysUntil(days: number): 1 | 2 | 3 {
  if (days >= 4) return 1;
  if (days >= 2) return 2;
  return 3;
}

function defaultPlannedNode(
  type: PlannedNode["type"],
  idx: number,
  wordList: string[],
  difficulty: 1 | 2 | 3,
  useFullWordList: boolean,
): PlannedNode {
  const words = useFullWordList ? [...wordList] : wordList.slice(0, 12);
  return {
    id: `hw-${idx}`,
    type,
    words,
    difficulty,
    rationale: `Automatic ${type} node`,
    gameFile: null,
    storyFile: null,
  };
}

export function mergeNormalizedPlan(
  raw: Partial<PlannedNode>[],
  wordList: string[],
  difficulty: 1 | 2 | 3,
  opts?: { homeworkType?: HomeworkType; daysUntilTest?: number },
): PlannedNode[] {
  const spelling = opts?.homeworkType === "spelling_test";
  const order = spelling ? SPELLING_TEST_NODE_ORDER : REQUIRED_NODE_ORDER;
  const allowed = new Set<string>([...order]);
  const spellingDiff = spellingDifficultyFromDaysUntil(opts?.daysUntilTest ?? 4);
  const byType = new Map<string, PlannedNode>();
  for (const n of raw) {
    const t = n?.type;
    if (!t || !allowed.has(t)) continue;
    const ty = t as PlannedNode["type"];
    const words = spelling
      ? [...wordList]
      : Array.isArray(n.words) && n.words.length
        ? n.words.map(String)
        : wordList.slice(0, 12);
    const diff = (
      spelling
        ? spellingDiff
        : n.difficulty === 1 || n.difficulty === 2 || n.difficulty === 3
          ? n.difficulty
          : difficulty
    ) as 1 | 2 | 3;
    const rationaleRaw = String(n.rationale ?? "");
    byType.set(ty, {
      id: String(n.id ?? ""),
      type: ty,
      words,
      difficulty: diff,
      rationale: spelling && ty === "quest" ? SPELLING_QUEST_RATIONALE : rationaleRaw,
      gameFile: n.gameFile ?? null,
      storyFile: n.storyFile ?? null,
    });
  }
  return (order as readonly PlannedNode["type"][]).map((type, i) => {
    const existing = byType.get(type);
    const idx = i + 1;
    if (existing) {
      const words = spelling ? [...wordList] : existing.words;
      const rationale =
        spelling && type === "quest" ? SPELLING_QUEST_RATIONALE : existing.rationale;
      return { ...existing, id: existing.id || `hw-${idx}`, words, rationale };
    }
    const created = defaultPlannedNode(type, idx, wordList, spelling ? spellingDiff : difficulty, spelling);
    if (spelling && type === "quest") {
      return { ...created, rationale: SPELLING_QUEST_RATIONALE };
    }
    return created;
  });
}

export function shouldGenerateBossNode(opusFlag: boolean): boolean {
  return opusFlag;
}

export function pickIncomingHomeworkFile(filePaths: string[]): string | null {
  const sorted = [...filePaths];
  const pdf = sorted.find((p) => p.toLowerCase().endsWith(".pdf"));
  if (pdf) return pdf;
  const txt = sorted.find((p) => p.toLowerCase().endsWith(".txt"));
  return txt ?? null;
}

export function normalizeHomeworkType(raw: string): HomeworkType {
  const value = raw.trim().toLowerCase();
  if (value === "spelling" || value === "spelling_test") return "spelling_test";
  if (value === "reading") return "reading";
  if (value === "math") return "math";
  if (value === "coins") return "coins";
  if (value === "clocks") return "clocks";
  return "generic";
}

export function ensureQuestHtmlContract(html: string): string {
  let out = html;
  if (!out.includes('_contract.js')) {
    if (/<head[^>]*>/i.test(out)) {
      out = out.replace(
        /<head[^>]*>/i,
        (m) => `${m}\n<script src="/games/_contract.js"></script>`,
      );
    } else {
      out = `<head><script src="/games/_contract.js"></script></head>\n${out}`;
    }
  }
  if (!out.includes('id="sunny-companion"')) {
    out = out.replace(/<body[^>]*>/i, (m) => `${m}\n<div id="sunny-companion"></div>`);
  }
  if (!out.includes("fireCompanionEvent(")) {
    out += `\n<script>
function __sunnyFire(evt, payload) {
  if (typeof fireCompanionEvent === "function") fireCompanionEvent(evt, payload || {});
}
__sunnyFire("game_start", {});
</script>\n`;
  }
  return out;
}

function homeworkGameBasename(p: string | null | undefined): string | null {
  if (p == null || p === "") return null;
  return path.basename(p);
}

/** Reorder like session engine; append placeholder boss if plan had none. */
export function finalizePlannedHomeworkNodes(
  nodes: PlannedNode[],
  extractedWords: string[],
  dateStr: string,
): PlannedNode[] {
  const skeleton = nodes.map((n) => ({
    id: n.id,
    type: n.type,
    words: n.words,
    difficulty: n.difficulty,
    gameFile: n.gameFile ?? null,
    storyFile: n.storyFile ?? null,
    storyText: n.storyText,
    date: n.date,
  }));
  const ordered = reorderHomeworkNodesForSession(skeleton);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let out = ordered.map((o) => {
    const full = byId.get(o.id);
    if (!full) {
      throw new Error(`finalizePlannedHomeworkNodes: missing node id ${o.id}`);
    }
    return full;
  });
  if (!out.some((n) => n.type === "boss")) {
    out = [
      ...out,
      {
        id: "hw-boss",
        type: "boss" as const,
        words: [...extractedWords],
        difficulty: 3 as const,
        rationale: "placeholder boss; run ingest with --opus to generate HTML",
        gameFile: null,
        storyFile: null,
        date: dateStr,
      },
    ];
  }
  return out;
}

export function buildPendingHomeworkPayload(args: {
  weekOf: string;
  testDate: string | null;
  wordList: string[];
  homeworkId: string;
  nodes: PlannedNode[];
}): NonNullable<LearningProfile["pendingHomework"]> & { homeworkId: string } {
  return {
    weekOf: args.weekOf,
    testDate: args.testDate,
    wordList: args.wordList,
    homeworkId: args.homeworkId,
    generatedAt: new Date().toISOString(),
    nodes: args.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      words: node.words,
      difficulty: node.difficulty,
      gameFile: homeworkGameBasename(node.gameFile ?? null),
      storyFile: node.storyFile ?? null,
      storyText: node.storyText,
      date: node.date ?? args.weekOf,
      approved: false,
    })),
  };
}

function parseCliArgs(argv: string[]): { childId: string; opus: boolean } {
  const childArg = argv.find((a) => a.startsWith("--child="));
  if (!childArg) {
    throw new Error("Missing required argument --child=<childId>");
  }
  const childId = childArg.slice("--child=".length).trim().toLowerCase();
  if (!childId) {
    throw new Error("Missing required argument --child=<childId>");
  }
  return { childId, opus: argv.includes("--opus") };
}

function listIncomingFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((name) => path.join(dir, name));
}

function readLastNSessionNotes(childId: string, n: number): string[] {
  const notesDir = path.join(process.cwd(), "src", "context", childId, "session_notes");
  if (!fs.existsSync(notesDir)) return [];
  const files = fs
    .readdirSync(notesDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .slice(-n);
  return files.map((f) => fs.readFileSync(path.join(notesDir, f), "utf8"));
}

/** Latest processed tutoring transcript (.txt), or null. */
export function readLatestTutoringContext(childId: string): string | null {
  const dir = path.join(
    process.cwd(),
    "src",
    "context",
    childId,
    "tutoring",
    "processed",
  );
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".txt"));
  if (files.length === 0) return null;
  const sorted = files
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return fs.readFileSync(path.join(dir, sorted[0]!.f), "utf8");
}


/**
 * Most recent reasoning.md from homework pending/processed.
 * @param opts.excludePendingDate — omit that pending date folder (same-day re-ingest).
 */
export function readPriorReasoning(
  childId: string,
  opts?: { excludePendingDate?: string },
): string | null {
  const bases = [
    path.join(process.cwd(), "src", "context", childId, "homework", "pending"),
    path.join(process.cwd(), "src", "context", childId, "homework", "processed"),
  ];
  const candidates: { p: string; mtime: number }[] = [];
  for (const base of bases) {
    if (!fs.existsSync(base)) continue;
    const isPending = path.basename(base) === "pending";
    for (const ent of fs.readdirSync(base, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      if (isPending && opts?.excludePendingDate && ent.name === opts.excludePendingDate) {
        continue;
      }
      const rp = path.join(base, ent.name, "reasoning.md");
      if (fs.existsSync(rp)) {
        candidates.push({ p: rp, mtime: fs.statSync(rp).mtimeMs });
      }
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return fs.readFileSync(candidates[0]!.p, "utf8");
}

export function archiveHomeworkReasoningToHistory(args: {
  childId: string;
  date: string;
  reasoningSourcePath: string;
}): string {
  const contextBase = path.join(process.cwd(), "src", "context", args.childId, "homework");
  const historyDir = path.join(contextBase, "reasoning-history");
  fs.mkdirSync(historyDir, { recursive: true });
  const dest = path.join(historyDir, `${args.date}-reasoning.md`);
  fs.copyFileSync(args.reasoningSourcePath, dest);
  return dest;
}


async function extractHomework(
  client: Anthropic,
  filePath: string,
): Promise<ExtractionShape> {
  const prompt = `Extract as JSON only:
{
  "title": string,
  "type": "spelling_test"|"reading"|"math"|"coins"|"clocks"|"generic",
  "gradeLevel": number,
  "testDate": string | null,
  "words": string[],
  "questions": [{
    "id": number,
    "question": string,
    "type": "multiple_choice"|"written"|"fill_in",
    "options": string[] | null,
    "correctAnswer": string | null,
    "hint": string
  }]
}`;
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
    : `${prompt}\n\nHomework text:\n${fs.readFileSync(filePath, "utf8")}`;
  const msg = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 8192,
    messages: [{ role: "user", content }],
  });
  const parsed = parseExtractedJson(textFromMessage(msg)) as Partial<ExtractionShape>;
  return {
    title: String(parsed.title ?? "Untitled Homework"),
    type: normalizeHomeworkType(String(parsed.type ?? "generic")),
    gradeLevel: Number(parsed.gradeLevel ?? 2),
    testDate: parsed.testDate ? String(parsed.testDate) : null,
    words: Array.isArray(parsed.words) ? parsed.words.map((w) => String(w)) : [],
    questions: Array.isArray(parsed.questions)
      ? parsed.questions.map((q, idx) => ({
          id: Number((q as { id?: number }).id ?? idx + 1),
          question: String((q as { question?: string }).question ?? ""),
          type: ((q as { type?: string }).type as "multiple_choice" | "written" | "fill_in") ?? "written",
          options: Array.isArray((q as { options?: string[] }).options)
            ? (q as { options: string[] }).options
            : null,
          correctAnswer:
            typeof (q as { correctAnswer?: string | null }).correctAnswer === "string"
              ? (q as { correctAnswer: string }).correctAnswer
              : null,
          hint: String((q as { hint?: string }).hint ?? ""),
        }))
      : [],
  };
}

/** Build a blank HomeworkCycle record for a freshly ingested homework. */
export function buildCycleStub(args: {
  homeworkId: string;
  subject: string;
  wordList: string[];
  ingestedAt: string;
  testDate: string | null;
}): HomeworkCycle {
  return {
    homeworkId: args.homeworkId,
    subject: args.subject,
    wordList: args.wordList,
    ingestedAt: args.ingestedAt,
    testDate: args.testDate,
    assumptions: null,
    postAnalysis: null,
    scanResult: null,
    delta: null,
    metrics: null,
  };
}

export async function runIngestHomework(argv: string[]): Promise<void> {
  const { childId } = parseCliArgs(argv);
  const client = new Anthropic();
  const today = new Date().toISOString().slice(0, 10);
  const contextBase = path.join(process.cwd(), "src", "context", childId, "homework");
  const incomingDir = path.join(contextBase, "incoming");
  const pendingDir = path.join(contextBase, "pending", today);
  fs.mkdirSync(pendingDir, { recursive: true });

  const incomingFile = pickIncomingHomeworkFile(listIncomingFiles(incomingDir));
  if (!incomingFile) {
    throw new Error(`No homework found in ${incomingDir}. Expected .pdf or .txt file.`);
  }

  console.log("📄 Step 1/3: Reading homework...");
  const extracted = await extractHomework(client, incomingFile);
  const testDate = extracted.testDate ?? nextFriday();
  const daysUntilTest = daysUntil(testDate);
  const wordsLine =
    extracted.words.length <= 5
      ? extracted.words.join(", ")
      : `${extracted.words.slice(0, 5).join(", ")}... (${extracted.words.length} words)`;
  console.log(`✅ Found: ${extracted.title}`);
  console.log(`   Words: ${wordsLine}`);
  console.log(`   Test date: ${testDate} (${daysUntilTest} days away)`);
  fs.writeFileSync(
    path.join(pendingDir, "classification.json"),
    JSON.stringify(extracted, null, 2),
    "utf8",
  );

  console.log("");
  console.log("📦 Step 2/3: Seeding word bank and creating cycle record...");

  const wordBank = readWordBank(childId);
  for (const raw of extracted.words) {
    const word = String(raw ?? "").trim();
    if (!word) continue;
    const lower = word.toLowerCase();
    let entry = wordBank.words.find((w) => w.word.toLowerCase() === lower);
    if (!entry) {
      entry = {
        word,
        addedAt: new Date().toISOString(),
        source: "homework",
        tracks: {},
      };
      wordBank.words.push(entry);
    }
    entry.homeworkPriority = true;
    entry.testDate = testDate;
    if (!entry.tracks.spelling) {
      entry.tracks.spelling = createFreshSM2Track(today);
    }
    const st = entry.tracks.spelling;
    if (st && st.nextReviewDate > today) {
      st.nextReviewDate = today;
    }
  }
  writeWordBank(childId, wordBank);
  console.log(
    `📝 Seeded ${extracted.words.length} words with homework priority → word_bank.json`,
  );

  const homeworkId = generateHomeworkId(extracted.type, extracted.words);
  const cyclesDir = path.join(process.cwd(), "src", "context", childId, "homework", "cycles");
  fs.mkdirSync(cyclesDir, { recursive: true });
  const cycleStub = buildCycleStub({
    homeworkId,
    subject: extracted.type,
    wordList: extracted.words,
    ingestedAt: today,
    testDate: extracted.testDate,
  });
  fs.writeFileSync(
    path.join(cyclesDir, `${homeworkId}.json`),
    JSON.stringify(cycleStub, null, 2),
    "utf8",
  );
  console.log(`🔁 Cycle record created → cycles/${homeworkId}.json`);

  const assumptionsDir = path.join(process.cwd(), "src", "context", childId, "assumptions");
  fs.mkdirSync(assumptionsDir, { recursive: true });
  const preMdPath = path.join(assumptionsDir, `${today}-pre.md`);
  fs.writeFileSync(
    preMdPath,
    `## Homework ingested — awaiting Psychologist analysis\n\nRun sunny:sync to generate session plan and assumptions.\n\n**homeworkId:** ${homeworkId}\n**words:** ${extracted.words.join(", ")}\n**testDate:** ${testDate}\n`,
    "utf8",
  );
  console.log(`📋 Placeholder assumptions → assumptions/${today}-pre.md`);

  console.log("");
  console.log("💾 Step 3/3: Saving...");

  const profileDoc = readLearningProfile(childId);
  if (!profileDoc) {
    throw new Error(`Could not read learning_profile.json for child: ${childId}`);
  }
  profileDoc.pendingHomework = buildPendingHomeworkPayload({
    weekOf: today,
    testDate,
    wordList: extracted.words,
    homeworkId,
    nodes: [],
  });
  writeLearningProfile(childId, profileDoc);

  console.log(`✅ Saved to src/context/${childId}/homework/pending/${today}/`);

  if (process.env.SUNNY_NON_INTERACTIVE === "true" || !process.stdin.isTTY) {
    console.log("");
    console.log("Run preview:  npm run sunny:homework:preview");
    console.log("Run session:  npm run sunny:homework");
    return;
  }

  const rl = readline.createInterface({ input, output });
  try {
    const answerRaw = await rl.question("\nOpen preview? [Y/n] ");
    const answer = answerRaw.trim().toLowerCase();
    if (answer !== "n") {
      spawnSync("npm run sunny:homework:preview", {
        cwd: process.cwd(),
        stdio: "inherit",
        shell: true,
        env: { ...process.env, VITE_DIAG_CHILD_ID: childId },
      });
    } else {
      console.log("");
      console.log("Run preview:  npm run sunny:homework:preview");
      console.log("Run session:  npm run sunny:homework");
    }
  } finally {
    rl.close();
  }
}

if (typeof require !== "undefined" && require.main === module) {
  runIngestHomework(process.argv.slice(2)).catch((err) => {
    console.error("🎮 [ingestHomework] failed", err);
    process.exit(1);
  });
}
