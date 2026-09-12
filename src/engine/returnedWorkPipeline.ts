import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveChildContextDir } from "../utils/contextRoot";
import {
  getLearningCycle,
  type LearningConstructLink,
  type LearningCycleRecordV2,
  type LearningEvidenceSourceRef,
} from "./learningCycleRepository";
import {
  buildLongitudinalLearningHistory,
  interpretReturnedWorkBatch,
  recordConfirmedReturnedWork,
  frozenSpellingWordMapping,
  type ConfirmedReturnedWorkItem,
  type TheoryDecisionContent,
} from "./longitudinalLearning";

export type ReturnedWorkExtraction = {
  score?: { earned: number; possible: number };
  items: ConfirmedReturnedWorkItem[];
};

export type ReturnedWorkAssignment = {
  homeworkId: string;
  title: string;
  domain: string;
  assignmentFingerprint: string;
};

export type AssignmentLearningReport = {
  childId: string;
  homeworkId: string;
  status: "awaiting_returned_work" | "awaiting_interpretation" | "interpreted";
  lifecycle: LearningCycleRecordV2["lifecycle"];
  assignment: { title: string; domain: string };
  source: LearningEvidenceSourceRef | null;
  assumptions: Array<LearningCycleRecordV2["assumptions"][number] & {
    assessment: NonNullable<LearningCycleRecordV2["decisionHistory"][number]["assumptionAssessments"]>[number] | null;
  }>;
  predictions: Array<LearningCycleRecordV2["academicPredictions"][number] & {
    evaluation: LearningCycleRecordV2["predictionEvaluations"][number] | null;
  }>;
  observations: LearningCycleRecordV2["observations"];
  latestDecision: null | {
    decisionId: string;
    status: LearningCycleRecordV2["decisionHistory"][number]["status"];
    reason: string;
    preserve: string[];
    change: string[];
    testNext: string[];
    nextEvidenceRequired: string[];
  };
};

export type ReturnedWorkDraft = ReturnedWorkExtraction & {
  childId: string;
  homeworkId: string;
  source: LearningEvidenceSourceRef;
  requiresConfirmation: true;
  createdAt: string;
};

type RootOptions = { rootDir?: string; now?: Date };

type CreateOptions = RootOptions & {
  extract?: (input: {
    assignment: LearningCycleRecordV2["assignment"];
    knownConstructIds: string[];
    spellingItems?: ReturnType<typeof frozenSpellingWordMapping>;
    filename: string;
    mimeType: string;
    dataBase64: string;
  }) => Promise<ReturnedWorkExtraction>;
  client?: Anthropic;
  model?: string;
};

type ConfirmOptions = RootOptions & {
  interpret?: (cycle: LearningCycleRecordV2, sourceId: string) => Promise<TheoryDecisionContent>;
  client?: Anthropic;
  model?: string;
};

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

function sha256(value: Buffer | string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safeFileName(filename: string): string {
  return path.basename(filename).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 160) || "returned-work";
}

function returnedWorkRoot(childId: string, rootDir?: string): string {
  return path.join(resolveChildContextDir(childId, { rootDir }), "homework", "returned-work");
}

function draftPath(childId: string, sourceId: string, rootDir?: string): string {
  return path.join(returnedWorkRoot(childId, rootDir), "pending", `${sourceId}.json`);
}

function writeJsonAtomic(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
}

function readDraft(childId: string, sourceId: string, rootDir?: string): ReturnedWorkDraft {
  const file = draftPath(childId, sourceId, rootDir);
  if (!fs.existsSync(file)) throw new Error(`returned_work_draft_missing:${sourceId}`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as ReturnedWorkDraft;
}

function canonicalCycles(childId: string, rootDir?: string): LearningCycleRecordV2[] {
  const dir = path.join(resolveChildContextDir(childId, { rootDir }), "homework", "cycles");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => getLearningCycle(childId, file.slice(0, -5), { rootDir }))
    .filter((cycle): cycle is LearningCycleRecordV2 => cycle != null);
}

export function listReturnedWorkAssignments(
  childIdRaw: string,
  opts: { rootDir?: string } = {},
): ReturnedWorkAssignment[] {
  const childId = childIdRaw.trim().toLowerCase();
  return canonicalCycles(childId, opts.rootDir)
    .map((cycle) => ({
      homeworkId: cycle.homeworkId,
      title: cycle.assignment.title,
      domain: cycle.domain,
      assignmentFingerprint: cycle.assignment.contentFingerprint,
    }))
    .sort((a, b) => b.homeworkId.localeCompare(a.homeworkId));
}

