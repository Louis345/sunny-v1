import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { parseExtractedJson, textFromMessage } from "./generateGame";
import { readLearningProfile, writeLearningProfile } from "../utils/learningProfileIO";
import type { ActiveSessionPlan, LearningProfile } from "../context/schemas/learningProfile";
import { reorderHomeworkNodesForSession } from "../engine/learningEngine";
import { readWordBank, writeWordBank } from "../utils/wordBankIO";
import { createFreshSM2Track } from "../context/schemas/wordBank";
import { generateContentFingerprint, generateHomeworkId } from "../context/schemas/homeworkCycle";
import type { HomeworkCycle, HomeworkTestDateSource } from "../context/schemas/homeworkCycle";
import { runPsychologistSync } from "../agents/psychologist/sync";
import { scanChildErrorPatterns } from "../engine/error-signals/patternDetector";
import { buildPreQuestTheory } from "../engine/homeworkCycleLoop";
import {
  buildHomeworkCarePlan,
  renderHomeworkCarePlanMarkdown,
  type HomeworkCarePlan,
} from "../engine/homeworkCarePlan";
import {
  buildHomeworkContentCatalogItems,
  upsertProfileContentCatalog,
} from "../engine/learningDecisionContext";
import { getChildChart } from "../profiles/childChart";
import { writeActiveSessionPlan } from "../engine/sessionPlanFromChart";
import {
  buildExperiencePlannerInput,
  planPsychologistExperience,
  recordPlannerReview,
} from "../engine/experiencePlanner";
import {
  buildCapturedHomeworkContent,
  buildContentAwareHomeworkNodes,
  buildSpellingActivityNodes,
  interpretHomeworkAssignment,
  normalizeContentProfile,
  recommendBaselineActivities,
  type CapturedHomeworkContent,
  type ContentProfile,
  type HomeworkType,
  type HomeworkWordGroup,
  type PlannedHomeworkNode,
} from "./contentAwareHomeworkPlanner";
import { buildAdaptiveHomeworkPlan } from "../engine/adaptiveHomeworkPlan";
import {
  buildPreviewBoardCommand,
  maybeLaunchPreviewBoard,
} from "../utils/previewLauncher";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

type ExtractionShape = {
  title: string;
  type: HomeworkType;
  gradeLevel: number;
  testDate: string | null;
  words: string[];
  wordGroups?: Array<{
    id: string;
    label: string;
    purpose: "spell_from_memory" | "recognize" | "read_fluently" | "pronounce" | "define" | "unknown";
    words: string[];
    confidence: number;
    evidence: string[];
    scheduleAfter?: "spelling_measured" | null;
  }>;
  contentProfile: ContentProfile;
  capturedContent: CapturedHomeworkContent;
  contentFingerprint: string;
  questions: Array<{
    id: number;
    question: string;
    type: "multiple_choice" | "written" | "fill_in";
    options: string[] | null;
    correctAnswer: string | null;
    hint: string;
  }>;
};

type PlannedNode = PlannedHomeworkNode;

export type IngestHomeworkDomain = "spelling" | "reading" | "math" | "science";

type PromptFn = (prompt: string) => Promise<string> | string;

function readCliValue(argv: string[], flags: string[]): string | null {
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i] ?? "";
    for (const flag of flags) {
      if (part === flag) {
        const next = argv[i + 1];
        return next && !next.startsWith("--") ? next.trim() : "";
      }
      if (part.startsWith(`${flag}=`)) {
        return part.slice(flag.length + 1).trim();
      }
    }
  }
  return null;
}

function normalizeIngestDomain(raw: string | null): IngestHomeworkDomain | undefined {
  const value = raw?.trim().toLowerCase();
  if (value === "spelling" || value === "reading" || value === "math" || value === "science") {
    return value;
  }
  if (value) {
    throw new Error(`Invalid homework domain: ${raw}`);
  }
  return undefined;
}

function wordRadarItemsFromWordList(wordList: string[]): NonNullable<PlannedNode["wordRadarItems"]> {
  return wordList.map((w) => ({
    display: w,
    acceptedResponses: [w.toLowerCase()],
    label: "Spelling",
    subject: "spelling",
  }));
}

/**
 * Persisted map + session spelling source; word cap from child profile `games["spell-check"].maxWords`.
 * The live homework **mystery** node (Monster Stampede / Speed Catcher alternation) is injected in
 * `startMapSession` in `map-coordinator.ts` via `selectMysteryGame` (random from that child's companion
 * `dopamineGames` in `children.config.json`) — not part of this node list.
 */
