import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { buildProfile } from "../profiles/buildProfile";
import type { ChildProfile } from "../shared/childProfile";
import { generateQuestGameHtml, parseExtractedJson, textFromMessage } from "./generateGame";
import { validateGeneratedGame } from "./validateGeneratedGame";
import { readLearningProfile, writeLearningProfile } from "../utils/learningProfileIO";
import type { LearningProfile } from "../context/schemas/learningProfile";
import { reorderHomeworkNodesForSession } from "../engine/learningEngine";
import { readWordBank, writeWordBank } from "../utils/wordBankIO";
import { createFreshSM2Track } from "../context/schemas/wordBank";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const SONNET_MODEL = "claude-sonnet-4-20250514";

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
  nodes: PlannedNode[];
}): NonNullable<LearningProfile["pendingHomework"]> {
  return {
    weekOf: args.weekOf,
    testDate: args.testDate,
    wordList: args.wordList,
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

export type HomeworkWordConfidence = {
  word: string;
  confidence: number;
  repetitions: number;
  previouslyStruggled: boolean;
};

export type HomeworkAlgorithmSummary = {
  wilsonStep: number | "unknown";
  attentionWindow_ms: number;
  wordConfidence: HomeworkWordConfidence[];
  recentAccuracy: number[];
  averageAccuracy: number | null;
  sessionsAbove80: number;
};

export function buildHomeworkAlgorithmSummary(
  childId: string,
  homeworkWords: string[],
  lp: LearningProfile | null,
  profile: ChildProfile,
): HomeworkAlgorithmSummary {
  const bank = readWordBank(childId);
  const wordConfidence = homeworkWords.map((raw) => {
    const word = String(raw ?? "").trim();
    const lower = word.toLowerCase();
    const entry = bank.words.find((w) => w.word.toLowerCase() === lower);
    const st = entry?.tracks?.spelling;
    const confidence = st?.easinessFactor ?? 2.5;
    const repetitions = st?.repetition ?? 0;
    return {
      word,
      confidence,
      repetitions,
      previouslyStruggled: repetitions > 0 && confidence < 2.0,
    };
  });
  const ss = lp?.sessionStats;
  const extended = ss as
    | (NonNullable<typeof ss> & {
        recentAccuracy?: unknown;
        sessionsAbove80?: unknown;
      })
    | undefined;
  const raRaw = extended?.recentAccuracy;
  const recentAccuracy = Array.isArray(raRaw)
    ? raRaw.filter((x): x is number => typeof x === "number")
    : [];
  const sessionsAbove80 =
    typeof extended?.sessionsAbove80 === "number" ? extended.sessionsAbove80 : 0;
  const ws = ss?.currentWilsonStep;
  return {
    wilsonStep: typeof ws === "number" ? ws : "unknown",
    attentionWindow_ms: profile.attentionWindow_ms,
    wordConfidence,
    recentAccuracy,
    averageAccuracy: ss?.averageAccuracy ?? null,
    sessionsAbove80,
  };
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

const NODE_PLAN_JSON_RULES = `RULES FOR spelling_test TYPE:
  - Every node practices ALL words — never split words
    across nodes. Each node gets the full word list.
  - spell-check node is MANDATORY for spelling_test
    (baseline, gameFile: spell-check.html).
  - spell-check goes FIRST — it establishes a baseline
    before practice begins.
  - Order for spelling_test MUST be:
    1. spell-check  (baseline, static HTML)
    2. pronunciation (React component)
    3. karaoke      (React story / reading component; type key stays "karaoke")
    4. word-builder (template)
    5. quest        (MANDATORY — AI-generated dynamic game)
    6. boss         (AI with --opus only; always last)
  - quest is mandatory for spelling_test alongside templates.
  - All nodes get the complete word list in the
    'words' field — not a subset.
  - difficulty: 1 if 4+ days until test,
               2 if 2-3 days, 3 if 1 day

RULES FOR ALL TYPES:
  - boss is always last, always isCastle: true,
    always gameFile: null until --opus generates it
  - Only use quest when NO existing template fits (non-spelling_test)
  - max nodes = 6 for spelling_test, max nodes = 5 otherwise
  - Include a 'rationale' field on each node explaining in one sentence why this node type was chosen for this specific homework type and child profile.

Return JSON only:
{
  "nodes": [{
    "id": string,
    "type": "spell-check"|"pronunciation"|"karaoke"|"word-builder"|"quest"|"boss",
    "words": string[],
    "difficulty": 1|2|3,
    "gameFile": null,
    "storyFile": null,
    "rationale": string
  }]
}`;

/** Full user message for the Sonnet homework node planner (tests assert on this). */
export function buildPsychologistHomeworkPlanUserMessage(args: {
  algorithmSummary: HomeworkAlgorithmSummary;
  tutoringContext: string | null;
  sessionNotes: string[];
  priorReasoning: string | null;
  extraction: ExtractionShape;
  testDate: string;
  daysUntilTest: number;
}): string {
  const AVAILABLE_TOOLS = "";
  const {
    algorithmSummary,
    tutoringContext,
    sessionNotes,
    priorReasoning,
    extraction,
    testDate,
    daysUntilTest,
  } = args;
  const struggledWordsLine =
    algorithmSummary.wordConfidence
      .filter((w) => w.previouslyStruggled)
      .map((w) => w.word)
      .join(", ") || "none on record yet";

  return `You are planning a homework practice session.
Your goal is not task completion.
Your goal is CHILD INDEPENDENCE:
the child should eventually complete their
schoolwork without adult supervision.
Every session moves them one step closer.

${AVAILABLE_TOOLS}

ALGORITHM FEEDBACK (source of truth — trust this):
${JSON.stringify(algorithmSummary, null, 2)}

Words this child has previously struggled with
(easeFactor < 2.0 in SM-2):
${struggledWordsLine}

${
  tutoringContext
    ? `
HUMAN TUTOR SESSION (read carefully):
${tutoringContext}

Cross-reference: words tutor covered vs words
algorithm flags as weak. If tutor covered a word
AND SM-2 shows it as struggled → high priority.
If tutor covered a word and SM-2 shows mastered →
do not over-practice, move on.
`
    : "No tutor session on record."
}

RECENT SESSION NOTES (last 3 sessions):
${sessionNotes.join("\n---\n") || "No session notes yet."}

${
  priorReasoning
    ? `
PRIOR ASSUMPTIONS (from last session plan):
${priorReasoning}

CRITICAL: Review what was assumed last time.
Were those assumptions validated by the data above?
State explicitly in your rationale:
  - Which assumptions proved correct
  - Which assumptions proved wrong
  - What you are changing based on this evidence
`
    : "No prior session plan to review."
}

TODAY'S HOMEWORK:
${JSON.stringify(extraction, null, 2)}
Test date: ${testDate} (${daysUntilTest} days away)

INDEPENDENCE PROGRESSION:
Ask yourself: if this child practiced these nodes,
would they be MORE able to do their spelling homework
independently next week? Design for that outcome.
Not for a perfect session score.

${AVAILABLE_TOOLS}

Return node plan as JSON with rationale per node.

${NODE_PLAN_JSON_RULES}`;
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

async function buildAutomaticNodePlan(
  client: Anthropic,
  args: {
    childId: string;
    extraction: ExtractionShape;
    testDate: string;
    todayISO: string;
    daysUntilTest: number;
    profile: ChildProfile;
    sessionNotes: string[];
    learningProfile: LearningProfile | null;
    tutoringContext: string | null;
    priorReasoning: string | null;
  },
): Promise<NodePlan> {
  const {
    childId,
    extraction,
    testDate,
    todayISO,
    daysUntilTest,
    profile,
    sessionNotes,
    learningProfile,
    tutoringContext,
    priorReasoning,
  } = args;
  const algorithmSummary = buildHomeworkAlgorithmSummary(
    childId,
    extraction.words,
    learningProfile,
    profile,
  );
  const userPrompt = `${buildPsychologistHomeworkPlanUserMessage({
    algorithmSummary,
    tutoringContext,
    sessionNotes,
    priorReasoning,
    extraction,
    testDate,
    daysUntilTest,
  })}

Context: today is ${todayISO}.`;
  const msg = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 2000,
    system: "Return valid JSON only. No markdown fences. No prose.",
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
  });
  const parsed = parseExtractedJson(textFromMessage(msg)) as {
    nodes?: Partial<PlannedNode>[];
    sessionNotes?: string;
  };
  const baseDifficulty = difficultyFromDaysUntil(daysUntilTest);
  const merged = mergeNormalizedPlan(parsed.nodes ?? [], extraction.words, baseDifficulty, {
    homeworkType: extraction.type,
    daysUntilTest,
  });
  const maxNodes = extraction.type === "spelling_test" ? 6 : 5;
  const capped = merged.slice(0, maxNodes);
  return {
    nodes: capped,
    sessionNotes: typeof parsed.sessionNotes === "string" ? parsed.sessionNotes : "",
  };
}

async function generateKaraokeStory(
  client: Anthropic,
  words: string[],
  feedback?: string,
): Promise<string> {
  const msg = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 700,
    messages: [
      {
        role: "user",
        content: `Write a story for grade 2 readers.
- 150 words max
- max 8 words per sentence
- naturally include these words: ${words.join(", ")}
${feedback ? `- parent feedback: ${feedback}` : ""}
Return plain text only.`,
      },
    ],
  });
  return textFromMessage(msg).trim();
}

