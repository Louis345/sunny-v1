import "dotenv/config";
import fs from "fs";
import path from "path";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import type { HomeworkDomain } from "../context/schemas/learningProfile";
import { extractAssignmentSource } from "../engine/assignmentSourceExtraction";
import {
  buildAssignmentPlanningPacket,
  planAssignmentFromSource,
  summarizeAssignmentPlanForReview,
  validateAssignmentPlannerOutput,
  type AssignmentPlannerDialogueTurn,
  type AssignmentPlannerOutput,
  type AssignmentPlanningPacket,
  type AssignmentSourceExtraction,
} from "../engine/assignmentPlanner";
import { getChildChart, type ChildChart } from "../profiles/childChart";
import { resolveChildContextDir } from "../utils/contextRoot";

export type SunnyIngestDocumentType =
  | "homework"
  | "spelling_homework"
  | "graded_homework"
  | "iep_or_eval"
  | "teacher_note"
  | "admin_concern"
  | "tutor_note"
  | "parent_note"
  | "unknown";

export type SunnyIngestDestination =
  | "homework"
  | "graded_homework"
  | "child_profile"
  | "child_context"
  | "none";

export type SunnyPlannerHomeworkDraft = {
  domain: HomeworkDomain;
  title: string;
  testDate: string | null;
  testDateConfidence: number;
  targetGroups: Array<{
    id: string;
    label: string;
    purpose: string;
    targets: string[];
  }>;
  planSummary: string;
};

export type SunnyPlannerDraft = {
  draftId: string;
  childId: string;
  sourceFile: string;
  classification: {
    type: SunnyIngestDocumentType;
    confidence: number;
    evidence: string[];
  };
  interpretation: string;
  proposedDestination: SunnyIngestDestination;
  proposedHomework?: SunnyPlannerHomeworkDraft;
  assignmentSource?: AssignmentSourceExtraction;
  assignmentPlanningPacket?: AssignmentPlanningPacket;
  assignmentPlannerOutput?: AssignmentPlannerOutput;
  assignmentReviewSummary?: string;
  uncertainties: string[];
  humanReviewPrompt: string;
  humanEdits?: string[];
};

export type SunnyIngestHumanEdit =
  | { kind: "set_test_date"; testDate: string }
  | { kind: "add_parent_note"; note: string }
  | { kind: "reclassify"; documentType: SunnyIngestDocumentType; destination: SunnyIngestDestination };

export type SunnyIngestApplyOptions = {
  rootDir?: string;
  reviewer?: string;
  approvedAt?: string;
  finalAction?: "approved" | "cancelled";
  applyPlannedHomeworkIngest?: (args: {
    draft: SunnyPlannerDraft;
    rootDir: string;
    reviewer: string;
    approvedAt: string;
  }) => Promise<void>;
  runHomeworkIngest?: (argv: string[]) => Promise<void>;
};

export type SunnyIngestApplyResult = {
  applied: boolean;
  route: SunnyIngestDestination;
  writesTo: string[];
  reason?: string;
};

export type ReviseSunnyPlannerDraftOptions = {
  draft: SunnyPlannerDraft;
  parentNote: string;
  model?: string;
  createdAt?: string;
  planAssignment?: (packet: AssignmentPlanningPacket) => Promise<AssignmentPlannerOutput>;
};

export type SunnyIngestResolvedInputs = {
  childId: string;
  sourceFile: string;
  nonInteractive: boolean;
};

export type SunnyIngestPrompt = (prompt: string) => Promise<string>;

type Logger = Pick<typeof console, "log" | "error">;

const DOCUMENT_TYPES = new Set<SunnyIngestDocumentType>([
  "homework",
  "spelling_homework",
  "graded_homework",
  "iep_or_eval",
  "teacher_note",
  "admin_concern",
  "tutor_note",
  "parent_note",
  "unknown",
]);

const DESTINATIONS = new Set<SunnyIngestDestination>([
  "homework",
  "graded_homework",
  "child_profile",
  "child_context",
  "none",
]);

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

function normalizeChildId(raw: string): string {
  return raw.trim().toLowerCase();
}

