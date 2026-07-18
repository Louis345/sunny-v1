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

function parseExtraction(value: unknown): ReturnedWorkExtraction {
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  if (!Array.isArray(row.items) || row.items.length === 0) throw new Error("returned_work_items_missing");
  const items = row.items.map((entry, index): ConfirmedReturnedWorkItem => {
    const item = entry && typeof entry === "object" && !Array.isArray(entry)
      ? entry as Record<string, unknown>
      : {};
    const constructLinks = parseConstructLinks(item.constructLinks);
    if (!constructLinks.some((link) => link.role === "primary")) {
      throw new Error(`returned_work_primary_construct_missing:${index}`);
    }
    if (typeof item.prompt !== "string" || !item.prompt.trim()) throw new Error(`returned_work_prompt_missing:${index}`);
    const extractionConfidence = typeof item.extractionConfidence === "number" ? item.extractionConfidence : 0;
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
        { type: "text", text: `Extract factual grading from this returned assignment. Do not infer mastery. Preserve uncertainty in extractionConfidence. Map each item to one primary and optional secondary stable constructs. Prefer these existing IDs: ${JSON.stringify(input.knownConstructIds)}. Original assignment: ${JSON.stringify(input.assignment)}. File: ${input.filename}` },
      ],
    }],
    tools: [{ name: toolName, description: "Extract score, marked items, and construct links for caregiver review.", input_schema: { type: "object", additionalProperties: true } }],
    tool_choice: { type: "tool", name: toolName },
  }, { timeout: Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 120000) });
  const tool = response.content.find((block) => block.type === "tool_use" && block.name === toolName);
  if (!tool || tool.type !== "tool_use") throw new Error("returned_work_extraction_missing");
  return parseExtraction(tool.input);
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
  const extraction = opts.extract
    ? await opts.extract({ assignment: cycle.assignment, knownConstructIds: Object.keys(history.constructs), filename: input.filename, mimeType: input.mimeType, dataBase64: input.dataBase64 })
    : await extractWithPlanner({ assignment: cycle.assignment, knownConstructIds: Object.keys(history.constructs), filename: input.filename, mimeType: input.mimeType, dataBase64: input.dataBase64, client: opts.client, model: opts.model });
  const parsed = parseExtraction(extraction);
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
  const confirmed = parseExtraction({ score: input.score ?? draft.score, items: input.items ?? draft.items });
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
    return { cycle, interpretationStatus: "pending", reason: error instanceof Error ? error.message : String(error) };
  }
}