export function buildHomeworkNodes(args: {
  type: HomeworkType;
  words: string[];
  homeworkId: string;
  childId: string;
  testDate?: string | null;
  /** Prior session misses — highest priority in SM-2 ordering (same as map `reinforceWords`). */
  missedWords?: string[];
  contentProfile?: ContentProfile | null;
  capturedContent?: import("./contentAwareHomeworkPlanner").CapturedHomeworkContent;
}): PlannedNode[] {
  return buildContentAwareHomeworkNodes(args);
}

type NodePlan = {
  nodes: PlannedNode[];
  sessionNotes: string;
};

export function nextFriday(): string {
  const d = new Date();
  const day = d.getDay();
  const daysToAdd = day < 5 ? 5 - day : day === 5 ? 7 : 6;
  d.setDate(d.getDate() + daysToAdd);
  return d.toISOString().slice(0, 10);
}

function normalizeIdSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function buildHomeworkReturnTag(childId: string, homeworkId: string): string {
  return `#sunny_${normalizeIdSegment(childId)}_${normalizeIdSegment(homeworkId)}`;
}

function validIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return Number.isFinite(Date.parse(`${value}T00:00:00.000Z`));
}

async function promptForLine(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    return await rl.question(prompt);
  } finally {
    rl.close();
  }
}

async function promptForTestDate(prompt: string): Promise<string> {
  return promptForLine(prompt);
}

async function promptForSessionPlanNote(interactive: boolean): Promise<string | undefined> {
  if (!interactive) return undefined;
  const answer = String(
    await promptForLine(
      "Any session-plan note for Sunny? Press Enter for the adaptive plan, or type a short focus/avoid note: ",
    ),
  ).trim();
  return answer || undefined;
}

function printExperiencePlanReview(plan: ActiveSessionPlan): void {
  console.log("");
  console.log("🧠 AI psychologist experience plan");
  console.log(`  🎮 [experience-planner] [plan] id=${plan.planId} status=${plan.approvalStatus ?? "pending"} confidence=${plan.plannerConfidence ?? "unknown"}`);
  console.log(`  Theory: ${plan.planTheory?.hypothesis ?? "No theory recorded."}`);
  console.log(`  Nodes: ${plan.nodePlan.map((node) => `${node.type}(${node.targets.length})`).join(" → ")}`);
  if (plan.generatedExperienceBriefs?.length) {
    for (const brief of plan.generatedExperienceBriefs) {
      console.log(
        `  Brief: ${brief.kind} "${brief.title}" status=${brief.artifactStatus} validation=${brief.validationRequired ? "required" : "not-required"}`,
      );
    }
  }
  console.log("");
}

async function reviewExperiencePlan(
  childId: string,
  plan: ActiveSessionPlan,
  interactive: boolean,
): Promise<ActiveSessionPlan> {
  printExperiencePlanReview(plan);
  if (!interactive || plan.approvalStatus === "auto_approved") {
    return plan;
  }
  const answer = String(
    await promptForLine("Approve this AI session plan for the next child session? [Y/n] "),
  ).trim().toLowerCase();
  if (answer === "n" || answer === "no") {
    recordPlannerReview(childId, {
      planId: plan.planId,
      status: "rejected",
      reviewer: process.env.SUNNY_REVIEWER?.trim() || "parent",
      decidedAt: new Date().toISOString(),
      notes: "Rejected during homework ingestion.",
    });
    throw new Error("experience_plan_rejected: rerun ingestion with a parent note or adjust the chart evidence");
  }
  recordPlannerReview(childId, {
    planId: plan.planId,
    status: "approved",
    reviewer: process.env.SUNNY_REVIEWER?.trim() || "parent",
    decidedAt: new Date().toISOString(),
  });
  return {
    ...plan,
    approvalStatus: "approved",
  };
}