function unquoteCliValue(raw: string): string {
  return raw.trim().replace(/^['"]|['"]$/g, "");
}

function validIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return Number.isFinite(Date.parse(`${value}T00:00:00.000Z`));
}

function decisionTraceFile(childId: string, createdAt: string, rootDir = process.cwd()): string {
  return path.join(
    resolveChildContextDir(childId, { rootDir }),
    "decision_traces",
    `${createdAt.slice(0, 10)}.ndjson`,
  );
}

function stableTraceId(draft: SunnyPlannerDraft, createdAt: string): string {
  const safeType = draft.classification.type.replace(/[^a-z0-9_-]+/gi, "_");
  return `sunny_ingest_${safeType}_${createdAt.replace(/[^0-9TZ]+/g, "").slice(0, 15)}`;
}

function assignmentIngestV1UnsupportedReason(route: SunnyIngestDestination): string {
  return `not_supported_assignment_ingest_v1:${route}:sunny ingest V1 is currently for assignment mastery only`;
}

async function promptLine(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    return await rl.question(prompt);
  } finally {
    rl.close();
  }
}

export async function resolveSunnyIngestInputs(
  argv: string[],
  ask: SunnyIngestPrompt = promptLine,
  cwd = process.cwd(),
): Promise<SunnyIngestResolvedInputs> {
  const nonInteractive = argv.includes("--non-interactive") || process.env.SUNNY_NON_INTERACTIVE === "true";
  let childRaw = readCliValue(argv, ["--child"]);
  let fileRaw = readCliValue(argv, ["--file", "--pdf"]);

  if (!childRaw?.trim()) {
    if (nonInteractive) throw new Error("Missing required --child=<childId>");
    childRaw = await ask("Child: ");
  }
  if (!fileRaw?.trim()) {
    if (nonInteractive) throw new Error("Missing required --file=<path>");
    fileRaw = await ask("Assignment file path: ");
  }
  if (!childRaw?.trim()) throw new Error("Missing required child id");
  if (!fileRaw?.trim()) throw new Error("Missing required assignment file path");

  return {
    childId: normalizeChildId(childRaw),
    sourceFile: path.resolve(cwd, unquoteCliValue(fileRaw)),
    nonInteractive,
  };
}

function homeworkDomainFromAssignmentOutput(output: AssignmentPlannerOutput): HomeworkDomain {
  const practiceDomain = output.capturedContent.contentProfile.practiceDomain;
  if (practiceDomain === "spelling" || practiceDomain === "reading" || practiceDomain === "math") {
    return practiceDomain;
  }
  if (output.capturedContent.contentProfile.contentDomain === "science") return "science";
  return "reading";
}

function documentTypeFromAssignmentOutput(output: AssignmentPlannerOutput): SunnyIngestDocumentType {
  return output.capturedContent.type === "spelling_test" ? "spelling_homework" : "homework";
}

function boardPlanSummary(output: AssignmentPlannerOutput): string {
  return output.activeSessionPlan.nodePlan
    .map((node) => `${node.activityId}${node.locked ? " (locked)" : ""}`)
    .join(" -> ");
}

export function buildSunnyDraftFromAssignmentPlan(args: {
  childId: string;
  sourceFile: string;
  output: AssignmentPlannerOutput;
  reviewSummary: string;
  assignmentSource?: AssignmentSourceExtraction;
  assignmentPlanningPacket?: AssignmentPlanningPacket;
}): SunnyPlannerDraft {
  const groups = args.output.assignmentInterpretation.wordGroups.length
    ? args.output.assignmentInterpretation.wordGroups
    : args.output.capturedContent.wordGroups ?? [];
  const evidence = [
    ...args.output.capturedContent.contentProfile.sourceEvidence,
    ...args.output.planTheory.evidenceSummary,
  ].filter(Boolean);
  const type = documentTypeFromAssignmentOutput(args.output);
  return {
    draftId: `assignment-${args.childId}-${Date.now()}`,
    childId: args.childId,
    sourceFile: args.sourceFile,
    classification: {
      type,
      confidence: args.output.activeSessionPlan.plannerConfidence ?? 0.9,
      evidence: evidence.length ? evidence : ["AI assignment planner read the source document."],
    },
    interpretation: [
      args.output.planTheory.hypothesis,
      "",
      args.reviewSummary,
    ].join("\n").trim(),
    proposedDestination: "homework",
    proposedHomework: {
      domain: homeworkDomainFromAssignmentOutput(args.output),
      title: args.output.capturedContent.title,
      testDate: args.output.activeSessionPlan.testDate ?? null,
      testDateConfidence: args.output.activeSessionPlan.testDate ? 0.9 : 0.1,
      targetGroups: groups.map((group) => ({
        id: group.id,
        label: group.label,
        purpose: group.purpose,
        targets: [...group.words],
      })),
      planSummary: boardPlanSummary(args.output),
    },
    assignmentSource: args.assignmentSource,
    assignmentPlanningPacket: args.assignmentPlanningPacket,
    assignmentPlannerOutput: args.output,
    assignmentReviewSummary: args.reviewSummary,
    uncertainties: [...args.output.reviewQuestions],
    humanReviewPrompt: "Approve, edit date, add a note, reclassify, revise plan, or cancel?",
  };
}

