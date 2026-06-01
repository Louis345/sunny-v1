import "dotenv/config";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { extractAssignmentSource, type AssignmentSourceExtraction } from "../engine/assignmentSourceExtraction";
import {
  buildAssignmentPlannerPrompt,
  buildAssignmentPlanningPacket,
  planAssignmentFromSourceWithTelemetry,
  summarizeAssignmentPlanForReview,
  validateAssignmentPlannerOutput,
  type AssignmentActivityCard,
  type AssignmentPlannerOutput,
  type AssignmentPlannerTelemetry,
  type AssignmentPlanningOptions,
  type AssignmentPlanningPacket,
} from "../engine/assignmentPlanner";
import { getChildChart, type ChildChart } from "../profiles/childChart";

export type PlannerTutorEvidenceState =
  | "cold_start"
  | "partial_learning"
  | "strong_mastery"
  | "fatigue_or_boredom";

export const evidenceStateSummaries: Record<PlannerTutorEvidenceState, string[]> = {
  cold_start: [
    "No prior target-level evidence is available for this exact assignment. Plan like the first session must discover the gap without feeling like a grind.",
  ],
  partial_learning: [
    "Recent canonical evidence: missed know, write, gnat, wrong, climb.",
    "Recent canonical evidence: mastered sign, thumb, comb, knock, knife.",
    "Next board should support named misses more than mastered words.",
  ],
  strong_mastery: [
    "Recent canonical evidence: all silent-letter targets correct first try with low latency and no help.",
    "Next board should shrink redundant baseline work and move toward spaced check or transfer.",
  ],
  fatigue_or_boredom: [
    "Recent engagement evidence: child showed fatigue after repeated same-shell Word Radar nodes.",
    "Next board should preserve the skill target but switch to different-feeling material.",
  ],
};

export type PlannerTutorTargetBoardNode = {
  activityId: string;
  purpose: string;
  rationale: string;
};

export type PlannerTutorHumanTargetBoard = {
  childId: string;
  note: string;
  nodes: PlannerTutorTargetBoardNode[];
};

export type PlannerTutorQuestionResult = {
  question: string;
  passed: boolean;
  evidence: string;
};

export type PlannerTutorRunReport = {
  childId: string;
  evidenceState: PlannerTutorEvidenceState;
  model: string;
  promptHash: string;
  inputHash: string;
  estimatedCostUsd: number;
  telemetry: AssignmentPlannerTelemetry | null;
  packetSummary: {
    sourceFile: string;
    sourceHasPageImages: boolean;
    sourceTextLength: number;
    childFacts: string[];
    activityIds: string[];
    recentEvidence: string[];
  };
  boardSequence: string[];
  tutorQuestions: PlannerTutorQuestionResult[];
  validationIssues: Array<{ code: string; severity: string; message: string }>;
  reviewSummary: string;
  humanTargetBoard: PlannerTutorHumanTargetBoard;
  failures: string[];
  passed: boolean;
};

export type HistoricalActivityEvidence = {
  activityId: string;
  displayName: string;
  rating: string;
  decision: string;
  masteryValidity: string;
  adaptationValue: string;
};

export type PlannerTutorLabReport = {
  reportVersion: 1;
  generatedAt: string;
  labDir: string;
  sourceFile: string;
  children: string[];
  evidenceStates: PlannerTutorEvidenceState[];
  totalEstimatedCostUsd: number;
  maxCostUsd: number;
  historicalActivityEvidence: HistoricalActivityEvidence[];
  runs: PlannerTutorRunReport[];
  crossRunFindings: string[];
  failures: string[];
  proved: boolean;
};

type PlanAssignmentResult =
  | AssignmentPlannerOutput
  | { output: AssignmentPlannerOutput; telemetry?: AssignmentPlannerTelemetry };