export function getAssignmentLearningReport(
  childIdRaw: string,
  homeworkId: string,
  opts: { rootDir?: string } = {},
): AssignmentLearningReport {
  const childId = childIdRaw.trim().toLowerCase();
  const cycle = getLearningCycle(childId, homeworkId, opts);
  if (!cycle) throw new Error(`learning_report_assignment_missing:${homeworkId}`);
  const source = cycle.evidenceSources
    .filter((item) => item.type === "graded_work" && item.status === "confirmed")
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
    .at(-1) ?? null;
  const evaluations = source ? cycle.predictionEvaluations.filter((item) => item.sourceId === source.sourceId) : [];
  const evaluationIds = new Set(evaluations.map((item) => item.evaluationId));
  const decision = source
    ? [...cycle.decisionHistory].reverse().find((item) =>
        item.eventType === "theory_decided" &&
        (item.predictionEvaluationIds ?? []).some((id) => evaluationIds.has(id))) ?? null
    : null;
  const assessments = new Map((decision?.assumptionAssessments ?? []).map((item) => [item.assumptionId, item]));
  const evaluationByPrediction = new Map(evaluations.map((item) => [item.predictionId, item]));
  return {
    childId,
    homeworkId,
    status: !source ? "awaiting_returned_work" : decision ? "interpreted" : "awaiting_interpretation",
    lifecycle: cycle.lifecycle,
    assignment: { title: cycle.assignment.title, domain: cycle.domain },
    source,
    assumptions: cycle.assumptions.map((item) => ({ ...item, assessment: assessments.get(item.assumptionId) ?? null })),
    predictions: cycle.academicPredictions.map((item) => ({ ...item, evaluation: evaluationByPrediction.get(item.predictionId) ?? null })),
    observations: source ? cycle.observations.filter((item) => item.sourceId === source.sourceId) : [],
    latestDecision: decision ? {
      decisionId: decision.decisionId,
      status: decision.status,
      reason: decision.reason,
      preserve: decision.preserve ?? [],
      change: decision.change ?? [],
      testNext: decision.testNext ?? [],
      nextEvidenceRequired: decision.nextEvidenceRequired ?? [],
    } : null,
  };
}

function parseConstructLinks(value: unknown): LearningConstructLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = entry && typeof entry === "object" && !Array.isArray(entry)
      ? entry as Record<string, unknown>
      : {};
    if (typeof row.constructId !== "string" || !/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/i.test(row.constructId)) return [];
    if (row.role !== "primary" && row.role !== "secondary") return [];
    const confidence = typeof row.confidence === "number" ? row.confidence : 0;
    if (confidence < 0 || confidence > 1) return [];
    return [{ constructId: row.constructId, role: row.role, confidence }];
  });
}

function normalizedConfidence(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  if (value.toLowerCase() === "high") return 0.9;
  if (value.toLowerCase() === "medium") return 0.65;
  if (value.toLowerCase() === "low") return 0.35;
  return 0;
}

function normalizeProviderItem(entry: unknown, index: number): Record<string, unknown> {
  const item = entry && typeof entry === "object" && !Array.isArray(entry)
    ? entry as Record<string, unknown>
    : {};
  if (Array.isArray(item.constructLinks)) return item;
  const confidence = normalizedConfidence(item.extractionConfidence);
  const constructLinks = [
    typeof item.primaryConstructId === "string"
      ? { constructId: item.primaryConstructId, role: "primary", confidence }
      : null,
    typeof item.secondaryConstructId === "string"
      ? { constructId: item.secondaryConstructId, role: "secondary", confidence }
      : null,
  ].filter(Boolean);
  const mark = typeof item.mark === "string" ? item.mark.trim().toLowerCase() : "";
  return {
    ...item,
    itemId: typeof item.itemId === "string" ? item.itemId : `item-${String(item.itemNumber ?? index + 1)}`,
    childResponse: item.childResponse ?? item.studentResponse,
    correct: typeof item.correct === "boolean" ? item.correct : mark === "correct" ? true : mark === "incorrect" ? false : undefined,
    extractionConfidence: confidence,
    constructLinks,
  };
}