export async function runIngestHomework(argv: string[]): Promise<void> {
  const { childId, opus } = parseCliArgs(argv);
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

  console.log("📄 Step 1/4: Reading homework...");
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

  console.log("");
  console.log("🧠 Step 2/4: Building session plan...");
  const profile = await buildProfile(childId);
  if (!profile) {
    throw new Error(`Unknown child profile: ${childId}`);
  }
  const sessionNotes = readLastNSessionNotes(childId, 3);
  const lp = readLearningProfile(childId);
  const tutoringContext = readLatestTutoringContext(childId);
  const priorReasoning = readPriorReasoning(childId, { excludePendingDate: today });
  const nodePlan = await buildAutomaticNodePlan(client, {
    childId,
    extraction: extracted,
    testDate,
    todayISO: today,
    daysUntilTest,
    profile,
    sessionNotes,
    learningProfile: lp,
    tutoringContext,
    priorReasoning,
  });
  nodePlan.nodes = finalizePlannedHomeworkNodes(nodePlan.nodes, extracted.words, today);
  console.log(`✅ ${nodePlan.nodes.length} nodes planned`);

  const nodes = nodePlan.nodes;
  const reasoningLines = [
    `# Session Plan Reasoning`,
    `Generated: ${new Date().toISOString()}`,
    `Child: ${childId}`,
    `Homework: ${extracted.title ?? "Unknown"}`,
    `Type: ${extracted.type}`,
    `Test date: ${testDate} (${daysUntilTest} days away)`,
    ``,
    `## Why these nodes`,
    ...nodes.map(
      (n) =>
        `- **${n.type}**: ${n.rationale?.trim() ? n.rationale : "Standard node for this homework type"}`,
    ),
    ``,
    `## Assumptions made`,
    `- Homework type detected as: ${extracted.type}`,
    `- Test date: ${testDate ?? "Defaulted to Friday"}`,
    `- Total words: ${extracted.words?.length ?? 0}`,
    `- Difficulty: ${nodes[0]?.difficulty ?? 2}/3`,
    `- Word source: both lists combined`,
    ``,
    `## To challenge these decisions`,
    `Edit pending node plan:`,
    `  src/context/${childId}/homework/pending/${today}/node-plan.json`,
    ``,
    `Then regenerate:`,
    `  npm run sunny:ingest:homework -- --child=${childId}`,
  ];
  const reasoningPath = path.join(pendingDir, "reasoning.md");
  fs.writeFileSync(reasoningPath, reasoningLines.join("\n"), "utf8");
  console.log("📋 Reasoning saved → reasoning.md");
  archiveHomeworkReasoningToHistory({
    childId,
    date: today,
    reasoningSourcePath: reasoningPath,
  });
  console.log("📋 Reasoning archived → homework/reasoning-history/");

  console.log("");
  console.log("🎮 Step 3/4: Generating games...");
  let generatedQuest = false;
  let generatedKaraoke = false;
  for (const node of nodePlan.nodes) {
    if (node.type === "karaoke") {
      const story = await generateKaraokeStory(client, node.words);
      node.storyFile = "karaoke-story.txt";
      const storyFilePath = path.join(pendingDir, "karaoke-story.txt");
      fs.writeFileSync(storyFilePath, story, "utf8");
      node.storyText = fs.readFileSync(storyFilePath, "utf8");
      generatedKaraoke = true;
    } else if (node.type === "quest") {
      const questGenBase = {
        client,
        extractedJsonPretty: JSON.stringify(extracted, null, 2),
        homeworkType: extracted.type,
        testDate,
        childProfile: profile,
      };

      let questHtml = await generateQuestGameHtml(questGenBase);
      questHtml = ensureQuestHtmlContract(questHtml);
      let validation = validateGeneratedGame(questHtml, {
        words: extracted.words,
        homeworkType: extracted.type,
        childId,
      });

      console.log(
        `🔍 Game validation: ${validation.passed ? "✅" : "❌"} ` +
          `score=${validation.score}/100`,
      );
      if (validation.failures.length > 0) {
        console.log("  Failures:");
        validation.failures.forEach((f) => console.log(`    ✗ ${f}`));
      }
      if (validation.warnings.length > 0) {
        console.log("  Warnings:");
        validation.warnings.forEach((w) => console.log(`    ⚠ ${w}`));
      }

      if (!validation.passed && validation.shouldRegenerate) {
        console.log("🔄 Regenerating with validation feedback...");
        questHtml = await generateQuestGameHtml({
          ...questGenBase,
          validationFeedback: validation.failures.join("\n"),
        });
        questHtml = ensureQuestHtmlContract(questHtml);
        const v2 = validateGeneratedGame(questHtml, {
          words: extracted.words,
          homeworkType: extracted.type,
          childId,
        });
        console.log(
          `🔍 Retry validation: ${v2.passed ? "✅" : "❌"} ` + `score=${v2.score}/100`,
        );
        if (!v2.passed) {
          console.log("⚠️  Game failed validation twice.");
          console.log("   Saving anyway — review before Ila plays.");
        }
        validation = v2;
      }

      fs.writeFileSync(
        path.join(pendingDir, "game-quality.json"),
        JSON.stringify(
          {
            score: validation.score,
            passed: validation.passed,
            failures: validation.failures,
            warnings: validation.warnings,
            generatedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
        "utf8",
      );

      const gameFile = `quest-${today}.html`;
      node.gameFile = gameFile;
      node.date = today;
      fs.writeFileSync(path.join(pendingDir, gameFile), questHtml, "utf8");
      generatedQuest = true;
    } else if (node.type === "boss") {
      if (!opus) {
        console.log(
          "Boss node HTML requires --opus flag. Skipping file generation (placeholder remains on map).",
        );
      } else {
        const generated = await generateQuestGameHtml({
          client,
          extractedJsonPretty: JSON.stringify(extracted, null, 2),
          homeworkType: extracted.type,
          testDate,
          childProfile: profile,
        });
        const gameFile = `boss-${today}.html`;
        node.gameFile = gameFile;
        node.date = today;
        fs.writeFileSync(
          path.join(pendingDir, gameFile),
          ensureQuestHtmlContract(generated),
          "utf8",
        );
      }
    }
  }
  if (generatedQuest) {
    console.log("✅ Quest game generated");
  }
  if (generatedKaraoke) {
    console.log("✅ Karaoke story generated");
  }

  console.log("");
  console.log("💾 Step 4/4: Saving...");
  fs.writeFileSync(path.join(pendingDir, "node-plan.json"), JSON.stringify(nodePlan, null, 2), "utf8");

  const profileDoc = readLearningProfile(childId);
  if (!profileDoc) {
    throw new Error(`Could not read learning_profile.json for child: ${childId}`);
  }
  profileDoc.pendingHomework = buildPendingHomeworkPayload({
    weekOf: today,
    testDate,
    wordList: extracted.words,
    nodes: nodePlan.nodes,
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