export type RunPlannerTutorLabOptions = {
  rootDir?: string;
  sourceFile?: string;
  children?: string[];
  evidenceStates?: PlannerTutorEvidenceState[];
  generatedAt?: string;
  model?: string;
  maxCostUsd?: number;
  callTimeoutMs?: number;
  logger?: Pick<typeof console, "log">;
  extractSource?: (
    sourceFile: string,
    opts: { pageImageDir: string },
  ) => Promise<AssignmentSourceExtraction>;
  getChart?: (childId: string, opts: { rootDir: string }) => ChildChart;
  planAssignment?: (
    packet: AssignmentPlanningPacket,
    opts: AssignmentPlanningOptions,
  ) => Promise<PlanAssignmentResult>;
};

const DEFAULT_SOURCE_FILE = "/Users/jamaltaylor/Downloads/5_18_spelling.pdf";
const DEFAULT_CHILDREN = ["ila", "reina"];
const DEFAULT_EVIDENCE_STATES: PlannerTutorEvidenceState[] = [
  "cold_start",
  "partial_learning",
  "strong_mastery",
  "fatigue_or_boredom",
];
const DESTINATION_ACTIVITY_IDS = new Set(["mystery", "quest", "boss"]);
const DEFAULT_CALL_TIMEOUT_MS = 120_000;

function safeStamp(value: string): string {
  return value.replace(/[:.]/g, "-");
}