export async function resolveIngestedTestDate(args: {
  cliTestDate: string | null;
  extractedTestDate: string | null;
  inferredTestDate: string;
  interactive: boolean;
  ask?: (prompt: string) => Promise<string> | string;
}): Promise<{
  testDate: string;
  testDateSource: HomeworkTestDateSource;
  testDateConfirmed: boolean;
}> {
  if (args.cliTestDate) {
    if (!validIsoDate(args.cliTestDate)) {
      throw new Error(`Invalid --testDate. Expected YYYY-MM-DD, got ${args.cliTestDate}`);
    }
    return {
      testDate: args.cliTestDate,
      testDateSource: "cli",
      testDateConfirmed: true,
    };
  }

  if (validIsoDate(args.extractedTestDate)) {
    return {
      testDate: args.extractedTestDate,
      testDateSource: "extracted",
      testDateConfirmed: false,
    };
  }

  if (!validIsoDate(args.inferredTestDate)) {
    throw new Error(`Invalid inferred test date. Expected YYYY-MM-DD, got ${args.inferredTestDate}`);
  }

  if (args.interactive) {
    const ask = args.ask ?? promptForTestDate;
    const answer = String(
      await ask(
        `I think this test is due ${args.inferredTestDate}. Press Enter to accept or type another date: `,
      ),
    ).trim();
    const testDate = answer || args.inferredTestDate;
    if (!validIsoDate(testDate)) {
      throw new Error(`Invalid test date. Expected YYYY-MM-DD, got ${testDate}`);
    }
    return {
      testDate,
      testDateSource: "human_confirmed",
      testDateConfirmed: true,
    };
  }

  return {
    testDate: args.inferredTestDate,
    testDateSource: "inferred_next_friday",
    testDateConfirmed: false,
  };
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
  if (type === "word-radar") {
    return {
      id: `hw-${idx}`,
      type: "word-radar",
      words,
      wordRadarItems: wordRadarItemsFromWordList(words),
      difficulty,
      rationale: `Automatic ${type} node`,
      gameFile: null,
      storyFile: null,
    };
  }
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
  const spellingDiff = spellingDifficultyFromDaysUntil(opts?.daysUntilTest ?? 4);
  if (spelling) {
    const homeworkId = "hw-spelling";
    const adaptivePlan = buildAdaptiveHomeworkPlan({
      childId: "unknown",
      homeworkId,
      type: "spelling_test",
      topic: "spelling",
      words: wordList,
    });
    const spellingNodes = buildSpellingActivityNodes({
      childId: "unknown",
      homeworkId,
      topic: "spelling",
      selectedWords: [...wordList],
      difficulty: spellingDiff,
      adaptivePlan,
    });
    const supportNodes = (["pronunciation", "word-builder", "quest", "boss"] as const).map(
      (type, index) => {
        const created = defaultPlannedNode(
          type,
          spellingNodes.length + index + 1,
          wordList,
          spellingDiff,
          true,
        );
        if (type === "quest") {
          return { ...created, rationale: SPELLING_QUEST_RATIONALE };
        }
        return created;
      },
    );
    return [...spellingNodes, ...supportNodes];
  }
  const order = REQUIRED_NODE_ORDER;
  const allowed = new Set<string>([...order]);
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
      ...(ty === "word-radar" && spelling ? { wordRadarItems: wordRadarItemsFromWordList([...wordList]) } : {}),
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
      const wordRadarItems =
        type === "word-radar" && spelling
          ? wordRadarItemsFromWordList([...wordList])
          : existing.wordRadarItems;
      return { ...existing, id: existing.id || `hw-${idx}`, words, rationale, wordRadarItems };
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

export function resolveHomeworkTypeFromProfile(
  raw: string,
  contentProfile: ContentProfile,
  title: string,
  questions: unknown[],
): HomeworkType {
  const normalized = normalizeHomeworkType(raw);
  if (normalized !== "generic") return normalized;

  const haystack = [
    title,
    contentProfile.topic,
    contentProfile.practiceDomain,
    contentProfile.contentDomain,
    contentProfile.primarySkill,
    contentProfile.assignmentFormat,
    ...contentProfile.concepts,
    ...contentProfile.sourceEvidence,
  ]
    .join(" ")
    .toLowerCase();

  if (
    contentProfile.practiceDomain === "reading" ||
    contentProfile.primarySkill.includes("comprehension") ||
    contentProfile.assignmentFormat.includes("study") ||
    questions.length > 0 ||
    /\b(erosion|earth|surface|soil|landform|water|wind|rocks?|study guide)\b/.test(
      haystack,
    )
  ) {
    return "reading";
  }

  return normalized;
}

export function buildHomeworkPreviewCommand(childId: string): {
  display: string;
  command: string;
  args: string[];
} {
  return buildPreviewBoardCommand({
    childId,
    subject: "homework",
    sessionMode: "as-child",
  });
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
    wordRadarItems: n.wordRadarItems,
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
  testDateSource?: HomeworkTestDateSource;
  testDateConfirmed?: boolean;
  returnTag?: string;
  wordList: string[];
  homeworkId: string;
  nodes: PlannedNode[];
  contentProfile?: ContentProfile | null;
  capturedContent?: CapturedHomeworkContent | null;
}): NonNullable<LearningProfile["pendingHomework"]> & { homeworkId: string } {
  return {
    weekOf: args.weekOf,
    testDate: args.testDate,
    testDateSource: args.testDateSource,
    testDateConfirmed: args.testDateConfirmed,
    returnTag: args.returnTag,
    wordList: args.wordList,
    contentProfile: args.contentProfile ?? null,
    capturedContent: args.capturedContent ?? null,
    homeworkId: args.homeworkId,
    generatedAt: new Date().toISOString(),
    nodes: args.nodes.map((node) => {
      const base = {
        id: node.id,
        type: node.type,
        words: node.words,
        difficulty: node.difficulty,
        gameFile: homeworkGameBasename(node.gameFile ?? null),
        storyFile: node.storyFile ?? null,
        activityConfigPath: node.activityConfigPath,
        storyText: node.storyText,
        storyTitle: node.storyTitle,
        storyImagePrompt: node.storyImagePrompt,
        carePlan: node.carePlan,
        adaptiveArtifact: node.adaptiveArtifact,
        date: node.date ?? args.weekOf,
        approved: false,
      };
      if (node.type === "word-radar" && node.wordRadarItems?.length) {
        return { ...base, wordRadarItems: node.wordRadarItems };
      }
      return base;
    }),
  };
}