export async function buildSunnyPlannerDraft(args: {
  childId: string;
  sourceFile: string;
  extraction: AssignmentSourceExtraction;
  model?: string;
  childChart?: ChildChart;
  parentDialogue?: AssignmentPlannerDialogueTurn[];
  priorPlannerOutput?: AssignmentPlannerOutput;
  planAssignment?: (packet: AssignmentPlanningPacket) => Promise<AssignmentPlannerOutput>;
}): Promise<SunnyPlannerDraft> {
  const assignmentPacket = buildAssignmentPlanningPacket({
    childId: args.childId,
    extraction: args.extraction,
    childChart: args.childChart ?? getChildChart(args.childId),
    parentDialogue: args.parentDialogue,
    priorPlannerOutput: args.priorPlannerOutput,
  });
  const assignmentPlannerOutput = await (args.planAssignment ?? ((packet) =>
    planAssignmentFromSource(packet, { model: args.model })))(assignmentPacket);
  const issues = validateAssignmentPlannerOutput(assignmentPlannerOutput, {
    extraction: args.extraction,
    activityCatalog: assignmentPacket.activityCatalog,
  });
  const blockingIssues = issues.filter((issue) => issue.severity === "error");
  if (blockingIssues.length > 0) {
    throw new Error(
      [
        "sunny_ingest_assignment_plan_invalid",
        ...blockingIssues.map((issue) => `${issue.code}: ${issue.message}`),
      ].join("\n"),
    );
  }
  return buildSunnyDraftFromAssignmentPlan({
    childId: args.childId,
    sourceFile: args.sourceFile,
    output: assignmentPlannerOutput,
    reviewSummary: summarizeAssignmentPlanForReview(assignmentPlannerOutput),
    assignmentSource: args.extraction,
    assignmentPlanningPacket: assignmentPacket,
  });
}

export async function reviseSunnyPlannerDraft(
  opts: ReviseSunnyPlannerDraftOptions,
): Promise<SunnyPlannerDraft> {
  if (!opts.draft.assignmentSource || !opts.draft.assignmentPlanningPacket || !opts.draft.assignmentPlannerOutput) {
    throw new Error("sunny_ingest_revision_requires_assignment_planner_state");
  }
  const createdAt = opts.createdAt ?? new Date().toISOString();
  const parentDialogue: AssignmentPlannerDialogueTurn[] = [
    ...(opts.draft.assignmentPlanningPacket.parentDialogue ?? []),
    { role: "parent", message: opts.parentNote, createdAt },
  ];
  const revisionPacket: AssignmentPlanningPacket = {
    ...opts.draft.assignmentPlanningPacket,
    parentDialogue,
    priorPlannerOutput: opts.draft.assignmentPlannerOutput,
  };
  const assignmentPlannerOutput = await (opts.planAssignment ?? ((packet) =>
    planAssignmentFromSource(packet, { model: opts.model })))(revisionPacket);
  if (revisionPacket.activityCatalog.length > 0) {
    const issues = validateAssignmentPlannerOutput(assignmentPlannerOutput, {
      extraction: opts.draft.assignmentSource,
      activityCatalog: revisionPacket.activityCatalog,
    });
    const blockingIssues = issues.filter((issue) => issue.severity === "error");
    if (blockingIssues.length > 0) {
      throw new Error(
        [
          "sunny_ingest_assignment_plan_invalid",
          ...blockingIssues.map((issue) => `${issue.code}: ${issue.message}`),
        ].join("\n"),
      );
    }
  }
  const revised = buildSunnyDraftFromAssignmentPlan({
    childId: opts.draft.childId,
    sourceFile: opts.draft.sourceFile,
    output: assignmentPlannerOutput,
    reviewSummary: summarizeAssignmentPlanForReview(assignmentPlannerOutput),
    assignmentSource: opts.draft.assignmentSource,
    assignmentPlanningPacket: revisionPacket,
  });
  return {
    ...revised,
    humanEdits: [
      ...(opts.draft.humanEdits ?? []),
      `parent_note_replanned:${opts.parentNote}`,
    ],
  };
}