export function parseReturnedWorkExtraction(value: unknown): ReturnedWorkExtraction {
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const providerItems = Array.isArray(row.items) ? row.items : row.markedItems;
  if (!Array.isArray(providerItems) || providerItems.length === 0) throw new Error("returned_work_items_missing");
  const items = providerItems.map((entry, index): ConfirmedReturnedWorkItem => {
    const item = normalizeProviderItem(entry, index);
    const constructLinks = parseConstructLinks(item.constructLinks);
    if (!constructLinks.some((link) => link.role === "primary")) {
      throw new Error(`returned_work_primary_construct_missing:${index}`);
    }
    if (typeof item.prompt !== "string" || !item.prompt.trim()) throw new Error(`returned_work_prompt_missing:${index}`);
    const extractionConfidence = normalizedConfidence(item.extractionConfidence);
    if (extractionConfidence < 0 || extractionConfidence > 1) throw new Error(`returned_work_confidence_invalid:${index}`);
    return {
      itemId: typeof item.itemId === "string" && item.itemId.trim() ? item.itemId : `item-${index + 1}`,
      prompt: item.prompt,
      ...(typeof item.childResponse === "string" ? { childResponse: item.childResponse } : {}),
      ...(typeof item.correct === "boolean" ? { correct: item.correct } : {}),
      ...(typeof item.teacherNote === "string" && item.teacherNote.trim() ? { teacherNote: item.teacherNote } : {}),
      ...(typeof item.observedErrorType === "string" && item.observedErrorType.trim()
        ? { observedErrorType: item.observedErrorType }
        : {}),
      extractionConfidence,
      constructLinks,
    };
  });
  const scoreRow = row.score && typeof row.score === "object" && !Array.isArray(row.score)
    ? row.score as Record<string, unknown>
    : null;
  const score = scoreRow && typeof scoreRow.earned === "number" && typeof scoreRow.possible === "number" && scoreRow.possible > 0
    ? { earned: scoreRow.earned, possible: scoreRow.possible }
    : undefined;
  return { ...(score ? { score } : {}), items };
}