export function resolveHomeworkWordPurpose(
  word: string,
  groups: HomeworkWordGroup[],
): HomeworkWordGroup["purpose"] | "unknown" {
  const normalized = word.trim().toLowerCase();
  const sourceGroup = groups.find((group) =>
    group.words.some((candidate) => candidate.trim().toLowerCase() === normalized),
  );
  return sourceGroup?.purpose ?? "unknown";
}

export function writeActivityConfigArtifacts(args: {
  childId: string;
  homeworkId: string;
  nodes: PlannedNode[];
}): string[] {
  const outDir = path.join(
    process.cwd(),
    "src",
    "context",
    args.childId,
    "homework",
    "games",
    args.homeworkId,
  );
  const written: string[] = [];
  const adaptivePlan = args.nodes.find((node) => node.adaptivePlan)?.adaptivePlan;
  if (adaptivePlan) {
    fs.mkdirSync(outDir, { recursive: true });
    const planPath = path.join(outDir, "adaptive-session-plan.json");
    fs.writeFileSync(planPath, JSON.stringify(adaptivePlan, null, 2), "utf8");
    written.push(planPath);
  }
  for (const node of args.nodes) {
    if (!node.activityConfig || !node.activityConfigPath) continue;
    const filename = path.basename(node.activityConfigPath);
    if (!/^[\w.\-]+\.json$/.test(filename)) continue;
    fs.mkdirSync(outDir, { recursive: true });
    const configPath = path.join(outDir, filename);
    fs.writeFileSync(configPath, JSON.stringify(node.activityConfig, null, 2), "utf8");
    written.push(configPath);
  }
  return written;
}

export function buildHomeworkLearningPlanArtifact(args: {
  homeworkId: string;
  childId: string;
  title: string;
  type: HomeworkType;
  words: string[];
  contentProfile: ContentProfile;
  reinforcementWords?: string[];
}): { plan: HomeworkCarePlan; markdown: string } {
  const plan = buildHomeworkCarePlan(args);
  return {
    plan,
    markdown: renderHomeworkCarePlanMarkdown(plan),
  };
}

export function parseCliArgs(argv: string[]): {
  childId: string | null;
  opus: boolean;
  testDate: string | null;
  pdfOverridePath: string | null;
  homeworkDomain?: IngestHomeworkDomain;
} {
  const childRaw = readCliValue(argv, ["--child"]);
  const childId = childRaw?.trim() ? childRaw.trim().toLowerCase() : null;
  const testDateRaw = readCliValue(argv, ["--testDate", "--test-date"]) ?? "";
  const testDate = testDateRaw.length > 0 ? testDateRaw : null;
  const pdfRaw = readCliValue(argv, ["--pdf"]) ?? "";
  const pdfOverridePath = pdfRaw ? path.resolve(process.cwd(), pdfRaw) : null;
  const homeworkDomain = normalizeIngestDomain(
    readCliValue(argv, ["--domain", "--homework-domain"]),
  );
  return {
    childId,
    opus: argv.includes("--opus"),
    testDate,
    pdfOverridePath,
    ...(homeworkDomain ? { homeworkDomain } : {}),
  };
}

function listIncomingFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((name) => path.join(dir, name));
}

export function listIngestChildIds(rootDir = process.cwd()): string[] {
  const configPath = path.join(rootDir, "children.config.json");
  if (!fs.existsSync(configPath)) return [];
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
    childProfiles?: Record<string, unknown>;
  };
  return Object.keys(cfg.childProfiles ?? {})
    .map((id) => id.trim().toLowerCase())
    .filter((id) => id && id !== "creator")
    .sort();
}