function plannerJourneyRationale(draft: SunnyPlannerDraft): string[] {
  const journeyLanguage = /\b(feel|journey|worksheet|alive|agency|choice|confidence|engag|bored|boring|worth|fun|variety|surprise|mystery|grind)\b/i;
  return draft.uncertainties
    .filter((item) => journeyLanguage.test(item))
    .slice(0, 3);
}

export function formatSunnyIngestInterpretation(draft: SunnyPlannerDraft): string {
  const type = draft.classification.type.replace(/_/g, " ");
  const lines = [
    `The planner thinks this is ${type}.`,
    `Confidence: ${Math.round(draft.classification.confidence * 100)}%`,
    `Destination: ${draft.proposedDestination}`,
    "",
    draft.interpretation,
  ];
  if (draft.classification.evidence.length) {
    lines.push("", "Evidence:");
    for (const item of draft.classification.evidence) lines.push(`- ${item}`);
  }
  if (draft.proposedHomework) {
    lines.push(
      "",
      `Homework: ${draft.proposedHomework.title}`,
      `Domain: ${draft.proposedHomework.domain}`,
      `test date: ${draft.proposedHomework.testDate ?? "unknown"}`,
      `Plan: ${draft.proposedHomework.planSummary}`,
    );
    if (draft.proposedHomework.targetGroups.length) {
      lines.push("Target groups:");
      for (const group of draft.proposedHomework.targetGroups) {
        lines.push(`- ${group.label} (${group.purpose}): ${group.targets.join(", ")}`);
      }
    }
    lines.push("", "Adventure proof:", `Board sequence: ${draft.proposedHomework.planSummary}`);
    const rationale = plannerJourneyRationale(draft);
    lines.push("Planner journey rationale:");
    if (rationale.length) {
      for (const item of rationale) lines.push(`- ${item}`);
    } else {
      lines.push("- The planner did not provide a child-facing journey rationale in this draft.");
    }
  }
  if (draft.uncertainties.length) {
    lines.push("", "Uncertainties:");
    for (const item of draft.uncertainties) lines.push(`- ${item}`);
  }
  lines.push("", draft.humanReviewPrompt);
  return lines.join("\n");
}

export function applyHumanIngestEdits(
  draft: SunnyPlannerDraft,
  edits: SunnyIngestHumanEdit[],
): SunnyPlannerDraft {
  let next: SunnyPlannerDraft = {
    ...draft,
    classification: { ...draft.classification, evidence: [...draft.classification.evidence] },
    proposedHomework: draft.proposedHomework
      ? {
          ...draft.proposedHomework,
          targetGroups: draft.proposedHomework.targetGroups.map((group) => ({
            ...group,
            targets: [...group.targets],
          })),
        }
      : undefined,
    assignmentPlannerOutput: draft.assignmentPlannerOutput
      ? {
          ...draft.assignmentPlannerOutput,
          activeSessionPlan: { ...draft.assignmentPlannerOutput.activeSessionPlan },
        }
      : undefined,
    uncertainties: [...draft.uncertainties],
    humanEdits: [...(draft.humanEdits ?? [])],
  };
  for (const edit of edits) {
    if (edit.kind === "set_test_date") {
      if (!validIsoDate(edit.testDate)) {
        throw new Error(`sunny_ingest_invalid_test_date:${edit.testDate}`);
      }
      next.proposedHomework = {
        ...(next.proposedHomework ?? {
          domain: "reading",
          title: "Untitled homework",
          testDateConfidence: 1,
          targetGroups: [],
          planSummary: "Human supplied date before homework planning.",
        }),
        testDate: edit.testDate,
        testDateConfidence: 1,
      };
      if (next.assignmentPlannerOutput) {
        next.assignmentPlannerOutput.activeSessionPlan.testDate = edit.testDate;
      }
      next.humanEdits!.push(`set_test_date:${edit.testDate}`);
    }
    if (edit.kind === "add_parent_note") {
      next.humanEdits!.push(`add_parent_note:${edit.note}`);
      next.uncertainties = [...next.uncertainties, `Parent note: ${edit.note}`];
    }
    if (edit.kind === "reclassify") {
      next = {
        ...next,
        classification: {
          ...next.classification,
          type: edit.documentType,
          confidence: 1,
          evidence: [...next.classification.evidence, "Human reclassified during Sunny Ingest review."],
        },
        proposedDestination: edit.destination,
      };
      next.humanEdits!.push(`reclassify:${edit.documentType}->${edit.destination}`);
    }
  }
  return next;
}

