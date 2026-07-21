import "dotenv/config";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { readLearningProfile, writeLearningProfile } from "../utils/learningProfileIO";
import type { ActiveSessionPlan, EngagementDimension, HomeworkDomain, LearningProfile } from "../context/schemas/learningProfile";
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
  recordPlannerReview,
} from "../engine/experiencePlanner";
import { normalizeHomeworkDomain, withActiveHomeworkLane } from "../engine/homeworkLanes";
import {
  buildCapturedHomeworkContent,
  buildContentAwareHomeworkNodes,
  buildSpellingActivityNodes,
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
import {
  extractAssignmentSource,
  type AssignmentSourceExtraction,
} from "../engine/assignmentSourceExtraction";
import {
  buildAssignmentMasteryContext,
  buildAssignmentPlanningPacket,
  buildPlannerReadinessAudit,
  planAssignmentFromSource,
  resolveAssignmentPlannerModel,
  summarizeAssignmentPlanForReview,
  validateAssignmentPlannerOutput,
  type AssignmentMasteryContext,
  type AssignmentPlannerOutput,
  type AssignmentPlanningPacket,
  type AssignmentPlanValidationIssue,
  type PlannerReadinessAudit,
} from "../engine/assignmentPlanner";
import {
  buildPlannerDecisionAudit,
  type PlannerDecisionAudit,
} from "../engine/plannerDecisionAudit";
import {
  buildInitialEngagementTheory,
  readEngagementTheory,
  writeEngagementTheory,
} from "../engine/engagementTheory";
import { validateFullExperienceReadiness } from "../engine/fullExperienceReadiness";
import { enrichMathNodeArtwork, localizeMathNodeArtwork } from "../engine/mathNodeArtwork";
import { persistIngestedLearningCycle } from "../engine/learningCycleIngest";
import { repairLatestHistoricalLearningCycleBeforePlanning } from "../engine/learningCycleRepository";
import { createIngestProgress, type IngestProgress } from "../utils/ingestOutput";
import { generateStoryImage } from "../utils/generateStoryImage";
import { buildAdventureBoardFromActiveSessionPlan } from "../shared/adventureBoardFromPlan";

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
  assignmentSource: AssignmentSourceExtraction;
  assignmentPlanningPacket: AssignmentPlanningPacket;
  assignmentPlannerOutput: AssignmentPlannerOutput;
  assignmentValidationIssues: AssignmentPlanValidationIssue[];
  plannerDecisionAudit: PlannerDecisionAudit;
  plannerReadinessAudit: PlannerReadinessAudit;
  assignmentReviewSummary: string;
  questions: Array<{
    id: number;
    question: string;
    type: "multiple_choice" | "written" | "fill_in";
    options: string[] | null;
    correctAnswer: string | null;
    hint: string;
  }>;
};

const DEFAULT_INGEST_PLANNER_TIMEOUT_MS = 150000;

export function resolveIngestPlannerTimeoutMs(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): number {
  const raw = env.SUNNY_INGEST_PLANNER_TIMEOUT_MS;
  if (!raw) return DEFAULT_INGEST_PLANNER_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_INGEST_PLANNER_TIMEOUT_MS;
  return parsed;
}