export async function resolveIngestChildId(args: {
  childId: string | null;
  childIds: string[];
  interactive: boolean;
  ask?: PromptFn;
}): Promise<string> {
  const explicit = args.childId?.trim().toLowerCase();
  if (explicit) return explicit;
  const childIds = args.childIds.map((id) => id.trim().toLowerCase()).filter(Boolean);
  if (!args.interactive) {
    throw new Error("Missing required argument --child=<childId>");
  }
  if (childIds.length === 0) {
    throw new Error("No child profiles found for homework intake.");
  }
  const choices = childIds.map((id, index) => `${index + 1}. ${id}`).join("\n");
  const ask = args.ask ?? promptForLine;
  const answer = String(await ask(`Which child is this homework for?\n${choices}\nChild: `))
    .trim()
    .toLowerCase();
  if (!answer) return childIds[0]!;
  const asNumber = Number(answer);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= childIds.length) {
    return childIds[asNumber - 1]!;
  }
  const match = childIds.find((id) => id === answer || id.startsWith(answer));
  if (match) return match;
  throw new Error(`Unknown child "${answer}". Expected one of: ${childIds.join(", ")}`);
}

export async function resolveIngestHomeworkFile(args: {
  pdfOverridePath: string | null;
  incomingFiles: string[];
  interactive: boolean;
  ask?: PromptFn;
}): Promise<string | null> {
  if (args.pdfOverridePath) return args.pdfOverridePath;
  const candidates = args.incomingFiles.filter((file) => /\.(pdf|txt)$/i.test(file));
  const picked = pickIncomingHomeworkFile(candidates);
  if (!picked || !args.interactive || candidates.length <= 1) return picked;

  const choices = candidates.map((file, index) => `${index + 1}. ${path.basename(file)}`).join("\n");
  const defaultIndex = candidates.indexOf(picked) + 1;
  const ask = args.ask ?? promptForLine;
  const answer = String(
    await ask(`Which homework file should I ingest? Press Enter for ${defaultIndex}.\n${choices}\nFile: `),
  ).trim();
  if (!answer) return picked;
  const asNumber = Number(answer);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= candidates.length) {
    return candidates[asNumber - 1]!;
  }
  const match = candidates.find((file) => path.basename(file).toLowerCase() === answer.toLowerCase());
  if (match) return match;
  throw new Error(`Unknown homework file "${answer}".`);
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
  interpretationMemoryMatches: import("./contentAwareHomeworkPlanner").HomeworkInterpretationMemoryMatch[] = [],
): Promise<ExtractionShape> {
  const prompt = `Extract as JSON only:
{
  "title": string,
  "type": "spelling_test"|"reading"|"math"|"coins"|"clocks"|"generic",
  "gradeLevel": number,
  "testDate": string | null,
  "words": string[],
  "wordGroups": [{
    "id": string,
    "label": string,
    "purpose": "spell_from_memory"|"recognize"|"read_fluently"|"pronounce"|"define"|"unknown",
    "words": string[],
    "confidence": number,
    "evidence": string[],
    "scheduleAfter": "spelling_measured" | null
  }],
  "contentProfile": {
    "practiceDomain": "spelling"|"reading"|"math"|"writing"|"generic",
    "contentDomain": "science"|"social_studies"|"language_arts"|"math"|"generic",
    "topic": string,
    "primarySkill": string,
    "assignmentFormat": string,
    "concepts": string[],
    "sourceEvidence": string[]
  },
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
  const sourceText = isPdf ? "" : fs.readFileSync(filePath, "utf8");
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
    : `${prompt}\n\nHomework text:\n${sourceText}`;
  const msg = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 8192,
    messages: [{ role: "user", content }],
  });
  const parsed = parseExtractedJson(textFromMessage(msg)) as Partial<ExtractionShape>;
  const extractedType = normalizeHomeworkType(String(parsed.type ?? "generic"));
  const words = Array.isArray(parsed.words) ? parsed.words.map((w) => String(w)) : [];
  const allowedGroupPurposes = new Set([
    "spell_from_memory",
    "recognize",
    "read_fluently",
    "pronounce",
    "define",
    "unknown",
  ]);
  const wordGroups: HomeworkWordGroup[] = Array.isArray(parsed.wordGroups)
    ? parsed.wordGroups.flatMap((group): HomeworkWordGroup[] => {
        if (!group || typeof group !== "object") return [];
        const raw = group as {
          id?: unknown;
          label?: unknown;
          purpose?: unknown;
          words?: unknown;
          confidence?: unknown;
          evidence?: unknown;
          scheduleAfter?: unknown;
        };
        const groupWords = Array.isArray(raw.words) ? raw.words.map((word) => String(word)) : [];
        if (groupWords.length === 0) return [];
        const rawPurpose = String(raw.purpose ?? "unknown");
        const purpose = allowedGroupPurposes.has(rawPurpose)
          ? rawPurpose as HomeworkWordGroup["purpose"]
          : "unknown";
        return [{
          id: String(raw.id ?? raw.label ?? "word-group"),
          label: String(raw.label ?? raw.id ?? "Word Group"),
          purpose,
          words: groupWords,
          confidence: Number.isFinite(Number(raw.confidence)) ? Number(raw.confidence) : 0.5,
          evidence: Array.isArray(raw.evidence) ? raw.evidence.map((item) => String(item)) : [],
          ...(raw.scheduleAfter === "spelling_measured" ? { scheduleAfter: "spelling_measured" as const } : {}),
        }];
      })
    : [];
  const questions = Array.isArray(parsed.questions)
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
    : [];
  const title = String(parsed.title ?? "Untitled Homework");
  const contentProfile = normalizeContentProfile({
    title,
    type: extractedType,
    words,
    wordGroups,
    questions,
    contentProfile: parsed.contentProfile,
  });
  const normalizedType = resolveHomeworkTypeFromProfile(
    extractedType,
    contentProfile,
    title,
    questions,
  );
  const finalContentProfile =
    normalizedType === extractedType
      ? contentProfile
      : normalizeContentProfile({
          title,
          type: normalizedType,
          words,
          questions,
          contentProfile,
        });
  const capturedContent = buildCapturedHomeworkContent({
    title,
    type: normalizedType,
    rawText: sourceText,
    words,
    wordGroups,
    interpretationMemoryMatches,
    questions,
    sourceDocuments: [
      {
        filename: path.basename(filePath),
        mediaType: isPdf ? "application/pdf" : "text/plain",
      },
    ],
    contentProfile: finalContentProfile,
  });
  const contentFingerprint = generateContentFingerprint({
    childId: "",
    title,
    rawText: sourceText,
    words,
    questions,
    testDate: parsed.testDate ? String(parsed.testDate) : null,
    sourceDocuments: capturedContent.sourceDocuments,
  });
  return {
    title,
    type: normalizedType,
    gradeLevel: Number(parsed.gradeLevel ?? 2),
    testDate: parsed.testDate ? String(parsed.testDate) : null,
    words,
    contentProfile: finalContentProfile,
    capturedContent,
    contentFingerprint,
    questions,
  };
}

/** Build a blank HomeworkCycle record for a freshly ingested homework. */
export function buildCycleStub(args: {
  homeworkId: string;
  subject: string;
  wordList: string[];
  contentProfile?: ContentProfile | null;
  capturedContent?: CapturedHomeworkContent | null;
  contentFingerprint?: string | null;
  ingestedAt: string;
  testDate: string | null;
  testDateSource?: HomeworkTestDateSource;
  testDateConfirmed?: boolean;
  returnTag?: string;
}): HomeworkCycle {
  return {
    homeworkId: args.homeworkId,
    subject: args.subject,
    wordList: args.wordList,
    contentProfile: args.contentProfile ?? null,
    capturedContent: args.capturedContent ?? null,
    contentFingerprint: args.contentFingerprint ?? undefined,
    calibrationStatus: "unverified",
    ingestedAt: args.ingestedAt,
    testDate: args.testDate,
    testDateSource: args.testDateSource,
    testDateConfirmed: args.testDateConfirmed,
    returnTag: args.returnTag,
    assumptions: null,
    postAnalysis: null,
    scanResult: null,
    delta: null,
    metrics: null,
  };
}

export async function runIngestHomework(argv: string[]): Promise<void> {
  const {
    childId: cliChildId,
    testDate: cliTestDate,
    pdfOverridePath,
    homeworkDomain,
  } = parseCliArgs(argv);
  const interactive = Boolean(
    input.isTTY && output.isTTY && process.env.SUNNY_NON_INTERACTIVE !== "true",
  );
  const childId = await resolveIngestChildId({
    childId: cliChildId,
    childIds: listIngestChildIds(),
    interactive,
  });
  const client = new Anthropic();
  const today = new Date().toISOString().slice(0, 10);
  const contextBase = path.join(process.cwd(), "src", "context", childId, "homework");
  const incomingDir = path.join(contextBase, "incoming");
  const pendingDir = path.join(contextBase, "pending", today);
  fs.mkdirSync(pendingDir, { recursive: true });

  console.log(
    `🏥 Sunny intake — ${homeworkDomain ? `${homeworkDomain} ` : ""}homework for ${childId}`,
  );
  const incomingFile = await resolveIngestHomeworkFile({
    pdfOverridePath,
    incomingFiles: listIncomingFiles(incomingDir),
    interactive,
  });
  if (!incomingFile) {
    throw new Error(`No homework found in ${incomingDir}. Expected .pdf or .txt file.`);
  }
  if (!fs.existsSync(incomingFile)) {
    throw new Error(`Homework file not found: ${incomingFile}`);
  }
  if (!incomingFile.toLowerCase().endsWith(".pdf") && !incomingFile.toLowerCase().endsWith(".txt")) {
    throw new Error(`Homework file must be a .pdf or .txt file: ${incomingFile}`);
  }

  const existingProfileDoc = readLearningProfile(childId);
  console.log("📄 Step 1/4: Reading homework...");
  console.log(`   Intake file: ${path.basename(incomingFile)}`);
  const extracted = await extractHomework(
    client,
    incomingFile,
    existingProfileDoc?.homeworkInterpretationMemory ?? [],
  );
  const resolvedTestDate = await resolveIngestedTestDate({
    cliTestDate,
    extractedTestDate: extracted.testDate,
    inferredTestDate: nextFriday(),
    interactive,
  });
  const { testDate, testDateSource, testDateConfirmed } = resolvedTestDate;
  const daysUntilTest = daysUntil(testDate);
  const wordsLine =
    extracted.words.length <= 5
      ? extracted.words.join(", ")
      : `${extracted.words.slice(0, 5).join(", ")}... (${extracted.words.length} words)`;
  console.log(`✅ Found: ${extracted.title}`);
  console.log(`   Words: ${wordsLine}`);
  console.log(
    `   Test date: ${testDate} (${daysUntilTest} days away, source=${testDateSource}, confirmed=${testDateConfirmed})`,
  );
  fs.writeFileSync(
    path.join(pendingDir, "classification.json"),
    JSON.stringify({ ...extracted, testDate }, null, 2),
    "utf8",
  );
  fs.writeFileSync(
    path.join(pendingDir, "assignment-interpretation.json"),
    JSON.stringify(
      extracted.capturedContent.assignmentInterpretation ??
        interpretHomeworkAssignment({
          title: extracted.title,
          type: extracted.type,
          words: extracted.words,
          questions: extracted.questions,
          contentProfile: extracted.contentProfile,
        }),
      null,
      2,
    ),
    "utf8",
  );

  console.log("");
  console.log("📦 Step 2/4: Seeding word bank and creating cycle record...");

  const wordBank = readWordBank(childId);
  // Only the current ingest batch should win getHomeworkPriorityWords(); clear stale flags first.
  for (const entry of wordBank.words) {
    entry.homeworkPriority = false;
  }
  const groups = extracted.capturedContent.assignmentInterpretation?.wordGroups ?? [];
  const groupForWord = (word: string) => groups.find((group) =>
    group.words.some((candidate) => candidate.toLowerCase() === word.toLowerCase()),
  );
  for (const raw of extracted.words) {
    const word = String(raw ?? "").trim();
    if (!word) continue;
    const lower = word.toLowerCase();
    const sourceGroup = groupForWord(word);
    const purpose = resolveHomeworkWordPurpose(word, groups);
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
    entry.homeworkPriority = purpose === "spell_from_memory";
    entry.testDate = testDate;
    entry.homeworkTargetPurpose = purpose;
    entry.homeworkSourceGroup = sourceGroup?.label;
    if (purpose === "spell_from_memory" && !entry.tracks.spelling) {
      entry.tracks.spelling = createFreshSM2Track(today);
    }
    if (purpose !== "spell_from_memory" && purpose !== "unknown" && !entry.tracks.reading) {
      entry.tracks.reading = createFreshSM2Track(today);
    }
    const st = purpose === "spell_from_memory"
      ? entry.tracks.spelling
      : purpose === "unknown"
        ? undefined
        : entry.tracks.reading;
    if (st && st.nextReviewDate > today) {
      st.nextReviewDate = today;
    }
  }
  writeWordBank(childId, wordBank);
  console.log(
    `📝 Seeded ${extracted.words.length} words with homework priority → word_bank.json`,
  );

  const homeworkId = generateHomeworkId(extracted.type, extracted.words);
  const returnTag = buildHomeworkReturnTag(childId, homeworkId);
  const cyclesDir = path.join(process.cwd(), "src", "context", childId, "homework", "cycles");
  fs.mkdirSync(cyclesDir, { recursive: true });
  const contentFingerprint = generateContentFingerprint({
    childId,
    title: extracted.title,
    rawText: extracted.capturedContent.rawText,
    words: extracted.words,
    questions: extracted.questions,
    testDate,
    sourceDocuments: extracted.capturedContent.sourceDocuments,
  });
  const cycleStub = buildCycleStub({
    homeworkId,
    subject: extracted.type,
    wordList: extracted.words,
    contentProfile: extracted.contentProfile,
    capturedContent: extracted.capturedContent,
    contentFingerprint,
    ingestedAt: today,
    testDate,
    testDateSource,
    testDateConfirmed,
    returnTag,
  });
  const patternResult = scanChildErrorPatterns(childId);
  const theory = buildPreQuestTheory({
    cycle: cycleStub,
    patterns: patternResult.patterns,
  });
  cycleStub.assumptions = theory.markdown;
  cycleStub.theory = theory;
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
    `## Homework ingested\n\n**homeworkId:** ${homeworkId}\n**returnTag:** ${returnTag}\n**words:** ${extracted.words.join(", ")}\n**testDate:** ${testDate}\n**testDateSource:** ${testDateSource}\n**testDateConfirmed:** ${testDateConfirmed}\n\n${theory.markdown}\n`,
    "utf8",
  );
  console.log(`📋 Pre-quest theory → assumptions/${today}-pre.md`);

  console.log("");
  console.log("💾 Step 3/4: Saving...");

  const profileDoc = readLearningProfile(childId);
  if (!profileDoc) {
    throw new Error(`Could not read learning_profile.json for child: ${childId}`);
  }
  const homeworkNodes = buildHomeworkNodes({
    type: extracted.type,
    words: extracted.words,
    homeworkId,
    childId,
    testDate,
    contentProfile: extracted.contentProfile,
    capturedContent: extracted.capturedContent,
  });
  const activityArtifacts = writeActivityConfigArtifacts({
    childId,
    homeworkId,
    nodes: homeworkNodes,
  });
  const learningPlanArtifact = buildHomeworkLearningPlanArtifact({
    homeworkId,
    childId,
    title: extracted.title,
    type: extracted.type,
    words: extracted.words,
    contentProfile: extracted.contentProfile,
  });

  profileDoc.pendingHomework = buildPendingHomeworkPayload({
    weekOf: today,
    testDate,
    testDateSource,
    testDateConfirmed,
    returnTag,
    wordList: extracted.words,
    contentProfile: extracted.contentProfile,
    capturedContent: extracted.capturedContent,
    homeworkId,
    nodes: homeworkNodes,
  });
  const catalogItems = buildHomeworkContentCatalogItems({
    childId,
    homeworkId,
    capturedContent: extracted.capturedContent,
    contentFingerprint,
    nodes: homeworkNodes,
    baselineActivities: recommendBaselineActivities(extracted.capturedContent),
  });
  const profileWithCatalog = upsertProfileContentCatalog(profileDoc, catalogItems);
  writeLearningProfile(childId, profileWithCatalog);
  const parentPlanNote = await promptForSessionPlanNote(interactive);
  const chartForPlan = getChildChart(childId);
  const plannerInput = buildExperiencePlannerInput(chartForPlan, {
    parentNote: parentPlanNote,
    companionConversationAudit: parentPlanNote ? [`parent_note:${parentPlanNote}`] : [],
  });
  const activeSessionPlan = await planPsychologistExperience(plannerInput, {
    useAi: process.env.SUNNY_AI_EXPERIENCE_PLANNER === "true",
    parentNote: parentPlanNote,
  });
  writeActiveSessionPlan(childId, await reviewExperiencePlan(childId, activeSessionPlan, interactive));
  fs.writeFileSync(
    path.join(pendingDir, "learning-plan.json"),
    JSON.stringify(learningPlanArtifact.plan, null, 2),
    "utf8",
  );
  fs.writeFileSync(
    path.join(pendingDir, "learning-plan.md"),
    learningPlanArtifact.markdown,
    "utf8",
  );

  console.log(`✅ Saved to src/context/${childId}/homework/pending/${today}/`);
  console.log(`🏷️  Return tag: ${returnTag}`);
  console.log("🧭 Learning plan → learning-plan.md");
  if (activityArtifacts.length > 0) {
    console.log(`🎮 [ingestHomework] activity-configs wrote ${activityArtifacts.length}`);
  }

  console.log("");
  console.log("🧠 Step 4/4: Psychologist + today's plan (shared with sunny:sync)…");
  await runPsychologistSync(childId, { planningMode: "homework" });

  await maybeLaunchPreviewBoard({
    childId,
    subject: "homework",
    label: homeworkDomain ? `${homeworkDomain} homework` : "homework",
    sessionMode: "as-child",
    prompt: process.env.SUNNY_NON_INTERACTIVE !== "true",
    defaultOpen: true,
  });
  console.log(
    `Run session:  ${
      homeworkDomain === "spelling" ? "npm run sunny:homework:spelling" : "npm run sunny:homework"
    }`,
  );
}

if (typeof require !== "undefined" && require.main === module) {
  runIngestHomework(process.argv.slice(2)).catch((err) => {
    console.error("🎮 [ingestHomework] failed", err);
    process.exit(1);
  });
}