function appendSunnyIngestDecisionTrace(args: {
  draft: SunnyPlannerDraft;
  rootDir: string;
  createdAt: string;
  reviewer: string;
  route: SunnyIngestDestination;
  finalAction: "approved" | "cancelled";
  writesTo: string[];
  reason?: string;
}): void {
  const trace = {
    type: "sunny_ingest_decision",
    version: 1,
    traceId: stableTraceId(args.draft, args.createdAt),
    childId: args.draft.childId,
    createdAt: args.createdAt,
    reviewer: args.reviewer,
    plannerClassification: args.draft.classification.type,
    plannerConfidence: args.draft.classification.confidence,
    route: args.route,
    finalAction: args.finalAction,
    sourceFile: args.draft.sourceFile,
    interpretation: args.draft.interpretation,
    evidenceRead: args.draft.classification.evidence,
    proposedDestination: args.draft.proposedDestination,
    humanEdits: args.draft.humanEdits ?? [],
    ...(args.reason ? { reason: args.reason } : {}),
    writesTo: args.writesTo,
  };
  const file = decisionTraceFile(args.draft.childId, args.createdAt, args.rootDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(trace)}\n`, "utf8");
}

async function defaultHomeworkIngest(argv: string[]): Promise<void> {
  const { runIngestHomework } = await import("./ingestHomework");
  await runIngestHomework(argv);
}

async function defaultPlannedHomeworkIngest(args: {
  draft: SunnyPlannerDraft;
  rootDir: string;
  reviewer: string;
  approvedAt: string;
}): Promise<void> {
  if (!args.draft.assignmentPlannerOutput || !args.draft.assignmentSource || !args.draft.assignmentPlanningPacket) {
    throw new Error("sunny_ingest_missing_assignment_planner_output");
  }
  const { applyPlannedHomeworkIngest } = await import("./ingestHomework");
  const cwd = process.cwd();
  process.chdir(args.rootDir);
  try {
    await applyPlannedHomeworkIngest({
      childId: args.draft.childId,
      sourceFile: args.draft.sourceFile,
      assignmentSource: args.draft.assignmentSource,
      assignmentPlanningPacket: args.draft.assignmentPlanningPacket,
      assignmentPlannerOutput: args.draft.assignmentPlannerOutput,
      homeworkDomain: args.draft.proposedHomework?.domain,
      testDate: args.draft.proposedHomework?.testDate ?? null,
      approvedAt: args.approvedAt,
      reviewer: args.reviewer,
    });
  } finally {
    process.chdir(cwd);
  }
}

export async function applyApprovedSunnyIngestDraft(
  draft: SunnyPlannerDraft,
  opts: SunnyIngestApplyOptions = {},
): Promise<SunnyIngestApplyResult> {
  const rootDir = opts.rootDir ?? process.cwd();
  const reviewer = opts.reviewer ?? process.env.SUNNY_REVIEWER?.trim() ?? "parent";
  const approvedAt = opts.approvedAt ?? new Date().toISOString();
  const finalAction = opts.finalAction ?? "approved";
  const route = draft.proposedDestination;
  const writesTo: string[] = [];

  if (finalAction !== "approved") {
    return { applied: false, route, writesTo };
  }

  if (route !== "homework") {
    const reason = route === "none" ? undefined : assignmentIngestV1UnsupportedReason(route);
    appendSunnyIngestDecisionTrace({
      draft,
      rootDir,
      createdAt: approvedAt,
      reviewer,
      route,
      finalAction,
      writesTo,
      reason,
    });
    return { applied: false, route, writesTo, reason };
  }

  if (draft.assignmentPlannerOutput) {
    await (opts.applyPlannedHomeworkIngest ?? defaultPlannedHomeworkIngest)({
      draft,
      rootDir,
      reviewer,
      approvedAt,
    });
  } else {
    const argv = ["--child", draft.childId, "--file", draft.sourceFile];
    if (draft.proposedHomework?.domain) argv.push("--domain", draft.proposedHomework.domain);
    if (validIsoDate(draft.proposedHomework?.testDate)) argv.push("--testDate", draft.proposedHomework.testDate);
    await (opts.runHomeworkIngest ?? defaultHomeworkIngest)(argv);
  }
  writesTo.push("homework");
  appendSunnyIngestDecisionTrace({
    draft,
    rootDir,
    createdAt: approvedAt,
    reviewer,
    route,
    finalAction,
    writesTo,
  });
  return { applied: true, route, writesTo };
}

function parseDocumentType(value: string | undefined): SunnyIngestDocumentType {
  if (DOCUMENT_TYPES.has(value as SunnyIngestDocumentType)) return value as SunnyIngestDocumentType;
  throw new Error(`sunny_ingest_unknown_document_type:${value ?? ""}`);
}

function parseDestination(value: string | undefined): SunnyIngestDestination {
  if (DESTINATIONS.has(value as SunnyIngestDestination)) return value as SunnyIngestDestination;
  throw new Error(`sunny_ingest_unknown_destination:${value ?? ""}`);
}

async function reviewDraft(draft: SunnyPlannerDraft, logger: Logger): Promise<{
  draft: SunnyPlannerDraft;
  action: "approved" | "cancelled";
}> {
  let current = draft;
  for (let count = 0; count < 10; count += 1) {
    logger.log("");
    logger.log(formatSunnyIngestInterpretation(current));
    const answer = String(
      await promptLine("\nAction [approve/cancel/date YYYY-MM-DD/note .../reclassify TYPE DESTINATION]: "),
    ).trim();
    const lower = answer.toLowerCase();
    if (!lower || lower === "approve" || lower === "a" || lower === "yes" || lower === "y") {
      return { draft: current, action: "approved" };
    }
    if (lower === "cancel" || lower === "c" || lower === "no" || lower === "n") {
      return { draft: current, action: "cancelled" };
    }
    if (lower.startsWith("date ")) {
      current = applyHumanIngestEdits(current, [{ kind: "set_test_date", testDate: answer.slice(5).trim() }]);
      continue;
    }
    if (lower.startsWith("note ") || lower.startsWith("revise ")) {
      const parentNote = answer.slice(lower.startsWith("note ") ? 5 : 7).trim();
      logger.log("🎮 [sunny-ingest] [revise] sending parent note back to the assignment planner");
      current = await reviseSunnyPlannerDraft({ draft: current, parentNote });
      continue;
    }
    if (lower.startsWith("reclassify ")) {
      const [, typeRaw, destinationRaw] = answer.split(/\s+/);
      current = applyHumanIngestEdits(current, [{
        kind: "reclassify",
        documentType: parseDocumentType(typeRaw),
        destination: parseDestination(destinationRaw),
      }]);
      continue;
    }
    logger.log("I did not understand that action. Try approve, cancel, date YYYY-MM-DD, note ..., or reclassify TYPE DESTINATION.");
  }
  throw new Error("sunny_ingest_review_loop_exceeded");
}

export async function runSunnyIngest(argv: string[], logger: Logger = console): Promise<void> {
  const { childId, sourceFile, nonInteractive } = await resolveSunnyIngestInputs(argv);
  if (!fs.existsSync(sourceFile)) throw new Error(`Sunny ingest source file not found: ${sourceFile}`);

  logger.log(`🎮 [sunny-ingest] [extract] child=${childId} file=${path.basename(sourceFile)}`);
  const extraction = await extractAssignmentSource(sourceFile);
  logger.log(`🎮 [sunny-ingest] [planner] source=${extraction.sourceKind} method=${extraction.extractionMethod}`);
  const draft = await buildSunnyPlannerDraft({ childId, sourceFile, extraction });

  const reviewed = nonInteractive
    ? { draft, action: "cancelled" as const }
    : await reviewDraft(draft, logger);
  const result = await applyApprovedSunnyIngestDraft(reviewed.draft, {
    finalAction: reviewed.action,
  });
  logger.log(`🎮 [sunny-ingest] [${reviewed.action}] route=${result.route} applied=${result.applied}`);
}

if (typeof require !== "undefined" && require.main === module) {
  runSunnyIngest(process.argv.slice(2)).catch((err) => {
    console.error("🎮 [sunny-ingest] failed", err);
    process.exit(1);
  });
}