export async function withIngestPlannerTimeout<T>(
  promise: Promise<T>,
  ms = resolveIngestPlannerTimeoutMs(),
  label = "assignment-planner",
  details: {
    stage?: string;
    artifactPaths?: string[];
  } = {},
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      const suffix = [
        details.stage ? `stage=${details.stage}` : "",
        details.artifactPaths?.length ? `artifacts=${details.artifactPaths.join(",")}` : "",
      ].filter(Boolean).join(":");
      reject(new Error(
        `ingest_homework_planner_timeout:${label}:${ms}ms${suffix ? `:${suffix}` : ""}`,
      ));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

export type PlannedHomeworkIngestArgs = {
  childId: string;
  sourceFile: string;
  assignmentSource: AssignmentSourceExtraction;
  assignmentPlanningPacket: AssignmentPlanningPacket;
  assignmentPlannerOutput: AssignmentPlannerOutput;
  homeworkDomain?: HomeworkDomain;
  testDate?: string | null;
  approvedAt?: string;
  reviewer?: string;
  syncAfterWrite?: boolean;
};

type PlannedNode = PlannedHomeworkNode;

export type IngestHomeworkDomain = HomeworkDomain;

type PromptFn = (prompt: string) => Promise<string> | string;

export function buildPlannerArtifactPayloads(args: {
  packet: unknown;
  output: unknown;
  audit: PlannerDecisionAudit | { rows: unknown[]; issues: unknown[]; markdown: string };
  readinessAudit?: { rows: unknown[]; issues: unknown[]; markdown: string };
  comparison?: {
    plannerModel: string;
    promptHash: string;
    routeCount: number;
    verdict: "Pass" | "Partial pass" | "Fail";
    screenshotPaths: string[];
  };
}): Record<string, string> {
  const files: Record<string, string> = {
    "planner-input.json": `${JSON.stringify(args.packet, null, 2)}\n`,
    "planner-output.json": `${JSON.stringify(args.output, null, 2)}\n`,
    "planner-decision-audit.json": `${JSON.stringify({
      rows: args.audit.rows,
      issues: args.audit.issues,
    }, null, 2)}\n`,
    "planner-decision-audit.md": args.audit.markdown.endsWith("\n")
      ? args.audit.markdown
      : `${args.audit.markdown}\n`,
  };
  if (args.readinessAudit) {
    files["planner-readiness-audit.json"] = `${JSON.stringify({
      rows: args.readinessAudit.rows,
      issues: args.readinessAudit.issues,
    }, null, 2)}\n`;
    files["planner-readiness-audit.md"] = args.readinessAudit.markdown.endsWith("\n")
      ? args.readinessAudit.markdown
      : `${args.readinessAudit.markdown}\n`;
  }
  if (args.comparison) {
    files["planner-comparison.json"] = `${JSON.stringify(args.comparison, null, 2)}\n`;
  }
  return files;
}

function plannerInputHash(packet: unknown): string {
  return createHash("sha256").update(JSON.stringify(packet)).digest("hex").slice(0, 16);
}

function routeCountForPlannerOutput(output: AssignmentPlannerOutput): number {
  return output.activeSessionPlan.learningRoutes?.filter((route) => route.nodeIds.length > 0).length ?? 0;
}

export function plannerComparisonArtifact(args: {
  packet: AssignmentPlanningPacket;
  output: AssignmentPlannerOutput;
  plannerModel: string;
}) {
  const routeCount = routeCountForPlannerOutput(args.output);
  return {
    plannerModel: args.plannerModel,
    promptHash: plannerInputHash(args.packet),
    routeCount,
    verdict: routeCount >= 2 ? "Pass" as const : "Fail" as const,
    screenshotPaths: [],
  };
}

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

export function assertLegacyMathIngestAllowed(domain: HomeworkDomain | undefined): void {
  if (domain === "math") throw new Error("legacy_math_ingest_quarantined:use_npm_run_sunny_ingest_math");
}

export function inferIngestDomainFromExtraction(extracted: Pick<ExtractionShape, "type" | "contentProfile">): IngestHomeworkDomain {
  return (
    normalizeHomeworkDomain(extracted.contentProfile.practiceDomain) ??
    normalizeHomeworkDomain(extracted.type) ??
    normalizeHomeworkDomain(extracted.contentProfile.contentDomain) ??
    "reading"
  );
}

export function appendHomeworkIntakeHistory(args: {
  profile: LearningProfile;
  source: "human_menu" | "cli" | "classifier";
  selectedDomain: HomeworkDomain;
  classifierDomain: HomeworkDomain;
  homeworkId: string;
  title: string;
}): LearningProfile {
  const entry = {
    decidedAt: new Date().toISOString(),
    source: args.source,
    selectedDomain: args.selectedDomain,
    classifierDomain: args.classifierDomain,
    homeworkId: args.homeworkId,
    title: args.title,
    note: args.selectedDomain === args.classifierDomain
      ? "Domain accepted."
      : `Human-selected domain ${args.selectedDomain} over classifier ${args.classifierDomain}.`,
  };
  return {
    ...args.profile,
    homeworkIntakeHistory: [
      entry,
      ...(args.profile.homeworkIntakeHistory ?? []),
    ].slice(0, 50),
  };
}

export async function resolveIngestHomeworkDomain(args: {
  homeworkDomain?: IngestHomeworkDomain;
  interactive: boolean;
  ask?: PromptFn;
}): Promise<IngestHomeworkDomain | undefined> {
  if (args.homeworkDomain) return args.homeworkDomain;
  if (!args.interactive) return undefined;
  const ask = args.ask ?? promptForLine;
  const answer = String(
    await ask(
      [
        "What kind of homework is this?",
        "1. reading",
        "2. spelling",
        "3. math",
        "4. science",
        "5. not sure / let Sunny classify",
        "Domain: ",
      ].join("\n"),
    ),
  ).trim().toLowerCase();
  if (!answer || answer === "5" || answer === "not sure" || answer === "unsure") {
    return undefined;
  }
  const byNumber: Record<string, IngestHomeworkDomain> = {
    "1": "reading",
    "2": "spelling",
    "3": "math",
    "4": "science",
  };
  if (byNumber[answer]) return byNumber[answer];
  return normalizeIngestDomain(answer);
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

function nodeReviewLabel(node: ActiveSessionPlan["nodePlan"][number]): string {
  if (node.type === "mystery") {
    return `mystery(${node.choiceMode ?? "choice-lab"}, ${node.targets.length} targets)`;
  }
  if (node.type === "quest") {
    return `quest(${node.locked ? "locked, " : ""}${node.targets.length} targets)`;
  }
  if (node.type === "boss") {
    if (node.locked && node.targets.length === 0) {
      return "boss(locked, targets selected after quest evidence)";
    }
    return `boss(${node.locked ? "locked, " : ""}mastery finale, ${node.targets.length} targets)`;
  }
  return `${node.type}(${node.targets.length} targets)`;
}

function describeAssignmentSourceWarning(warning: string): string {
  switch (warning) {
    case "pdf_embedded_text_empty_used_ocr":
      return "PDF had no embedded text, so Sunny used OCR. Verify captured words.";
    case "pdf_ocr_quicklook_preview_one_image":
      return "OCR came from one preview image. Verify all pages/words were captured.";
    default:
      return warning;
  }
}

function printExperiencePlanReview(
  plan: ActiveSessionPlan,
  print: (line: string) => void = console.log,
): void {
  print("");
  print("🧠 AI psychologist experience plan");
  print(`  🎮 [experience-planner] [plan] id=${plan.planId} status=${plan.approvalStatus ?? "pending"} confidence=${plan.plannerConfidence ?? "unknown"}`);
  print(`  Theory: ${plan.planTheory?.hypothesis ?? "No theory recorded."}`);
  print(`  Nodes: ${plan.nodePlan.map(nodeReviewLabel).join(" → ")}`);
  if (plan.generatedExperienceBriefs?.length) {
    for (const brief of plan.generatedExperienceBriefs) {
      print(
        `  Brief: ${brief.kind} "${brief.title}" status=${brief.artifactStatus} validation=${brief.validationRequired ? "required" : "not-required"}`,
      );
    }
  }
  print("");
}

export async function reviewExperiencePlan(
  childId: string,
  plan: ActiveSessionPlan,
  options: boolean | {
    interactive: boolean;
    ask?: PromptFn;
    reviewer?: string;
    print?: (line: string) => void;
    recordReview?: typeof recordPlannerReview;
    revisePlan?: (plan: ActiveSessionPlan, note: string) => Promise<ActiveSessionPlan> | ActiveSessionPlan;
  },
): Promise<ActiveSessionPlan> {
  const opts = typeof options === "boolean" ? { interactive: options } : options;
  const ask = opts.ask ?? promptForLine;
  const print = opts.print ?? console.log;
  const recordReview = opts.recordReview ?? recordPlannerReview;
  const reviewer = opts.reviewer ?? process.env.SUNNY_REVIEWER?.trim() ?? "parent";
  printExperiencePlanReview(plan, print);
  if (!opts.interactive || plan.approvalStatus === "auto_approved") {
    return plan;
  }
  const answer = String(
    await ask("Approve this AI session plan for the next child session? [Y/n/edit] "),
  ).trim().toLowerCase();
  if (answer === "edit" || answer === "e" || answer === "revise" || answer === "r") {
    const note = String(await ask("What should Sunny change? ")).trim();
    if (note && opts.revisePlan) {
      const revised = await opts.revisePlan(plan, note);
      printExperiencePlanReview(revised, print);
      const revisedAnswer = String(
        await ask("Approve revised AI session plan for the next child session? [Y/n] "),
      ).trim().toLowerCase();
      if (revisedAnswer !== "n" && revisedAnswer !== "no") {
        recordReview(childId, {
          planId: revised.planId,
          status: "approved",
          reviewer,
          decidedAt: new Date().toISOString(),
          notes: `Approved after revision: ${note}`,
        });
        return {
          ...revised,
          parentNote: note,
          approvalStatus: "approved",
        };
      }
      recordReview(childId, {
        planId: revised.planId,
        status: "rejected",
        reviewer,
        decidedAt: new Date().toISOString(),
        notes: `Rejected revised plan: ${note}`,
      });
      return {
        ...revised,
        parentNote: note,
        approvalStatus: "rejected",
        openQuestions: [
          ...revised.openQuestions,
          "Parent rejected this revised session plan during homework ingestion.",
        ],
      };
    }
  }
  if (answer === "n" || answer === "no" || answer === "edit" || answer === "e" || answer === "revise" || answer === "r") {
    recordReview(childId, {
      planId: plan.planId,
      status: "rejected",
      reviewer,
      decidedAt: new Date().toISOString(),
      notes: answer.startsWith("e") || answer.startsWith("r")
        ? "Revision requested during homework ingestion but no revised plan was available."
        : "Rejected during homework ingestion.",
    });
    return {
      ...plan,
      approvalStatus: "rejected",
      openQuestions: [
        ...plan.openQuestions,
        "Parent rejected this session plan during homework ingestion.",
      ],
    };
  }
  recordReview(childId, {
    planId: plan.planId,
    status: "approved",
    reviewer,
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
  let out = html.replace(
    /src=(["'])(?:\.\/)?(?:games\/)?_contract\.js\1/gi,
    'src="/games/_contract.js"',
  );
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
  if (typeof window.fireCompanionEvent === "function") window.fireCompanionEvent(evt, payload || {});
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

/** Preserve the planner's node sequence. Missing quest/boss is a planner validation error elsewhere. */
export function finalizePlannedHomeworkNodes(
  nodes: PlannedNode[],
  _extractedWords: string[],
  dateStr: string,
): PlannedNode[] {
  return nodes.map((node) => ({ ...node, date: node.date ?? dateStr }));
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
        choiceMode: node.choiceMode,
        choiceSource: node.choiceSource,
        masteryUnlockState: node.masteryUnlockState,
        locked: node.locked,
        date: node.date ?? args.weekOf,
        approved: false,
      };
      if (node.type === "word-radar") {
        return {
          ...base,
          ...(node.wordRadarItems?.length ? { wordRadarItems: node.wordRadarItems } : {}),
          ...(node.wordRadarConfig ? { wordRadarConfig: node.wordRadarConfig } : {}),
        };
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
  plannerModel?: string;
  homeworkDomain?: IngestHomeworkDomain;
} {
  const childRaw = readCliValue(argv, ["--child"]);
  const childId = childRaw?.trim() ? childRaw.trim().toLowerCase() : null;
  const testDateRaw = readCliValue(argv, ["--testDate", "--test-date"]) ?? "";
  const testDate = testDateRaw.length > 0 ? testDateRaw : null;
  const pdfRaw = readCliValue(argv, ["--pdf", "--file"]) ?? "";
  const pdfOverridePath = pdfRaw ? path.resolve(process.cwd(), pdfRaw) : null;
  const plannerModelRaw = readCliValue(argv, ["--planner-model", "--model"]) ?? "";
  const plannerModel = plannerModelRaw.trim() || undefined;
  const homeworkDomain = normalizeIngestDomain(
    readCliValue(argv, ["--domain", "--homework-domain"]),
  );
  return {
    childId,
    opus: argv.includes("--opus"),
    testDate,
    pdfOverridePath,
    ...(plannerModel ? { plannerModel } : {}),
    ...(homeworkDomain ? { homeworkDomain } : {}),
  };
}

type IngestSummary = {
  childId: string;
  domain: string;
  title: string;
  homeworkId: string;
  status: "FULL" | "READY_WITH_FALLBACK" | "BLOCKED";
  plannedActivities: number;
  launchableActivities: number;
  uniqueShells: number;
  fallbackActivities: number;
  lockedNodes: number;
  readinessFailures: string[];
  reportPath: string;
  pendingDir: string;
};

function readJsonIfPresent<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function buildIngestSummary(childId: string, today: string): IngestSummary | null {
  const contextDir = path.join(process.cwd(), "src", "context", childId);
  const pendingDir = path.join(contextDir, "homework", "pending", today);
  const homework = readJsonIfPresent<{
    selectedDomain?: string;
    current?: { homeworkId?: string; capturedContent?: { title?: string }; contentProfile?: { topic?: string } };
  }>(path.join(contextDir, "homework", "current.json"));
  const plan = readJsonIfPresent<{
    current?: {
      nodePlan?: Array<{
        id: string;
        type?: string;
        locked?: boolean;
        gameHtmlPath?: string | null;
        activityConfigPath?: string | null;
        title?: string;
        contentId?: string;
        mechanic?: string;
        targets?: string[];
        difficulty?: number;
        engagementDimensions?: string[];
        engagementVariable?: string;
        validationProof?: {
          engine: "playwright";
          passed: boolean;
          worldStateChanged: boolean;
          screenshotPaths: string[];
        };
      }>;
      adventureBoard?: {
        nodes?: Array<{ id: string; kind?: string; thumbnailUrl?: string }>;
      };
    };
  }>(path.join(contextDir, "plans", "active_session_plan.json"));
  const nodes = plan?.current?.nodePlan ?? [];
  const baselineNodes = nodes
    .filter((node) => node.type === "generated-baseline")
    .map((node) => ({
      ...node,
      engagementVariable: node.engagementVariable ?? node.engagementDimensions?.[0],
    }));
  const launchable = baselineNodes.filter((node) => Boolean(node.gameHtmlPath));
  const uniqueShells = new Set(
    launchable.map((node) => node.gameHtmlPath).filter((value): value is string => Boolean(value)),
  ).size;
  const lockedNodes = nodes.filter((node) => node.locked).length;
  const fallbackActivities = Math.max(0, launchable.length - uniqueShells);
  const readiness = validateFullExperienceReadiness({
    baselineNodes,
    boardNodes: plan?.current?.adventureBoard?.nodes ?? [],
    publicRoot: path.join(process.cwd(), "web", "public"),
  });
  const readinessFailures = readiness.failures;
  const status: IngestSummary["status"] = readinessFailures.length === 0 && baselineNodes.length > 0
    ? "FULL"
    : "BLOCKED";
  const homeworkId = homework?.current?.homeworkId ?? "unknown";
  return {
    childId,
    domain: homework?.selectedDomain ?? "unknown",
    title: homework?.current?.capturedContent?.title ?? homework?.current?.contentProfile?.topic ?? "homework",
    homeworkId,
    status,
    plannedActivities: baselineNodes.length,
    launchableActivities: launchable.length,
    uniqueShells,
    fallbackActivities,
    lockedNodes,
    readinessFailures: [...new Set(readinessFailures)],
    pendingDir,
    reportPath: path.join(pendingDir, "ingest-report.md"),
  };
}

function writeIngestReport(summary: IngestSummary, diagnostics: string[]): void {
  fs.mkdirSync(summary.pendingDir, { recursive: true });
  const report = [
    "# Sunny ingestion report",
    "",
    `- Status: **${summary.status}**`,
    `- Child: ${summary.childId}`,
    `- Domain: ${summary.domain}`,
    `- Assignment: ${summary.title}`,
    `- Homework ID: ${summary.homeworkId}`,
    `- Baseline activities: ${summary.launchableActivities}/${summary.plannedActivities} launchable`,
    `- Distinct shells: ${summary.uniqueShells}`,
    `- Shared fallback assignments: ${summary.fallbackActivities}`,
    `- Locked nodes: ${summary.lockedNodes}`,
    `- Readiness failures: ${summary.readinessFailures.length ? summary.readinessFailures.join(", ") : "none"}`,
    "",
    "## Diagnostic output",
    "",
    "The detailed internal output is preserved below for debugging. The normal CLI intentionally hides it.",
    "",
    "```text",
    ...diagnostics.map((line) => line.replace(/\u001b\[[0-9;]*m/g, "")),
    "```",
    "",
  ].join("\n");
  fs.writeFileSync(summary.reportPath, report, "utf8");
}

function listIncomingFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((name) => path.join(dir, name));
}

function isSupportedAssignmentSource(filePath: string): boolean {
  return /\.(pdf|txt|png|jpe?g|webp)$/i.test(filePath);
}

function storeOriginalAssignmentSource(incomingFile: string, pendingDir: string): string {
  const sourceDir = path.join(pendingDir, "source");
  fs.mkdirSync(sourceDir, { recursive: true });
  const filename = path.basename(incomingFile);
  const storedPath = path.join(sourceDir, filename);
  if (path.resolve(incomingFile) !== path.resolve(storedPath)) {
    fs.copyFileSync(incomingFile, storedPath);
  }
  return storedPath;
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
  const candidates = args.incomingFiles.filter((file) => /\.(pdf|txt|png|jpe?g|webp)$/i.test(file));
  const picked = pickIncomingHomeworkFile(candidates);
  if (!args.interactive) return picked;

  const ask = args.ask ?? promptForLine;
  if (candidates.length === 0) {
    const answer = String(
      await ask("Paste homework PDF/image/TXT path, or press Enter to cancel: "),
    ).trim();
    return normalizeEnteredHomeworkPath(answer);
  }

  const choices = [
    ...candidates.map((file, index) => `${index + 1}. ${path.basename(file)}`),
    `${candidates.length + 1}. Paste another path`,
  ].join("\n");
  const defaultFile = picked ?? candidates[0]!;
  const defaultIndex = candidates.indexOf(defaultFile) + 1;
  const answer = String(
    await ask(`Which homework file should I ingest? Press Enter for ${defaultIndex}.\n${choices}\nFile: `),
  ).trim();
  if (!answer) return defaultFile;
  const asNumber = Number(answer);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= candidates.length) {
    return candidates[asNumber - 1]!;
  }
  if (Number.isInteger(asNumber) && asNumber === candidates.length + 1) {
    const manual = String(await ask("Paste homework PDF/image/TXT path: ")).trim();
    return normalizeEnteredHomeworkPath(manual);
  }
  const match = candidates.find((file) => path.basename(file).toLowerCase() === answer.toLowerCase());
  if (match) return match;
  const manualPath = normalizeEnteredHomeworkPath(answer);
  if (manualPath) return manualPath;
  throw new Error(`Unknown homework file "${answer}".`);
}

function normalizeEnteredHomeworkPath(raw: string): string | null {
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) return null;
  return path.resolve(process.cwd(), trimmed);
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

export function buildHomeworkExtractionFromAssignmentPlan(args: {
  childId: string;
  assignmentSource: AssignmentSourceExtraction;
  assignmentPlanningPacket: AssignmentPlanningPacket;
  assignmentPlannerOutput: AssignmentPlannerOutput;
}): ExtractionShape {
  const assignmentValidationIssues = validateAssignmentPlannerOutput(
    args.assignmentPlannerOutput,
    {
      extraction: args.assignmentSource,
      activityCatalog: args.assignmentPlanningPacket.activityCatalog,
    },
  );
  const blockingIssues = assignmentValidationIssues.filter((issue) => issue.severity === "error");
  if (blockingIssues.length > 0) {
    throw new Error(
      [
        "assignment_plan_invalid",
        ...blockingIssues.map((issue) => `${issue.code}: ${issue.message}`),
      ].join("\n"),
    );
  }
  const plannerReadinessAudit = buildPlannerReadinessAudit(args.assignmentPlanningPacket.activityCatalog);
  const plannerDecisionAudit = buildPlannerDecisionAudit(args.assignmentPlannerOutput);

  const capturedContent = args.assignmentPlannerOutput.capturedContent;
  const extractedType = normalizeHomeworkType(capturedContent.type);
  const words = capturedContent.words.map((word) => String(word));
  const questions = capturedContent.questions.map((q, idx) => {
    const raw = q as {
      id?: number;
      question?: string;
      type?: "multiple_choice" | "written" | "fill_in";
      options?: string[] | null;
      correctAnswer?: string | null;
      hint?: string;
    };
    return {
      id: Number(raw.id ?? idx + 1),
      question: String(raw.question ?? ""),
      type: raw.type ?? "written",
      options: Array.isArray(raw.options) ? raw.options : null,
      correctAnswer: typeof raw.correctAnswer === "string" ? raw.correctAnswer : null,
      hint: String(raw.hint ?? ""),
    };
  });
  const contentProfile = normalizeContentProfile({
    title: capturedContent.title,
    type: extractedType,
    words,
    wordGroups: capturedContent.wordGroups,
    questions,
    contentProfile: capturedContent.contentProfile,
  });
  const normalizedType = resolveHomeworkTypeFromProfile(
    extractedType,
    contentProfile,
    capturedContent.title,
    questions,
  );
  const finalCapturedContent = buildCapturedHomeworkContent({
    title: capturedContent.title,
    type: normalizedType,
    rawText: args.assignmentSource.fullText,
    words,
    wordGroups: capturedContent.wordGroups,
    questions,
    sourceDocuments: capturedContent.sourceDocuments.length
      ? capturedContent.sourceDocuments
      : [{ filename: args.assignmentSource.filename, mediaType: args.assignmentSource.mediaType }],
    contentProfile,
  });
  const contentFingerprint = generateContentFingerprint({
    childId: args.childId,
    title: finalCapturedContent.title,
    rawText: finalCapturedContent.rawText,
    words,
    questions,
    testDate: args.assignmentPlanningPacket.masteryContext.testDate,
    sourceDocuments: finalCapturedContent.sourceDocuments,
  });
  const hydratedOutput: AssignmentPlannerOutput = {
    ...args.assignmentPlannerOutput,
    capturedContent: finalCapturedContent,
    assignmentInterpretation: finalCapturedContent.assignmentInterpretation!,
  };

  return {
    title: finalCapturedContent.title,
    type: normalizedType,
    gradeLevel: 2,
    testDate: args.assignmentPlanningPacket.masteryContext.testDate,
    words,
    wordGroups: finalCapturedContent.wordGroups,
    contentProfile,
    capturedContent: finalCapturedContent,
    contentFingerprint,
    assignmentSource: args.assignmentSource,
    assignmentPlanningPacket: args.assignmentPlanningPacket,
    assignmentPlannerOutput: hydratedOutput,
    assignmentValidationIssues,
    plannerDecisionAudit,
    plannerReadinessAudit,
    assignmentReviewSummary: summarizeAssignmentPlanForReview(hydratedOutput),
    questions,
  };
}

async function extractHomework(args: {
  childId: string;
  filePath: string;
  pageImageDir: string;
  masteryContext: AssignmentMasteryContext;
  plannerModel?: string;
}): Promise<ExtractionShape> {
  repairLatestHistoricalLearningCycleBeforePlanning(args.childId);
  const assignmentSource = await extractAssignmentSource(args.filePath, {
    pageImageDir: args.pageImageDir,
  });
  const assignmentPlanningPacket = buildAssignmentPlanningPacket({
    childId: args.childId,
    extraction: assignmentSource,
    childChart: getChildChart(args.childId),
    masteryContext: args.masteryContext,
  });
  const plannerReadinessAudit = buildPlannerReadinessAudit(assignmentPlanningPacket.activityCatalog);
  const pendingDir = path.dirname(args.pageImageDir);
  const sourceArtifactPath = path.join(pendingDir, "assignment-source-extraction.json");
  const packetArtifactPath = path.join(pendingDir, "assignment-planning-packet.json");
  fs.writeFileSync(sourceArtifactPath, JSON.stringify(assignmentSource, null, 2), "utf8");
  fs.writeFileSync(packetArtifactPath, JSON.stringify(assignmentPlanningPacket, null, 2), "utf8");
  const assignmentPlannerOutput = await withIngestPlannerTimeout(
    planAssignmentFromSource(assignmentPlanningPacket, args.plannerModel ? { model: args.plannerModel } : {}),
    resolveIngestPlannerTimeoutMs(),
    `${args.childId}:assignment-planner`,
    {
      stage: "assignment-planner",
      artifactPaths: [sourceArtifactPath, packetArtifactPath],
    },
  );
  const assignmentValidationIssues = validateAssignmentPlannerOutput(
    assignmentPlannerOutput,
    {
      extraction: assignmentSource,
      activityCatalog: assignmentPlanningPacket.activityCatalog,
    },
  );
  const plannerDecisionAudit = buildPlannerDecisionAudit(assignmentPlannerOutput);
  const blockingIssues = assignmentValidationIssues.filter((issue) => issue.severity === "error");
  if (blockingIssues.length > 0) {
    throw new Error(
      [
        "assignment_plan_invalid",
        ...blockingIssues.map((issue) => `${issue.code}: ${issue.message}`),
      ].join("\n"),
    );
  }

  const capturedContent = assignmentPlannerOutput.capturedContent;
  const extractedType = normalizeHomeworkType(capturedContent.type);
  const words = capturedContent.words.map((word) => String(word));
  const questions = capturedContent.questions.map((q, idx) => {
    const raw = q as {
      id?: number;
      question?: string;
      type?: "multiple_choice" | "written" | "fill_in";
      options?: string[] | null;
      correctAnswer?: string | null;
      hint?: string;
    };
    return {
      id: Number(raw.id ?? idx + 1),
      question: String(raw.question ?? ""),
      type: raw.type ?? "written",
      options: Array.isArray(raw.options) ? raw.options : null,
      correctAnswer: typeof raw.correctAnswer === "string" ? raw.correctAnswer : null,
      hint: String(raw.hint ?? ""),
    };
  });
  const contentProfile = normalizeContentProfile({
    title: capturedContent.title,
    type: extractedType,
    words,
    wordGroups: capturedContent.wordGroups,
    questions,
    contentProfile: capturedContent.contentProfile,
  });
  const normalizedType = resolveHomeworkTypeFromProfile(
    extractedType,
    contentProfile,
    capturedContent.title,
    questions,
  );
  const finalCapturedContent = buildCapturedHomeworkContent({
    title: capturedContent.title,
    type: normalizedType,
    rawText: assignmentSource.fullText,
    words,
    wordGroups: capturedContent.wordGroups,
    questions,
    sourceDocuments: capturedContent.sourceDocuments.length
      ? capturedContent.sourceDocuments
      : [{ filename: assignmentSource.filename, mediaType: assignmentSource.mediaType }],
    contentProfile,
  });
  const contentFingerprint = generateContentFingerprint({
    childId: args.childId,
    title: finalCapturedContent.title,
    rawText: finalCapturedContent.rawText,
    words,
    questions,
    testDate: args.masteryContext.testDate,
    sourceDocuments: finalCapturedContent.sourceDocuments,
  });

  return {
    title: finalCapturedContent.title,
    type: normalizedType,
    gradeLevel: Number((args as { gradeLevel?: number }).gradeLevel ?? 2),
    testDate: args.masteryContext.testDate,
    words,
    wordGroups: finalCapturedContent.wordGroups,
    contentProfile,
    capturedContent: finalCapturedContent,
    contentFingerprint,
    assignmentSource,
    assignmentPlanningPacket,
    assignmentPlannerOutput: {
      ...assignmentPlannerOutput,
      capturedContent: finalCapturedContent,
      assignmentInterpretation: finalCapturedContent.assignmentInterpretation!,
    },
    assignmentValidationIssues,
    plannerDecisionAudit,
    plannerReadinessAudit,
    assignmentReviewSummary: summarizeAssignmentPlanForReview({
      ...assignmentPlannerOutput,
      capturedContent: finalCapturedContent,
      assignmentInterpretation: finalCapturedContent.assignmentInterpretation!,
    }),
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

export function childFacingMathNodeTitle(node: Pick<ActiveSessionPlan["nodePlan"][number], "id" | "type" | "activityId" | "targets">): string {
  const id = node.id.toLowerCase();
  const activityId = (node.activityId ?? node.type).toLowerCase();
  if (activityId === "mystery" || node.type === "mystery") return "Mystery Challenge";
  if (activityId === "quest" || node.type === "quest") return "Multiplication Quest";
  if (activityId === "boss" || node.type === "boss") return "Multiplication Boss";
  if (/vault/.test(id)) return "Vault Cracker";
  if (/clock/.test(id)) return "Array Transfer";
  if (/baseline.*(word|problem)|word-problem/.test(id)) return "Story Solver";
  if (/route-a/.test(id)) return "Speed Facts Sprint";
  if (/route-b/.test(id)) return "Story Transfer";
  if (/route-story/.test(id)) return "Story Transfer";
  if (/baseline/.test(id)) return "Fact Blaster";
  if (/word|problem|story|transfer/.test(id) || node.targets.some((target) => /word|pencil|star|row|box|group/i.test(target))) {
    return "Story Solver";
  }
  if (/speed|timed/.test(id)) return "Speed Facts Sprint";
  if (/fact|fluency|baseline/.test(id)) return "Fact Blaster";
  return "Math Practice Lab";
}

function mathNodeTitleSuffix(node: Pick<ActiveSessionPlan["nodePlan"][number], "id" | "targets">): string {
  const id = node.id.toLowerCase();
  if (/facts-x2/.test(id)) return "2s";
  if (/facts-x5-x10/.test(id)) return "5s & 10s";
  if (/word-problems/.test(id)) return "Word Problems";
  if (/arcade-facts-x2/.test(id)) return "2s Sprint";
  if (/story-word-problems/.test(id)) return "Transfer";
  if (/route-a/.test(id)) return "Speed Arm";
  if (/route-b|route-story/.test(id)) return "Story Arm";
  const target = node.targets.find((value) => value.trim().length > 0);
  if (target) return target.replace(/[^a-z0-9]+/gi, " ").trim().split(/\s+/).slice(0, 2).join(" ");
  return id.replace(/^node[-_]?/, "").replace(/[-_]+/g, " ").trim() || "Variant";
}

/**
 * Apply child-facing disambiguators after the planner has named all arms.
 * Internal node ids remain stable; only duplicate labels receive a short
 * experiment-arm suffix so the board cannot present two indistinguishable
 * choices to a child.
 */
export function ensureUniqueMathNodeTitles(
  nodes: Array<Pick<ActiveSessionPlan["nodePlan"][number], "id" | "type" | "activityId" | "targets">>,
): Map<string, string> {
  const baseById = new Map(nodes.map((node) => [node.id, childFacingMathNodeTitle(node)]));
  const counts = new Map<string, number>();
  for (const title of baseById.values()) counts.set(title, (counts.get(title) ?? 0) + 1);
  const used = new Set<string>();
  return new Map(nodes.map((node) => {
    const base = baseById.get(node.id) ?? "Math Practice Lab";
    if ((counts.get(base) ?? 0) === 1) {
      used.add(base);
      return [node.id, base] as const;
    }
    const suffix = mathNodeTitleSuffix(node);
    let title = `${base} · ${suffix}`;
    if (used.has(title)) title = `${title} · ${node.id.replace(/[-_]+/g, " ")}`;
    used.add(title);
    return [node.id, title] as const;
  }));
}

function finalizeAssignmentActiveSessionPlan(args: {
  plan: ActiveSessionPlan;
  childId: string;
  homeworkId: string;
  domain: HomeworkDomain;
  testDate: string;
  parentNote?: string;
  output: AssignmentPlannerOutput;
}): ActiveSessionPlan {
  const theory = readEngagementTheory(args.childId) ?? buildInitialEngagementTheory({
    childId: args.childId,
    domain: args.domain,
    homeworkId: args.homeworkId,
  });
  writeEngagementTheory(args.childId, theory);
  const routeForNode = new Map<string, string>();
  for (const route of args.plan.learningRoutes ?? []) {
    for (const nodeId of route.nodeIds) {
      if (!routeForNode.has(nodeId)) routeForNode.set(nodeId, route.id);
    }
  }
  const uniqueMathTitles = ensureUniqueMathNodeTitles(args.plan.nodePlan);
  const nodePlan = args.plan.nodePlan.map((node) => {
    const routeId = routeForNode.get(node.id);
    const route = args.plan.learningRoutes?.find((candidate) => candidate.id === routeId);
    const routeText = `${route?.label ?? "baseline"} ${route?.rationale ?? ""}`.toLowerCase();
    const treatment = classifyMathRouteTreatment(routeId, routeText, node.targets);
    const wordProblem = treatment === "story";
    const factNode = treatment !== "story";
    const title = args.domain === "math"
      ? uniqueMathTitles.get(node.id) ?? childFacingMathNodeTitle(node)
      : wordProblem
        ? "Story Solver"
        : factNode
          ? (/timed|speed/i.test(`${node.id} ${routeText}`) ? "Speed Facts Sprint" : "Fact Blaster")
          : "Math Practice Lab";
    const engagementDimensions: EngagementDimension[] = treatment === "story"
      ? ["story", "visual", "calm"]
      : treatment === "speed"
        ? ["speed", "competition", "control"]
        : ["puzzle", "control", "visual"];
    return {
      ...node,
      theoryId: theory.theoryId,
      experimentId: `experiment:${args.homeworkId}:${routeId ?? node.id}`,
      contentId: `${args.homeworkId}:content:${node.id}`,
      title,
      engagementDimensions,
      engagementHypothesis: route?.rationale ?? "Measure engagement with this academic intervention while holding targets constant.",
      mechanic: wordProblem ? "equal-groups-story" : treatment === "speed" ? "fact-retrieval-speed" : "fact-retrieval-puzzle",
      theme: wordProblem ? "story-solver" : treatment === "speed" ? "speed-facts" : "fact-blaster",
      thumbnailUrl: wordProblem ? "/thumbnails/activities/math-generic.svg" : "/thumbnails/activities/math-multiplication.svg",
      thumbnailPrompt: `${title} artwork for ${args.domain} homework; show the exact mechanic and child-safe visual identity.`,
      sfxProfile: "tap-correct-wrong-progress-complete",
      companionPolicy: "talk-to-sunny",
    };
  });
  const nextPlan: ActiveSessionPlan = {
    ...args.plan,
    childId: args.childId,
    source: "ingest_human_loop",
    activeHomeworkId: args.homeworkId,
    domain: args.domain,
    testDate: args.testDate,
    nodePlan,
    ...(args.parentNote ? { parentNote: args.parentNote } : {}),
    approvalStatus: "pending",
    planTheory: args.output.planTheory,
    plannedMeasurements: args.output.plannedMeasurements,
    generatedExperienceBriefs: args.output.generatedExperienceBriefs ?? args.plan.generatedExperienceBriefs,
    evidenceUsed: [
      ...args.plan.evidenceUsed,
      {
        id: "assignment-source",
        type: "assignment_source",
        summary: "Board generated from stored source assignment and local OCR/text extraction.",
      },
    ],
  };
  if (args.plan.adventureBoard) {
    nextPlan.adventureBoard = buildAdventureBoardFromActiveSessionPlan({
      plan: {
        planId: nextPlan.planId,
        childId: nextPlan.childId,
        domain: nextPlan.domain,
        nodePlan: nextPlan.nodePlan as unknown as Array<{
          id: string;
          type: string;
          activityId?: string;
          targets?: string[];
          targetLane?: string;
          title?: string;
          thumbnailUrl?: string;
          theoryId?: string;
          experimentId?: string;
          contentId?: string;
          engagementDimensions?: string[];
          engagementHypothesis?: string;
          mechanic?: string;
          theme?: string;
          sfxProfile?: string;
          companionPolicy?: string;
          gameHtmlPath?: string;
          activityConfigPath?: string;
          locked?: boolean;
          masteryUnlockState?: string;
          difficulty?: number;
        }>,
        learningRoutes: nextPlan.learningRoutes,
      },
      boardId: args.plan.adventureBoard.boardId,
      title: args.plan.adventureBoard.title,
      theme: args.plan.adventureBoard.theme,
      layout: args.plan.adventureBoard.layout,
      plannerRationale: args.plan.adventureBoard.plannerRationale,
      companion: args.plan.adventureBoard.companion,
      labelForNode: (node) => node.title,
      thumbnailForNode: (node) => node.thumbnailUrl,
    });
  }
  return nextPlan;
}

export function classifyMathRouteTreatment(
  routeId: string | undefined,
  routeDescription: string,
  targets: string[],
): "speed" | "story" | "puzzle" {
  const route = `${routeId ?? ""} ${routeDescription}`.toLowerCase();
  if (/story|word.?problem|narrative|equal.?group/.test(route)) return "story";
  if (/speed|timed|sprint|fluency|competitive/.test(route)) return "speed";
  if (targets.some((target) => /word|pencil|star|row|box|group/i.test(target))) return "story";
  return "puzzle";
}

function homeworkNodesFromAssignmentPlan(plan: ActiveSessionPlan, weekOf: string): PlannedNode[] {
  return plan.nodePlan.map((node): PlannedNode => ({
    id: node.id,
    type: node.type as PlannedNode["type"],
    words: [...node.targets],
    difficulty: node.difficulty,
    rationale: [
      `Assignment planner chose ${node.activityId}.`,
      node.targetLane ? `Target lane: ${node.targetLane}.` : "",
    ].filter(Boolean).join(" "),
    gameFile: null,
    storyFile: null,
    activityId: node.activityId,
    date: weekOf,
    choiceMode: node.choiceMode,
    choiceSource: node.choiceSource,
    masteryUnlockState: node.masteryUnlockState,
    locked: node.locked,
    ...(node.type === "word-radar"
      ? {
          wordRadarItems: wordRadarItemsFromWordList(node.targets),
          ...(node.wordRadarConfig ? { wordRadarConfig: node.wordRadarConfig } : {}),
        }
      : {}),
  }));
}

export async function applyPlannedHomeworkIngest(args: PlannedHomeworkIngestArgs): Promise<void> {
  const today = (args.approvedAt ?? new Date().toISOString()).slice(0, 10);
  const extracted = buildHomeworkExtractionFromAssignmentPlan({
    childId: args.childId,
    assignmentSource: args.assignmentSource,
    assignmentPlanningPacket: args.assignmentPlanningPacket,
    assignmentPlannerOutput: args.assignmentPlannerOutput,
  });
  const classifierHomeworkDomain = inferIngestDomainFromExtraction(extracted);
  const selectedHomeworkDomain = args.homeworkDomain ?? classifierHomeworkDomain;
  assertLegacyMathIngestAllowed(selectedHomeworkDomain);
  const contextBase = path.join(process.cwd(), "src", "context", args.childId, "homework");
  const pendingDir = path.join(contextBase, "pending", today);
  fs.mkdirSync(pendingDir, { recursive: true });
  if (fs.existsSync(args.sourceFile)) {
    storeOriginalAssignmentSource(args.sourceFile, pendingDir);
  }
  const testDate = validIsoDate(args.testDate)
    ? args.testDate
    : validIsoDate(extracted.assignmentPlannerOutput.activeSessionPlan.testDate)
      ? extracted.assignmentPlannerOutput.activeSessionPlan.testDate
      : nextFriday();
  const testDateSource: HomeworkTestDateSource = validIsoDate(args.testDate)
    ? "human_confirmed"
    : validIsoDate(extracted.assignmentPlannerOutput.activeSessionPlan.testDate)
      ? "extracted"
      : "inferred_next_friday";
  const testDateConfirmed = validIsoDate(args.testDate);

  fs.writeFileSync(path.join(pendingDir, "classification.json"), JSON.stringify({ ...extracted, testDate }, null, 2), "utf8");
  fs.writeFileSync(path.join(pendingDir, "assignment-source-extraction.json"), JSON.stringify(extracted.assignmentSource, null, 2), "utf8");
  fs.writeFileSync(path.join(pendingDir, "assignment-planning-packet.json"), JSON.stringify(extracted.assignmentPlanningPacket, null, 2), "utf8");
  fs.writeFileSync(path.join(pendingDir, "assignment-planner-output.json"), JSON.stringify(extracted.assignmentPlannerOutput, null, 2), "utf8");
  for (const [filename, payload] of Object.entries(buildPlannerArtifactPayloads({
    packet: extracted.assignmentPlanningPacket,
    output: extracted.assignmentPlannerOutput,
    audit: extracted.plannerDecisionAudit,
    readinessAudit: extracted.plannerReadinessAudit,
  }))) {
    fs.writeFileSync(path.join(pendingDir, filename), payload, "utf8");
  }
  fs.writeFileSync(path.join(pendingDir, "assignment-plan-review.md"), extracted.assignmentReviewSummary, "utf8");
  fs.writeFileSync(
    path.join(pendingDir, "assignment-interpretation.json"),
    JSON.stringify(extracted.capturedContent.assignmentInterpretation, null, 2),
    "utf8",
  );

  const homeworkId = generateHomeworkId(extracted.type, extracted.words);
  const wordBank = readWordBank(args.childId);
  for (const entry of wordBank.words) {
    if (entry.homeworkTargets?.[selectedHomeworkDomain]) {
      entry.homeworkTargets = { ...entry.homeworkTargets };
      delete entry.homeworkTargets[selectedHomeworkDomain];
    }
    if (selectedHomeworkDomain === "spelling") {
      entry.homeworkPriority = false;
    }
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
    const isSpellingTarget = selectedHomeworkDomain === "spelling" && purpose === "spell_from_memory";
    entry.homeworkTargets = {
      ...(entry.homeworkTargets ?? {}),
      [selectedHomeworkDomain]: {
        homeworkId,
        testDate,
        priority: true,
        purpose,
        sourceGroup: sourceGroup?.label,
        updatedAt: new Date().toISOString(),
      },
    };
    if (selectedHomeworkDomain === "spelling") {
      entry.homeworkPriority = isSpellingTarget;
      entry.testDate = testDate;
      entry.homeworkTargetPurpose = purpose;
      entry.homeworkSourceGroup = sourceGroup?.label;
    }
    if (isSpellingTarget && !entry.tracks.spelling) {
      entry.tracks.spelling = createFreshSM2Track(today);
    }
    if (!isSpellingTarget && purpose !== "unknown" && !entry.tracks.reading) {
      entry.tracks.reading = createFreshSM2Track(today);
    }
    const st = isSpellingTarget
      ? entry.tracks.spelling
      : purpose === "unknown"
        ? undefined
        : entry.tracks.reading;
    if (st && st.nextReviewDate > today) {
      st.nextReviewDate = today;
    }
  }
  writeWordBank(args.childId, wordBank);

  const returnTag = buildHomeworkReturnTag(args.childId, homeworkId);
  const cyclesDir = path.join(process.cwd(), "src", "context", args.childId, "homework", "cycles");
  fs.mkdirSync(cyclesDir, { recursive: true });
  const cycleStub = buildCycleStub({
    homeworkId,
    subject: extracted.type,
    wordList: extracted.words,
    contentProfile: extracted.contentProfile,
    capturedContent: extracted.capturedContent,
    contentFingerprint: extracted.contentFingerprint,
    ingestedAt: today,
    testDate,
    testDateSource,
    testDateConfirmed,
    returnTag,
  });
  const patternResult = scanChildErrorPatterns(args.childId);
  const theory = buildPreQuestTheory({
    cycle: cycleStub,
    patterns: patternResult.patterns,
  });
  cycleStub.assumptions = theory.markdown;
  cycleStub.theory = theory;
  fs.writeFileSync(path.join(cyclesDir, `${homeworkId}.json`), JSON.stringify(cycleStub, null, 2), "utf8");

  const assumptionsDir = path.join(process.cwd(), "src", "context", args.childId, "assumptions");
  fs.mkdirSync(assumptionsDir, { recursive: true });
  fs.writeFileSync(
    path.join(assumptionsDir, `${today}-pre.md`),
    `## Homework ingested\n\n**homeworkId:** ${homeworkId}\n**returnTag:** ${returnTag}\n**words:** ${extracted.words.join(", ")}\n**testDate:** ${testDate}\n**testDateSource:** ${testDateSource}\n**testDateConfirmed:** ${testDateConfirmed}\n\n${theory.markdown}\n`,
    "utf8",
  );

  const profileDoc = readLearningProfile(args.childId);
  if (!profileDoc) {
    throw new Error(`Could not read learning_profile.json for child: ${args.childId}`);
  }
  const homeworkNodes = homeworkNodesFromAssignmentPlan(extracted.assignmentPlannerOutput.activeSessionPlan, today);
  const activityArtifacts = writeActivityConfigArtifacts({
    childId: args.childId,
    homeworkId,
    nodes: homeworkNodes,
  });
  const learningPlanArtifact = buildHomeworkLearningPlanArtifact({
    homeworkId,
    childId: args.childId,
    title: extracted.title,
    type: extracted.type,
    words: extracted.words,
    contentProfile: extracted.contentProfile,
  });
  const pendingHomework = buildPendingHomeworkPayload({
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
  cycleStub.nodes = pendingHomework.nodes;
  fs.writeFileSync(path.join(cyclesDir, `${homeworkId}.json`), JSON.stringify(cycleStub, null, 2), "utf8");
  const profileWithHomeworkLane = withActiveHomeworkLane(
    appendHomeworkIntakeHistory({
      profile: profileDoc,
      source: "classifier",
      selectedDomain: selectedHomeworkDomain,
      classifierDomain: classifierHomeworkDomain,
      homeworkId,
      title: extracted.title,
    }),
    selectedHomeworkDomain,
    pendingHomework,
    { select: true },
  );
  const catalogItems = buildHomeworkContentCatalogItems({
    childId: args.childId,
    homeworkId,
    capturedContent: extracted.capturedContent,
    contentFingerprint: extracted.contentFingerprint,
    nodes: homeworkNodes,
    baselineActivities: recommendBaselineActivities(extracted.capturedContent),
  });
  writeLearningProfile(args.childId, upsertProfileContentCatalog(profileWithHomeworkLane, catalogItems));
  const activeSessionPlan = finalizeAssignmentActiveSessionPlan({
    plan: extracted.assignmentPlannerOutput.activeSessionPlan,
    childId: args.childId,
    homeworkId,
    domain: selectedHomeworkDomain,
    testDate,
    output: extracted.assignmentPlannerOutput,
  });
  writeActiveSessionPlan(args.childId, {
    ...activeSessionPlan,
    approvalStatus: "approved",
  });
  fs.writeFileSync(path.join(pendingDir, "learning-plan.json"), JSON.stringify(learningPlanArtifact.plan, null, 2), "utf8");
  fs.writeFileSync(path.join(pendingDir, "learning-plan.md"), learningPlanArtifact.markdown, "utf8");
  console.log(
    ` 🎮 [ingestHomework] [planned-apply] child=${args.childId} homeworkId=${homeworkId} words=${extracted.words.length} activityConfigs=${activityArtifacts.length}`,
  );
  if (args.syncAfterWrite !== false) {
    await runPsychologistSync(args.childId, { planningMode: "homework" });
  }
}

async function runIngestHomeworkInternal(
  argv: string[],
  onStage?: (stage: number, label: string) => void,
): Promise<void> {
  const {
    childId: cliChildId,
    testDate: cliTestDate,
    pdfOverridePath,
    homeworkDomain: cliHomeworkDomain,
    plannerModel,
  } = parseCliArgs(argv);
  const interactive = Boolean(
    input.isTTY && output.isTTY && process.env.SUNNY_NON_INTERACTIVE !== "true",
  );
  const homeworkDomain = await resolveIngestHomeworkDomain({
    homeworkDomain: cliHomeworkDomain,
    interactive,
  });
  assertLegacyMathIngestAllowed(homeworkDomain);
  const childId = await resolveIngestChildId({
    childId: cliChildId,
    childIds: listIngestChildIds(),
    interactive,
  });
  const today = new Date().toISOString().slice(0, 10);
  const contextBase = path.join(process.cwd(), "src", "context", childId, "homework");
  const incomingDir = path.join(contextBase, "incoming");
  const pendingDir = path.join(contextBase, "pending", today);
  fs.mkdirSync(pendingDir, { recursive: true });

  onStage?.(1, "Reading homework");
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
  if (!isSupportedAssignmentSource(incomingFile)) {
    throw new Error(`Homework file must be a .pdf, image, or .txt file: ${incomingFile}`);
  }

  console.log("📄 Step 1/4: Reading homework...");
  console.log(`   Intake file: ${path.basename(incomingFile)}`);
  const storedSourcePath = storeOriginalAssignmentSource(incomingFile, pendingDir);
  const resolvedTestDate = await resolveIngestedTestDate({
    cliTestDate,
    extractedTestDate: null,
    inferredTestDate: nextFriday(),
    interactive,
  });
  const { testDate, testDateSource, testDateConfirmed } = resolvedTestDate;
  const masteryContext = buildAssignmentMasteryContext({
    testDate,
    testDateSource,
    testDateConfirmed,
  });
  const extracted = await extractHomework({
    childId,
    filePath: storedSourcePath,
    pageImageDir: path.join(pendingDir, "source-pages"),
    masteryContext,
    plannerModel,
  });
  onStage?.(2, "Planning learning path");
  const resolvedPlannerModel = resolveAssignmentPlannerModel(
    plannerModel ? { model: plannerModel } : {},
  );
  const classifierHomeworkDomain = inferIngestDomainFromExtraction(extracted);
  const selectedHomeworkDomain = homeworkDomain ?? classifierHomeworkDomain;
  assertLegacyMathIngestAllowed(selectedHomeworkDomain);
  const intakeDecisionSource: "human_menu" | "cli" | "classifier" = cliHomeworkDomain
    ? "cli"
    : homeworkDomain
      ? "human_menu"
      : "classifier";
  const daysUntilTest = masteryContext.daysUntilTest ?? daysUntil(testDate);
  const wordsLine =
    extracted.words.length <= 5
      ? extracted.words.join(", ")
      : `${extracted.words.slice(0, 5).join(", ")}... (${extracted.words.length} words)`;
  console.log(`✅ Found: ${extracted.title}`);
  console.log(
    `   Domain: ${selectedHomeworkDomain} (classifier=${classifierHomeworkDomain}, source=${intakeDecisionSource})`,
  );
  console.log(`   Words: ${wordsLine}`);
  console.log(
    `   Test date: ${testDate} (${daysUntilTest} days away, source=${testDateSource}, confirmed=${testDateConfirmed})`,
  );
  console.log(`   Source: ${extracted.assignmentSource.sourceKind} via ${extracted.assignmentSource.extractionMethod}`);
  if (extracted.assignmentSource.warnings.length) {
    console.log("   Source warnings:");
    for (const warning of extracted.assignmentSource.warnings) {
      console.log(`   - ${describeAssignmentSourceWarning(warning)}`);
    }
  }
  console.log("");
  console.log(extracted.assignmentReviewSummary);
  fs.writeFileSync(
    path.join(pendingDir, "classification.json"),
    JSON.stringify({ ...extracted, testDate }, null, 2),
    "utf8",
  );
  fs.writeFileSync(
    path.join(pendingDir, "assignment-source-extraction.json"),
    JSON.stringify(extracted.assignmentSource, null, 2),
    "utf8",
  );
  fs.writeFileSync(
    path.join(pendingDir, "assignment-planning-packet.json"),
    JSON.stringify(extracted.assignmentPlanningPacket, null, 2),
    "utf8",
  );
  fs.writeFileSync(
    path.join(pendingDir, "assignment-planner-output.json"),
    JSON.stringify(extracted.assignmentPlannerOutput, null, 2),
    "utf8",
  );
  for (const [filename, payload] of Object.entries(buildPlannerArtifactPayloads({
    packet: extracted.assignmentPlanningPacket,
    output: extracted.assignmentPlannerOutput,
    audit: extracted.plannerDecisionAudit,
    readinessAudit: extracted.plannerReadinessAudit,
    comparison: plannerComparisonArtifact({
      packet: extracted.assignmentPlanningPacket,
      output: extracted.assignmentPlannerOutput,
      plannerModel: resolvedPlannerModel,
    }),
  }))) {
    fs.writeFileSync(path.join(pendingDir, filename), payload, "utf8");
  }
  fs.writeFileSync(
    path.join(pendingDir, "assignment-plan-review.md"),
    extracted.assignmentReviewSummary,
    "utf8",
  );
  fs.writeFileSync(
    path.join(pendingDir, "assignment-interpretation.json"),
    JSON.stringify(extracted.capturedContent.assignmentInterpretation, null, 2),
    "utf8",
  );

  console.log("");
  console.log("📦 Step 2/4: Seeding word bank and creating cycle record...");

  const homeworkId = generateHomeworkId(extracted.type, extracted.words);
  const wordBank = readWordBank(childId);
  for (const entry of wordBank.words) {
    if (entry.homeworkTargets?.[selectedHomeworkDomain]) {
      entry.homeworkTargets = { ...entry.homeworkTargets };
      delete entry.homeworkTargets[selectedHomeworkDomain];
    }
    if (selectedHomeworkDomain === "spelling") {
      entry.homeworkPriority = false;
    }
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
    const isSpellingTarget = selectedHomeworkDomain === "spelling" && purpose === "spell_from_memory";
    entry.homeworkTargets = {
      ...(entry.homeworkTargets ?? {}),
      [selectedHomeworkDomain]: {
        homeworkId,
        testDate,
        priority: true,
        purpose,
        sourceGroup: sourceGroup?.label,
        updatedAt: new Date().toISOString(),
      },
    };
    if (selectedHomeworkDomain === "spelling") {
      entry.homeworkPriority = isSpellingTarget;
      entry.testDate = testDate;
      entry.homeworkTargetPurpose = purpose;
      entry.homeworkSourceGroup = sourceGroup?.label;
    }
    if (isSpellingTarget && !entry.tracks.spelling) {
      entry.tracks.spelling = createFreshSM2Track(today);
    }
    if (!isSpellingTarget && purpose !== "unknown" && !entry.tracks.reading) {
      entry.tracks.reading = createFreshSM2Track(today);
    }
    const st = isSpellingTarget
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
  console.log(`🔁 Cycle evidence captured → canonical cycle pending planner decision`);

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
  onStage?.(3, "Saving child evidence");

  const profileDoc = readLearningProfile(childId);
  if (!profileDoc) {
    throw new Error(`Could not read learning_profile.json for child: ${childId}`);
  }
  const homeworkNodes = homeworkNodesFromAssignmentPlan(
    extracted.assignmentPlannerOutput.activeSessionPlan,
    today,
  );
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

  const pendingHomework = buildPendingHomeworkPayload({
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
  cycleStub.nodes = pendingHomework.nodes;
  const profileWithHomeworkLane = withActiveHomeworkLane(
    appendHomeworkIntakeHistory({
      profile: profileDoc,
      source: intakeDecisionSource,
      selectedDomain: selectedHomeworkDomain,
      classifierDomain: classifierHomeworkDomain,
      homeworkId,
      title: extracted.title,
    }),
    selectedHomeworkDomain,
    pendingHomework,
    { select: true },
  );
  const catalogItems = buildHomeworkContentCatalogItems({
    childId,
    homeworkId,
    capturedContent: extracted.capturedContent,
    contentFingerprint,
    nodes: homeworkNodes,
    baselineActivities: recommendBaselineActivities(extracted.capturedContent),
  });
  const profileWithCatalog = upsertProfileContentCatalog(profileWithHomeworkLane, catalogItems);
  // The canonical cycle still owns the prior plan at this point. Persist the
  // new homework/catalog facts without asking a stale compatibility plan to
  // overwrite that projection; the reconciled plan is written below.
  writeLearningProfile(childId, profileWithCatalog, { skipSessionPlanProjection: true });
  const parentPlanNote = await promptForSessionPlanNote(interactive);
  const activeSessionPlan = finalizeAssignmentActiveSessionPlan({
    plan: extracted.assignmentPlannerOutput.activeSessionPlan,
    childId,
    homeworkId,
    domain: selectedHomeworkDomain,
    testDate,
    parentNote: parentPlanNote,
    output: extracted.assignmentPlannerOutput,
  });
  const reviewedPlan = await reviewExperiencePlan(childId, activeSessionPlan, {
    interactive,
  });
  if (reviewedPlan.approvalStatus === "rejected") {
    console.log("  🎮 [experience-planner] [pending-review] homework saved; session plan not activated");
  } else {
    const practiceDomain = extracted.contentProfile.practiceDomain;
    const planWithArtwork = practiceDomain === "math"
      ? {
          ...reviewedPlan,
          nodePlan: await localizeMathNodeArtwork(
            await enrichMathNodeArtwork(reviewedPlan.nodePlan, (prompt) =>
              generateStoryImage(prompt, {
                useDirectScene: true,
                purpose: "math-node-thumbnail",
                cacheKeyParts: [childId, homeworkId, prompt],
              }),
            ),
            { childId, homeworkId },
          ),
        }
      : reviewedPlan;
    onStage?.(4, "Building learning activities");
    const canonicalCycle = persistIngestedLearningCycle({
      childId,
      homeworkId,
      domain: practiceDomain,
      title: extracted.title,
      contentFingerprint,
      capturedEvidenceIds: [`assignment:${contentFingerprint}`],
      targets: [...new Set(planWithArtwork.nodePlan.flatMap((node) => node.targets))],
      plan: planWithArtwork,
      engagementTheory: readEngagementTheory(childId),
    });
    writeActiveSessionPlan(childId, canonicalCycle
      ? (await import("../engine/learningCycleRepository")).projectLearningCycle(canonicalCycle).activeSessionPlan
      : planWithArtwork);
    // Dynamic imports: baselineGameFactory imports from this module, so a
    // static import here would create a require cycle.
    const { autoAttachBaselineShellForHomework, resolveBaselineRoundsForNodes } =
      await import("../engine/baselineShellAutoAttach");
    const roundsByNodeId = await resolveBaselineRoundsForNodes({
      nodes: planWithArtwork.nodePlan.map((node) => ({
        id: node.id,
        type: node.type,
        words: node.targets,
        rounds: node.rounds,
      })),
      worksheetText: extracted.capturedContent.rawText,
      domain: practiceDomain,
    });
    let generationHandledNodeIds: string[] = [];
    const generationRequests = extracted.assignmentPlannerOutput.generationRequests ?? [];
    // Phase-1 gate: fully automatic generation is math-only; internals are
    // domain-parameterized so lifting this is a one-line change.
    if (practiceDomain === "math" && generationRequests.length > 0 && process.env.ANTHROPIC_API_KEY) {
      const { generateAndAttachBaselineShells } = await import("../engine/baselineShellIngestPipeline");
      const pipeline = await generateAndAttachBaselineShells({
        childId,
        homeworkId,
        domain: practiceDomain,
        title: extracted.title,
        conceptText: extracted.capturedContent.rawText,
        generationRequests,
        roundsByNodeId,
        waitForCompletion: true,
      });
      generationHandledNodeIds = [
        ...new Set([...pipeline.attachedNodeIds, ...pipeline.failedNodeIds, ...pipeline.pendingNodeIds]),
      ];
      if (pipeline.failedNodeIds.length > 0) {
        onStage?.(4, "Building learning activities — generation blocked");
      }
      console.log(
        `  🎮 [baseline-pipeline] attached=${pipeline.attachedNodeIds.length} failed=${pipeline.failedNodeIds.length} pending=${pipeline.pendingNodeIds.length}`,
      );
    }
    autoAttachBaselineShellForHomework({
      childId,
      homeworkId,
      domain: practiceDomain,
      title: extracted.title,
      conceptText: extracted.capturedContent.rawText,
      roundsByNodeId,
      ...(generationHandledNodeIds.length > 0 ? { skipNodeIds: generationHandledNodeIds } : {}),
    });
    // Best-effort per-node board illustrations; a full board needs more than
    // the 1-image default budget, so raise it for this CLI run only.
    process.env.SUNNY_IMAGE_GENERATION_MAX_PER_RUN ||= "8";
    const { generateBoardNodeImages } = await import("../engine/boardNodeImageGenerator");
    const boardImages = await generateBoardNodeImages({ childId, homeworkId }).catch((err: unknown) => {
      console.log(
        `  🎮 [board-image] [skipped] ${err instanceof Error ? err.message : String(err)}`,
      );
      return { generated: 0, skipped: "error" };
    });
    if (boardImages.generated > 0) {
      console.log(`  🎮 [board-image] generated ${boardImages.generated} node illustrations`);
    }
  }
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
  onStage?.(5, "Finishing and syncing");
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

/** Keep the terminal focused on the five ingestion stages. */
export async function runIngestHomework(argv: string[]): Promise<void> {
  const { childId: cliChildId } = parseCliArgs(argv);
  const diagnostics: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const progress: IngestProgress = createIngestProgress({
    interactive: Boolean(input.isTTY && output.isTTY),
    write: (text) => output.write(text),
  });
  console.log = (...args: unknown[]) => {
    diagnostics.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    diagnostics.push(`[stderr] ${args.map(String).join(" ")}`);
  };
  try {
    await runIngestHomeworkInternal(argv, (stage, label) => progress.update(stage, label));
  } catch (error) {
    progress.finish();
    originalLog("Done — BLOCKED");
    originalLog(`Reason: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  const childId = cliChildId ?? listIngestChildIds()[0];
  if (!childId) {
    progress.finish();
    originalLog("Done — BLOCKED");
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const summary = buildIngestSummary(childId, today);
  if (!summary) {
    progress.finish();
    originalLog("Done — BLOCKED");
    return;
  }
  writeIngestReport(summary, diagnostics);
  progress.finish();
  originalLog(`Done — ${summary.status}`);
  originalLog(`Activities: ${summary.launchableActivities} launchable`);
  if (summary.readinessFailures.length > 0) {
    originalLog(`Reason: ${summary.readinessFailures.slice(0, 8).join(", ")}`);
  }
  originalLog(`Next: ${summary.domain === "spelling" ? "npm run sunny:homework:spelling" : "npm run sunny:homework"}`);
  /* Keep the report discoverable without reprinting its contents. */
  originalLog(`Details: ${summary.reportPath}`);
}

if (typeof require !== "undefined" && require.main === module) {
  runIngestHomework(process.argv.slice(2)).catch((err) => {
    console.error("🎮 [ingestHomework] failed", err);
    process.exit(1);
  });
}