async function extractWithPlanner(input: {
  assignment: LearningCycleRecordV2["assignment"];
  knownConstructIds: string[];
  spellingItems?: ReturnType<typeof frozenSpellingWordMapping>;
  filename: string;
  mimeType: string;
  dataBase64: string;
  client?: Anthropic;
  model?: string;
}): Promise<ReturnedWorkExtraction> {
  const client = input.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const toolName = "extract_returned_graded_work";
  const media = input.mimeType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: input.dataBase64 } }
    : { type: "image", source: { type: "base64", media_type: input.mimeType, data: input.dataBase64 } };
  const response = await client.messages.create({
    model: input.model ?? process.env.SUNNY_INGEST_MODEL ?? "claude-sonnet-5",
    max_tokens: 3500,
    messages: [{
      role: "user",
      content: [
        media as never,
        { type: "text", text: `Extract factual grading from this returned assignment. Do not infer mastery. Preserve uncertainty in extractionConfidence. Map each item to one primary and optional secondary stable constructs. Prefer these existing IDs: ${JSON.stringify(input.knownConstructIds)}. Original assignment: ${JSON.stringify(input.assignment)}. File: ${input.filename}${input.spellingItems ? ` Frozen spelling mapping: ${JSON.stringify(input.spellingItems)}. For spelling, prompt must be the exact assigned target word, not the child's response. Use only that word's primary constructId. An uncertain match must remain uncertain for confirmation; never guess a hash.` : ""}` },
      ],
    }],
    tools: [{
      name: toolName,
      description: "Extract score, marked items, and construct links for caregiver review.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["items"],
        properties: {
          score: {
            type: "object",
            additionalProperties: false,
            required: ["earned", "possible"],
            properties: { earned: { type: "number" }, possible: { type: "number" } },
          },
          items: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["itemId", "prompt", "extractionConfidence", "constructLinks"],
              properties: {
                itemId: { type: "string" },
                prompt: { type: "string" },
                childResponse: { type: "string" },
                correct: { type: "boolean" },
                teacherNote: { type: "string" },
                observedErrorType: { type: "string" },
                extractionConfidence: { type: "number", minimum: 0, maximum: 1 },
                constructLinks: {
                  type: "array",
                  minItems: 1,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["constructId", "role", "confidence"],
                    properties: {
                      constructId: { type: "string" },
                      role: { type: "string", enum: ["primary", "secondary"] },
                      confidence: { type: "number", minimum: 0, maximum: 1 },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }],
    tool_choice: { type: "tool", name: toolName },
  }, { timeout: Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 120000) });
  const tool = response.content.find((block) => block.type === "tool_use" && block.name === toolName);
  if (!tool || tool.type !== "tool_use") throw new Error("returned_work_extraction_missing");
  return parseReturnedWorkExtraction(tool.input);
}

export async function createReturnedWorkDraft(input: {
  childId: string;
  homeworkId: string;
  filename: string;
  mimeType: string;
  dataBase64: string;
}, opts: CreateOptions = {}): Promise<ReturnedWorkDraft> {
  const childId = input.childId.trim().toLowerCase();
  const cycle = getLearningCycle(childId, input.homeworkId, { rootDir: opts.rootDir });
  if (!cycle) throw new Error(`learning_cycle_missing:${input.homeworkId}`);
  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) throw new Error(`returned_work_mime_unsupported:${input.mimeType}`);
  const bytes = Buffer.from(input.dataBase64, "base64");
  if (bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES) throw new Error("returned_work_file_size_invalid");
  const fileFingerprint = sha256(bytes);
  const sourceId = `returned-work:${sha256(`${childId}:${input.homeworkId}:${fileFingerprint}`).slice(0, 20)}`;
  const existingFile = draftPath(childId, sourceId, opts.rootDir);
  if (fs.existsSync(existingFile)) return readDraft(childId, sourceId, opts.rootDir);
  const capturedAt = (opts.now ?? new Date()).toISOString();
  const sourceDir = path.join(returnedWorkRoot(childId, opts.rootDir), "sources", sourceId.replace(/:/g, "-"));
  const sourceFile = path.join(sourceDir, safeFileName(input.filename));
  fs.mkdirSync(sourceDir, { recursive: true });
  if (!fs.existsSync(sourceFile)) fs.writeFileSync(sourceFile, bytes, { flag: "wx" });
  const history = buildLongitudinalLearningHistory(childId, { rootDir: opts.rootDir });
  const spellingItems = frozenSpellingWordMapping(cycle);
  const extraction = opts.extract
    ? await opts.extract({ assignment: cycle.assignment, knownConstructIds: Object.keys(history.constructs), spellingItems, filename: input.filename, mimeType: input.mimeType, dataBase64: input.dataBase64 })
    : await extractWithPlanner({ assignment: cycle.assignment, knownConstructIds: Object.keys(history.constructs), spellingItems, filename: input.filename, mimeType: input.mimeType, dataBase64: input.dataBase64, client: opts.client, model: opts.model });
  const parsed = parseReturnedWorkExtraction(extraction);
  const source: LearningEvidenceSourceRef = {
    sourceId,
    type: "graded_work",
    fileFingerprint,
    sourceFile,
    capturedAt,
    provenance: "caregiver",
    assignmentLink: { homeworkId: input.homeworkId, method: "explicit_selection", confidence: 1 },
    status: "pending_confirmation",
  };
  const draft: ReturnedWorkDraft = {
    childId,
    homeworkId: input.homeworkId,
    source,
    ...parsed,
    requiresConfirmation: true,
    createdAt: capturedAt,
  };
  writeJsonAtomic(existingFile, draft);
  return draft;
}

export async function confirmReturnedWorkDraft(input: {
  childId: string;
  homeworkId: string;
  sourceId: string;
  score?: { earned: number; possible: number };
  items?: ConfirmedReturnedWorkItem[];
}, opts: ConfirmOptions = {}): Promise<{
  cycle: LearningCycleRecordV2;
  interpretationStatus: "interpreted" | "already_interpreted" | "pending";
  reason: string;
}> {
  const childId = input.childId.trim().toLowerCase();
  const draft = readDraft(childId, input.sourceId, opts.rootDir);
  if (draft.homeworkId !== input.homeworkId) throw new Error("returned_work_assignment_link_mismatch");
  const confirmedSource: LearningEvidenceSourceRef = {
    ...draft.source,
    status: "confirmed",
    assignmentLink: { ...draft.source.assignmentLink, confirmedBy: "caregiver" },
  };
  const confirmed = parseReturnedWorkExtraction({ score: input.score ?? draft.score, items: input.items ?? draft.items });
  const confirmedItems = confirmed.items;
  let cycle = recordConfirmedReturnedWork({
    childId,
    homeworkId: input.homeworkId,
    source: confirmedSource,
    ...(confirmed.score ? { score: confirmed.score } : {}),
    items: confirmedItems,
  }, { rootDir: opts.rootDir, now: opts.now });
  writeJsonAtomic(draftPath(childId, input.sourceId, opts.rootDir), { ...draft, source: confirmedSource, items: confirmedItems, ...(confirmed.score ? { score: confirmed.score } : {}) });
  try {
    const interpretation = await interpretReturnedWorkBatch({
      childId,
      homeworkId: input.homeworkId,
      sourceId: input.sourceId,
      rootDir: opts.rootDir,
      now: opts.now,
      interpret: opts.interpret,
      client: opts.client,
      model: opts.model,
    });
    cycle = interpretation.cycle;
    return {
      cycle,
      interpretationStatus: interpretation.reason === "already_interpreted" ? "already_interpreted" : "interpreted",
      reason: interpretation.reason,
    };
  } catch (error) {
    console.warn(" 🎮 [returned-work] [interpretation] [pending]", error instanceof Error ? error.message : String(error));
    return { cycle, interpretationStatus: "pending", reason: error instanceof Error ? error.message : String(error) };
  }
}