function hashJson(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function reasoningText(output: AssignmentPlannerOutput): string {
  return [
    output.planTheory.hypothesis,
    output.planTheory.intervention,
    ...output.planTheory.evidenceSummary,
    ...output.planTheory.supportCriteria,
    ...output.planTheory.reviseCriteria,
    ...output.planTheory.falsifyCriteria,
    ...output.reviewQuestions,
    ...output.activeSessionPlan.evidenceUsed.map((item) => item.summary),
  ].join(" ");
}

function boardSequence(output: AssignmentPlannerOutput): string[] {
  return output.activeSessionPlan.nodePlan.map((node) =>
    `${node.activityId}${node.locked ? " (locked)" : ""}`);
}

function preMysteryNodes(output: AssignmentPlannerOutput): AssignmentPlannerOutput["activeSessionPlan"]["nodePlan"] {
  const index = output.activeSessionPlan.nodePlan.findIndex((node) => node.type === "mystery" || node.activityId === "mystery");
  return output.activeSessionPlan.nodePlan.slice(0, index >= 0 ? index : undefined)
    .filter((node) => !DESTINATION_ACTIVITY_IDS.has(node.activityId));
}

function hasGroup(output: AssignmentPlannerOutput, pattern: RegExp, purpose?: string): boolean {
  return output.assignmentInterpretation.wordGroups.some((group) =>
    pattern.test(group.label) && (!purpose || group.purpose === purpose));
}

function groupIds(output: AssignmentPlannerOutput, pattern: RegExp): Set<string> {
  return new Set(output.assignmentInterpretation.wordGroups
    .filter((group) => pattern.test(group.label))
    .map((group) => group.id));
}

function hasNodeForLane(
  output: AssignmentPlannerOutput,
  laneIds: Set<string>,
  activityIds: Set<string>,
): boolean {
  return output.activeSessionPlan.nodePlan.some((node) =>
    laneIds.has(String(node.targetLane ?? "")) && activityIds.has(node.activityId));
}

function highFrequencySpellingProductionOnly(output: AssignmentPlannerOutput): boolean {
  const lanes = groupIds(output, /high[-\s]?frequency/i);
  if (lanes.size === 0) return false;
  const hfwNodes = output.activeSessionPlan.nodePlan.filter((node) =>
    lanes.has(String(node.targetLane ?? "")) && !DESTINATION_ACTIVITY_IDS.has(node.activityId));
  if (hfwNodes.length === 0) return true;
  return hfwNodes.every((node) => node.activityId === "spell-check" || node.activityId === "letter-rush");
}

function repeatedShellsBeforeMystery(output: AssignmentPlannerOutput): string[] {
  const counts = new Map<string, number>();
  for (const node of preMysteryNodes(output)) {
    counts.set(node.activityId, (counts.get(node.activityId) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([activityId]) => activityId);
}

function hasAntiGrindRationale(output: AssignmentPlannerOutput): boolean {
  return /(not feel like grind|avoid grind|boring|bored|repetition|repeated|same shell|same game|different-feeling|varied|switch|texture|because .*repeat)/i
    .test(reasoningText(output));
}

function hasAdventureSpine(output: AssignmentPlannerOutput): boolean {
  const nodes = output.activeSessionPlan.nodePlan;
  const firstMystery = nodes.findIndex((node) => node.type === "mystery" || node.activityId === "mystery");
  const hasEvidenceBeforeMystery = firstMystery > 0;
  const hasOpenMystery = nodes.some((node) => node.activityId === "mystery" && node.locked !== true);
  const hasLockedQuest = nodes.some((node) => node.activityId === "quest" && node.locked === true);
  const hasLockedBoss = nodes.some((node) => node.activityId === "boss" && node.locked === true);
  return hasEvidenceBeforeMystery && hasOpenMystery && hasLockedQuest && hasLockedBoss;
}

function explainsLikeTutor(output: AssignmentPlannerOutput): boolean {
  const text = reasoningText(output);
  return text.split(/[.!?]+/).filter((sentence) => sentence.trim().length > 18).length >= 2 &&
    /\b(because|so|why|therefore|this)\b/i.test(text);
}

function evidenceVisibleInReasoning(
  output: AssignmentPlannerOutput,
  evidenceState: PlannerTutorEvidenceState,
): boolean {
  if (evidenceState === "cold_start") return true;
  const text = normalizeText(reasoningText(output));
  return evidenceStateSummaries[evidenceState].some((summary) => {
    const words = summary.match(/[a-z]{4,}/gi) ?? [];
    return words.slice(0, 4).some((word) => text.includes(word.toLowerCase()));
  });
}

function childFacts(packet: AssignmentPlanningPacket): string[] {
  return [
    packet.childChart.displayName,
    packet.childChart.selectedCompanionName,
    packet.childChart.activeHomeworkSummary,
    packet.childChart.carePlanSummary,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function childFactsUsed(packet: AssignmentPlanningPacket, output: AssignmentPlannerOutput): boolean {
  const text = normalizeText(reasoningText(output));
  return childFacts(packet).some((fact) => {
    const compact = normalizeText(fact);
    if (compact.length < 3) return false;
    const firstToken = compact.split(/\s+/)[0] ?? "";
    return firstToken.length >= 3 && text.includes(firstToken);
  });
}

function knownActivityIds(packet: AssignmentPlanningPacket): Set<string> {
  return new Set([
    ...packet.activityCatalog.map((card) => card.activityId),
    ...DESTINATION_ACTIVITY_IDS,
  ]);
}

function materialChoicesAreKnown(packet: AssignmentPlanningPacket, output: AssignmentPlannerOutput): boolean {
  const known = knownActivityIds(packet);
  return output.activeSessionPlan.nodePlan.every((node) => known.has(node.activityId));
}

function validationExtractionFromPacket(packet: AssignmentPlanningPacket): AssignmentSourceExtraction {
  return {
    sourceKind: packet.sourceDocument.sourceKind as AssignmentSourceExtraction["sourceKind"],
    sourcePath: packet.sourceDocument.filename,
    filename: packet.sourceDocument.filename,
    mediaType: packet.sourceDocument.mediaType,
    fileHash: packet.sourceDocument.fileHash,
    extractionMethod: packet.sourceDocument.extractionMethod as AssignmentSourceExtraction["extractionMethod"],
    pages: packet.sourceDocument.pages.map((page) => ({ ...page })),
    fullText: packet.sourceDocument.fullText,
    warnings: [...packet.sourceDocument.warnings],
  };
}

function materialVariety(output: AssignmentPlannerOutput): boolean {
  return new Set(preMysteryNodes(output).map((node) => node.activityId)).size >= 2 || hasAntiGrindRationale(output);
}

function estimateCostUsd(model: string, telemetry: AssignmentPlannerTelemetry | null): number {
  const usage = telemetry?.usage as {
    inputTokens?: number;
    outputTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
  } | undefined;
  if (!usage) return 0;
  const inputTokens = usage.inputTokens ?? usage.promptTokens ?? 0;
  const outputTokens = usage.outputTokens ?? usage.completionTokens ?? 0;
  if (inputTokens === 0 && outputTokens === 0) return 0.05;
  const normalized = model.toLowerCase();
  const inputPerToken = normalized.includes("haiku") ? 0.0000008 : normalized.includes("opus") ? 0.000015 : 0.000003;
  const outputPerToken = normalized.includes("haiku") ? 0.000004 : normalized.includes("opus") ? 0.000075 : 0.000015;
  return Number((inputTokens * inputPerToken + outputTokens * outputPerToken).toFixed(4));
}

export function plannerTutorHumanTargetBoard(childId: string): PlannerTutorHumanTargetBoard {
  const normalized = childId.trim().toLowerCase();
  if (normalized === "reina") {
    return {
      childId,
      note: "Same worksheet, but with a more competitive/strategy-feeling path if her chart supports it.",
      nodes: [
        { activityId: "spell-check", purpose: "cold spelling baseline", rationale: "Find what she can spell from memory before teaching." },
        { activityId: "letter-rush", purpose: "silent-letter production practice", rationale: "Keep spelling evidence but make it feel faster and more game-like." },
        { activityId: "pronunciation", purpose: "high-frequency fluency", rationale: "Treat the second column as reading/pronunciation, not spelling grind." },
        { activityId: "monster-stampede", purpose: "high-energy reinforcement", rationale: "Use a different-feeling material before the reward node." },
        { activityId: "mystery", purpose: "choice/preference evidence", rationale: "Let the child choose after real evidence exists." },
        { activityId: "quest", purpose: "locked transfer", rationale: "Prepare a generated transfer only after baseline evidence." },
        { activityId: "boss", purpose: "locked mastery finale", rationale: "Mastery finale waits for quest evidence." },
      ],
    };
  }
  return {
    childId,
    note: "A good tutor would check, switch texture, support the fragile lane, then reward after useful evidence.",
    nodes: [
      { activityId: "spell-check", purpose: "cold spelling baseline", rationale: "Silent letters need production evidence from memory." },
      { activityId: "pronunciation", purpose: "high-frequency fluency", rationale: "High-frequency words should be read/sounded, not automatically spelling-drilled." },
      { activityId: "letter-rush", purpose: "silent-letter practice", rationale: "A different-feeling spelling material keeps evidence valid without grind." },
      { activityId: "monster-stampede", purpose: "brief reinforcement", rationale: "Use energy to keep effort alive if the chart suggests fatigue risk." },
      { activityId: "mystery", purpose: "choice/preference evidence", rationale: "Choice comes after baseline work." },
      { activityId: "quest", purpose: "locked transfer", rationale: "Transfer waits for evidence." },
      { activityId: "boss", purpose: "locked mastery finale", rationale: "Boss is not a baseline activity." },
    ],
  };
}

export function analyzePlannerTutorOutput(args: {
  childId: string;
  evidenceState: PlannerTutorEvidenceState;
  packet: AssignmentPlanningPacket;
  output: AssignmentPlannerOutput;
  model: string;
  estimatedCostUsd: number;
  telemetry: AssignmentPlannerTelemetry | null;
}): PlannerTutorRunReport {
  const silentLanes = groupIds(args.output, /silent/i);
  const hfwLanes = groupIds(args.output, /high[-\s]?frequency/i);
  const repeated = repeatedShellsBeforeMystery(args.output);
  const validationIssues = validateAssignmentPlannerOutput(args.output, {
    extraction: validationExtractionFromPacket(args.packet),
    activityIds: [...knownActivityIds(args.packet)],
  });

  const tutorQuestions: PlannerTutorQuestionResult[] = [
    {
      question: "Can this tutor read the assignment?",
      passed: hasGroup(args.output, /silent/i, "spell_from_memory") &&
        hasGroup(args.output, /high[-\s]?frequency/i) &&
        !highFrequencySpellingProductionOnly(args.output),
      evidence: args.output.assignmentInterpretation.wordGroups
        .map((group) => `${group.label}:${group.purpose}`)
        .join(", "),
    },
    {
      question: "Can they understand my child?",
      passed: childFactsUsed(args.packet, args.output),
      evidence: childFacts(args.packet).join("; ") || "No child facts were present in the packet.",
    },
    {
      question: "Can they choose materials well?",
      passed: materialChoicesAreKnown(args.packet, args.output) &&
        hasNodeForLane(args.output, silentLanes, new Set(["spell-check", "letter-rush", "word-radar"])) &&
        (hfwLanes.size === 0 || hasNodeForLane(args.output, hfwLanes, new Set(["pronunciation", "word-radar"]))),
      evidence: boardSequence(args.output).join(" -> "),
    },
    {
      question: "Can they keep the child engaged?",
      passed: materialVariety(args.output) && hasAdventureSpine(args.output),
      evidence: `preMystery=${preMysteryNodes(args.output).map((node) => node.activityId).join(" -> ")}`,
    },
    {
      question: "Can they avoid grind?",
      passed: repeated.length === 0 || hasAntiGrindRationale(args.output),
      evidence: repeated.length ? `repeated=${repeated.join(", ")}` : "No repeated activity shell before Mystery.",
    },
    {
      question: "Can they explain the plan like a real person?",
      passed: explainsLikeTutor(args.output),
      evidence: args.output.reviewQuestions.join(" "),
    },
    {
      question: "Can they adapt when evidence changes?",
      passed: evidenceVisibleInReasoning(args.output, args.evidenceState),
      evidence: args.evidenceState === "cold_start"
        ? "Cold start does not require prior-evidence citation."
        : args.packet.childChart.recentEvidence.join(" "),
    },
  ];

  const failures = [
    ...tutorQuestions.filter((question) => !question.passed).map((question) => question.question),
    ...validationIssues.filter((issue) => issue.severity === "error").map((issue) => `${issue.code}: ${issue.message}`),
  ];
  if (repeated.length > 0 && !hasAntiGrindRationale(args.output)) {
    failures.push("same activity shell repeats before Mystery without a believable anti-grind rationale");
  }

  const prompt = buildAssignmentPlannerPrompt(args.packet);
  return {
    childId: args.childId,
    evidenceState: args.evidenceState,
    model: args.model,
    promptHash: hashJson(prompt),
    inputHash: hashJson(args.packet),
    estimatedCostUsd: args.estimatedCostUsd,
    telemetry: args.telemetry,
    packetSummary: {
      sourceFile: args.packet.sourceDocument.filename,
      sourceHasPageImages: args.packet.sourceDocument.pages.some((page) => Boolean(page.imagePath)),
      sourceTextLength: args.packet.sourceDocument.fullText.length,
      childFacts: childFacts(args.packet),
      activityIds: args.packet.activityCatalog.map((card) => card.activityId),
      recentEvidence: [...args.packet.childChart.recentEvidence],
    },
    boardSequence: boardSequence(args.output),
    tutorQuestions,
    validationIssues,
    reviewSummary: summarizeAssignmentPlanForReview(args.output),
    humanTargetBoard: plannerTutorHumanTargetBoard(args.childId),
    failures,
    passed: failures.length === 0,
  };
}

function latestHistoricalActivityFile(rootDir: string): string | null {
  const base = path.join(rootDir, ".sunny-sandbox", "lab", "spelling");
  if (!fs.existsSync(base)) return null;
  const dirs = fs.readdirSync(base)
    .map((name) => path.join(base, name))
    .filter((file) => fs.statSync(file).isDirectory())
    .sort()
    .reverse();
  for (const dir of dirs) {
    const file = path.join(dir, "activity-efficacy.json");
    if (fs.existsSync(file)) return file;
  }
  return null;
}

export function readHistoricalActivityEvidence(rootDir = process.cwd()): HistoricalActivityEvidence[] {
  const file = latestHistoricalActivityFile(rootDir);
  if (!file) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as HistoricalActivityEvidence[];
    return parsed
      .filter((item) => item.activityId && item.displayName)
      .map((item) => ({
        activityId: item.activityId,
        displayName: item.displayName,
        rating: item.rating,
        decision: item.decision,
        masteryValidity: item.masteryValidity,
        adaptationValue: item.adaptationValue,
      }));
  } catch {
    return [];
  }
}

function boardSignature(run: PlannerTutorRunReport): string {
  return run.boardSequence.join(" -> ");
}

function crossRunFindings(runs: PlannerTutorRunReport[]): { findings: string[]; failures: string[] } {
  const findings: string[] = [];
  const failures: string[] = [];
  const byChild = new Map<string, PlannerTutorRunReport[]>();
  for (const run of runs) {
    byChild.set(run.childId, [...(byChild.get(run.childId) ?? []), run]);
  }
  for (const [childId, childRuns] of byChild.entries()) {
    const signatures = new Set(childRuns.map(boardSignature));
    if (childRuns.length > 1 && signatures.size <= 1) {
      failures.push(`${childId}: evidence states did not change the adventure board signature`);
    } else {
      findings.push(`${childId}: evidence states produced ${signatures.size} distinct board signature(s).`);
    }
  }
  const coldRuns = runs.filter((run) => run.evidenceState === "cold_start");
  if (coldRuns.length >= 2) {
    const signatures = new Set(coldRuns.map(boardSignature));
    if (signatures.size <= 1) {
      findings.push("Child-profile comparison used the same board sequence; inspect rationale for child-specific differences.");
    } else {
      findings.push("Child-profile comparison produced different board sequences.");
    }
  }
  return { findings, failures };
}

async function normalizePlanResult(
  result: PlanAssignmentResult,
): Promise<{ output: AssignmentPlannerOutput; telemetry: AssignmentPlannerTelemetry | null }> {
  if ("output" in result) {
    return { output: result.output, telemetry: result.telemetry ?? null };
  }
  return { output: result, telemetry: null };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`planner_tutor_lab_call_timeout:${label}:${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function renderMarkdown(report: PlannerTutorLabReport): string {
  const lines: string[] = [];
  lines.push("# Sunny Planner Tutor Lab");
  lines.push("");
  lines.push(`generatedAt: ${report.generatedAt}`);
  lines.push(`sourceFile: ${report.sourceFile}`);
  lines.push(`proved: ${report.proved ? "yes" : "no"}`);
  lines.push(`estimatedCostUsd: ${report.totalEstimatedCostUsd.toFixed(4)} / ${report.maxCostUsd.toFixed(2)}`);
  lines.push("");
  lines.push("## Historical Activity Evidence");
  if (report.historicalActivityEvidence.length === 0) {
    lines.push("- none found");
  } else {
    for (const item of report.historicalActivityEvidence) {
      lines.push(`- ${item.displayName} (${item.activityId}): ${item.rating}, ${item.decision}, ${item.masteryValidity}`);
    }
  }
  lines.push("");
  lines.push("## Runs");
  for (const run of report.runs) {
    lines.push(`### ${run.childId} / ${run.evidenceState}`);
    lines.push(`- passed: ${run.passed ? "yes" : "no"}`);
    lines.push(`- board: ${run.boardSequence.join(" -> ")}`);
    lines.push(`- promptHash: ${run.promptHash}`);
    lines.push(`- inputHash: ${run.inputHash}`);
    for (const question of run.tutorQuestions) {
      lines.push(`- ${question.passed ? "PASS" : "FAIL"}: ${question.question} — ${question.evidence}`);
    }
    if (run.failures.length) {
      lines.push(`- failures: ${run.failures.join("; ")}`);
    }
  }
  lines.push("");
  lines.push("## Cross-Run Findings");
  for (const finding of report.crossRunFindings) lines.push(`- ${finding}`);
  if (report.failures.length) {
    lines.push("");
    lines.push("## Failures");
    for (const failure of report.failures) lines.push(`- ${failure}`);
  }
  return `${lines.join("\n")}\n`;
}

export async function runPlannerTutorLab(
  opts: RunPlannerTutorLabOptions = {},
): Promise<PlannerTutorLabReport> {
  const rootDir = opts.rootDir ?? process.cwd();
  const generatedAt = opts.generatedAt ?? new Date().toISOString();
  const labDir = path.join(rootDir, ".sunny-sandbox", "lab", "planner-tutor", safeStamp(generatedAt));
  const sourceFile = opts.sourceFile ?? DEFAULT_SOURCE_FILE;
  const children = opts.children?.length ? opts.children : DEFAULT_CHILDREN;
  const evidenceStates = opts.evidenceStates?.length ? opts.evidenceStates : DEFAULT_EVIDENCE_STATES;
  const maxCostUsd = opts.maxCostUsd ?? 10;
  const callTimeoutMs = opts.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
  const logger = opts.logger ?? console;
  const extractSource = opts.extractSource ?? extractAssignmentSource;
  const chartReader = opts.getChart ?? ((childId: string) => getChildChart(childId, { rootDir }));
  const planner = opts.planAssignment ?? (async (packet: AssignmentPlanningPacket, planOpts: AssignmentPlanningOptions) =>
    planAssignmentFromSourceWithTelemetry(packet, planOpts));

  fs.mkdirSync(labDir, { recursive: true });
  logger.log(`🎮 [planner-tutor-lab] [extract] source=${sourceFile}`);
  const extraction = await extractSource(sourceFile, {
    pageImageDir: path.join(labDir, "source-pages"),
  });
  const runs: PlannerTutorRunReport[] = [];
  let totalEstimatedCostUsd = 0;
  const failures: string[] = [];

  for (const childId of children) {
    for (const evidenceState of evidenceStates) {
      if (totalEstimatedCostUsd > maxCostUsd) {
        failures.push(`cost cap reached before ${childId}/${evidenceState}`);
        break;
      }
      const childChart = chartReader(childId, { rootDir });
      const packet = buildAssignmentPlanningPacket({
        childId,
        extraction,
        childChart,
        currentEvidenceSummary: evidenceStateSummaries[evidenceState],
      });
      logger.log(`🎮 [planner-tutor-lab] [plan-start] child=${childId} state=${evidenceState}`);
      let output: AssignmentPlannerOutput;
      let telemetry: AssignmentPlannerTelemetry | null;
      try {
        const result = await normalizePlanResult(await withTimeout(
          planner(packet, { model: opts.model }),
          callTimeoutMs,
          `${childId}:${evidenceState}`,
        ));
        output = result.output;
        telemetry = result.telemetry;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${childId}/${evidenceState} planner call failed: ${message}`);
        logger.log(`🎮 [planner-tutor-lab] [plan-failed] child=${childId} state=${evidenceState} error=${message}`);
        writeJson(path.join(labDir, `${childId}-${evidenceState}-error.json`), {
          childId,
          evidenceState,
          message,
          packetSummary: {
            sourceFile: packet.sourceDocument.filename,
            sourceHasPageImages: packet.sourceDocument.pages.some((page) => Boolean(page.imagePath)),
            childFacts: childFacts(packet),
            recentEvidence: [...packet.childChart.recentEvidence],
          },
        });
        continue;
      }
      const model = telemetry?.model ?? opts.model ?? "unknown";
      const estimatedCostUsd = estimateCostUsd(model, telemetry);
      totalEstimatedCostUsd = Number((totalEstimatedCostUsd + estimatedCostUsd).toFixed(4));
      const run = analyzePlannerTutorOutput({
        childId,
        evidenceState,
        packet,
        output,
        model,
        estimatedCostUsd,
        telemetry,
      });
      runs.push(run);
      logger.log(
        `🎮 [planner-tutor-lab] [plan-finish] child=${childId} state=${evidenceState} passed=${run.passed ? "yes" : "no"} cost=$${estimatedCostUsd.toFixed(4)}`,
      );
      writeJson(path.join(labDir, `${childId}-${evidenceState}-planner-output.json`), output);
      writeJson(path.join(labDir, `${childId}-${evidenceState}-packet-summary.json`), run.packetSummary);
    }
  }

  const cross = crossRunFindings(runs);
  failures.push(...cross.failures);
  failures.push(...runs.flatMap((run) => run.failures.map((failure) => `${run.childId}/${run.evidenceState}: ${failure}`)));
  if (totalEstimatedCostUsd > maxCostUsd) {
    failures.push(`estimated cost ${totalEstimatedCostUsd.toFixed(4)} exceeded cap ${maxCostUsd.toFixed(2)}`);
  }
  const report: PlannerTutorLabReport = {
    reportVersion: 1,
    generatedAt,
    labDir,
    sourceFile,
    children,
    evidenceStates,
    totalEstimatedCostUsd,
    maxCostUsd,
    historicalActivityEvidence: readHistoricalActivityEvidence(rootDir),
    runs,
    crossRunFindings: cross.findings,
    failures,
    proved: failures.length === 0,
  };
  writeJson(path.join(labDir, "planner-tutor-report.json"), report);
  fs.writeFileSync(path.join(labDir, "planner-tutor-report.md"), renderMarkdown(report), "utf8");
  return report;
}

function argValue(argv: string[], name: string): string | null {
  const eq = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1] ?? null;
  return null;
}

function parseList(value: string | null): string[] | undefined {
  if (!value) return undefined;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseEvidenceStates(value: string | null): PlannerTutorEvidenceState[] | undefined {
  const list = parseList(value);
  if (!list) return undefined;
  const allowed = new Set(DEFAULT_EVIDENCE_STATES);
  return list.filter((item): item is PlannerTutorEvidenceState => allowed.has(item as PlannerTutorEvidenceState));
}

export async function runPlannerTutorLabCli(argv = process.argv.slice(2)): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write([
      "usage: npm run sunny:lab:planner-tutor -- --file /path/to/assignment.pdf",
      "optional: --children ila,reina --states cold_start,partial_learning,strong_mastery,fatigue_or_boredom --max-cost-usd 10 --model claude-sonnet-4-6",
      "",
    ].join("\n"));
    return;
  }
  const sourceFile = argValue(argv, "file") ?? argValue(argv, "source") ?? DEFAULT_SOURCE_FILE;
  const maxCostUsd = Number(argValue(argv, "max-cost-usd") ?? "10");
  const callTimeoutMs = Number(argValue(argv, "call-timeout-ms") ?? String(DEFAULT_CALL_TIMEOUT_MS));
  const report = await runPlannerTutorLab({
    sourceFile: path.resolve(sourceFile),
    children: parseList(argValue(argv, "children") ?? argValue(argv, "child")),
    evidenceStates: parseEvidenceStates(argValue(argv, "states")),
    model: argValue(argv, "model") ?? undefined,
    maxCostUsd,
    callTimeoutMs,
  });
  console.log(`🎮 [planner-tutor-lab] [written] ${report.labDir}`);
  console.log(`🎮 [planner-tutor-lab] [cost] estimated=$${report.totalEstimatedCostUsd.toFixed(4)} cap=$${report.maxCostUsd.toFixed(2)}`);
  if (!report.proved) {
    console.log(`🎮 [planner-tutor-lab] [blocked] failures=${report.failures.length}`);
    process.exitCode = 1;
  } else {
    console.log("🎮 [planner-tutor-lab] [proved] planner behaved like a strong tutor");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runPlannerTutorLabCli().catch((error: unknown) => {
    console.error("🎮 [planner-tutor-lab] [failed]", error);
    process.exitCode = 1;
  });
}
