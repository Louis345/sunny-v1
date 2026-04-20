import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { buildProfile } from "../profiles/buildProfile";
import { generateQuestGameHtml, parseExtractedJson, textFromMessage } from "./generateGame";
import { readLearningProfile, writeLearningProfile } from "../utils/learningProfileIO";
import type { LearningProfile } from "../context/schemas/learningProfile";

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
  type: "pronunciation" | "karaoke" | "word-builder" | "quest" | "boss";
  words: string[];
  difficulty: 1 | 2 | 3;
  rationale: string;
  gameFile?: string | null;
  storyFile?: string | null;
  date?: string;
};

type NodePlan = {
  nodes: PlannedNode[];
  sessionNotes: string;
};

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
      gameFile: node.gameFile ?? null,
      storyFile: node.storyFile ?? null,
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

function readLastSessionNotes(childId: string): string[] {
  const notesDir = path.join(process.cwd(), "src", "context", childId, "session_notes");
  if (!fs.existsSync(notesDir)) return [];
  const files = fs
    .readdirSync(notesDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .slice(-3);
  return files.map((f) => fs.readFileSync(path.join(notesDir, f), "utf8"));
}

function readWordBankState(childId: string): unknown {
  const wordBankPath = path.join(process.cwd(), "src", "context", childId, "word_bank.json");
  if (!fs.existsSync(wordBankPath)) return null;
  return JSON.parse(fs.readFileSync(wordBankPath, "utf8")) as unknown;
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

async function askPsychologistQuestions(
  client: Anthropic,
  context: Record<string, unknown>,
  nonInteractive: boolean,
): Promise<string[]> {
  const msg = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 400,
    system:
      "You are the Psychologist for Project Sunny. You are speaking to the PARENT/DEVELOPER not the child. Adult review mode. Ask at most 2 clarifying questions. Be concise and direct. Return JSON only: {\"questions\": string[]}",
    messages: [{ role: "user", content: JSON.stringify(context) }],
  });
  const parsed = parseExtractedJson(textFromMessage(msg)) as { questions?: string[] };
  const questions = Array.isArray(parsed.questions) ? parsed.questions.slice(0, 2) : [];
  if (nonInteractive) return [];
  return questions;
}

async function buildNodePlan(
  client: Anthropic,
  context: Record<string, unknown>,
  qa: Array<{ question: string; answer: string }>,
): Promise<NodePlan> {
  const msg = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 2000,
    system:
      "You are the Psychologist for Project Sunny. You are speaking to the PARENT/DEVELOPER not the child. Adult review mode. Ask at most 2 clarifying questions. Then generate the node plan. Be concise and direct.",
    messages: [
      {
        role: "user",
        content: `Return JSON only:
{
  "nodes": [{
    "type": "pronunciation"|"karaoke"|"word-builder"|"quest"|"boss",
    "words": string[],
    "difficulty": 1|2|3,
    "rationale": string
  }],
  "sessionNotes": string
}

Context:
${JSON.stringify({ ...context, qa }, null, 2)}`,
      },
    ],
  });
  const parsed = parseExtractedJson(textFromMessage(msg)) as NodePlan;
  const nodes = (parsed.nodes ?? []).map((node, idx) => ({
    id: `hw-${idx + 1}`,
    type: node.type,
    words: Array.isArray(node.words) ? node.words : [],
    difficulty: node.difficulty ?? 1,
    rationale: node.rationale ?? "",
  }));
  return {
    nodes,
    sessionNotes: parsed.sessionNotes ?? "",
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

  console.log("📄 Step 1/5: Reading homework...");
  const extracted = await extractHomework(client, incomingFile);
  fs.writeFileSync(
    path.join(pendingDir, "classification.json"),
    JSON.stringify(extracted, null, 2),
    "utf8",
  );

  console.log("🧠 Step 2/5: Psychologist review...");
  const profile = await buildProfile(childId);
  const notes = readLastSessionNotes(childId);
  const wordBankState = readWordBankState(childId);
  const psychContext = {
    extractedHomework: extracted,
    childProfile: profile,
    wordBankState,
    lastSessionNotes: notes,
    currentDate: today,
    testDate: extracted.testDate,
  };

  const nonInteractive =
    process.env.SUNNY_NON_INTERACTIVE === "true" || !process.stdin.isTTY;
  const questions = await askPsychologistQuestions(client, psychContext, nonInteractive);
  const qa: Array<{ question: string; answer: string }> = [];
  if (!nonInteractive && questions.length > 0) {
    const rl = readline.createInterface({ input, output });
    for (const question of questions) {
      const answer = await rl.question(`${question}\n> `);
      qa.push({ question, answer: answer.trim() });
    }
    rl.close();
  }
  const nodePlan = await buildNodePlan(client, psychContext, qa);

  console.log("🎮 Step 3/5: Generating games...");
  for (const node of nodePlan.nodes) {
    if (node.type === "karaoke") {
      const story = await generateKaraokeStory(client, node.words);
      node.storyFile = "karaoke-story.txt";
      fs.writeFileSync(path.join(pendingDir, "karaoke-story.txt"), story, "utf8");
    } else if (node.type === "quest") {
      const generated = await generateQuestGameHtml({
        client,
        extractedJsonPretty: JSON.stringify(extracted, null, 2),
      });
      const contractReady = ensureQuestHtmlContract(generated);
      const gameFile = `quest-${today}.html`;
      node.gameFile = gameFile;
      node.date = today;
      fs.writeFileSync(path.join(pendingDir, gameFile), contractReady, "utf8");
    } else if (node.type === "boss") {
      if (!opus) {
        console.log("Boss node requires --opus flag. Skipping.");
        continue;
      }
      const generated = await generateQuestGameHtml({
        client,
        extractedJsonPretty: JSON.stringify(extracted, null, 2),
      });
      const gameFile = `boss-${today}.html`;
      node.gameFile = gameFile;
      node.date = today;
      fs.writeFileSync(path.join(pendingDir, gameFile), ensureQuestHtmlContract(generated), "utf8");
    }
  }

  console.log("💾 Step 4/5: Saving plan...");
  fs.writeFileSync(path.join(pendingDir, "node-plan.json"), JSON.stringify(nodePlan, null, 2), "utf8");

  const profileDoc = readLearningProfile(childId);
  if (!profileDoc) {
    throw new Error(`Could not read learning_profile.json for child: ${childId}`);
  }
  profileDoc.pendingHomework = buildPendingHomeworkPayload({
    weekOf: today,
    testDate: extracted.testDate,
    wordList: extracted.words,
    nodes: nodePlan.nodes,
  });
  writeLearningProfile(childId, profileDoc);

  console.log("✅ Step 5/5: Complete");
  console.log(`✅ ${nodePlan.nodes.length} nodes generated`);
  console.log(`📁 Saved to src/context/${childId}/homework/pending/${today}/`);
  console.log("");
  console.log("Run preview:  npm run sunny:homework:preview");
  console.log("Run session:  npm run sunny:homework");
}

if (typeof require !== "undefined" && require.main === module) {
  runIngestHomework(process.argv.slice(2)).catch((err) => {
    console.error("🎮 [ingestHomework] failed", err);
    process.exit(1);
  });
}
