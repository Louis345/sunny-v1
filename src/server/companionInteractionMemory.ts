import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { CompanionCareMemory, CompanionCarePlan } from "../shared/companionCareTypes";
import type {
  CompanionCallSource,
  CompanionRelationshipState,
  CompanionRewardContext,
  ShowroomVisualSnapshot,
} from "./companionShowroomTalk";
import { resolveChildContextDir } from "../utils/contextRoot";

const COMPANION_MEMORY_HAIKU_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_COMPACT_EVENT_THRESHOLD = 3;
const DEFAULT_COMPACT_CHARACTER_THRESHOLD = 1_800;
const MAX_LEDGER_TEXT_LENGTH = 1_500;
const MAX_MEMORY_FIELD_LENGTH = 360;
const MAX_MEMORY_LIST_ITEMS = 8;

export type CompanionInteractionEventInput = {
  childId: string;
  companionId: string;
  callSource: CompanionCallSource;
  relationshipState: CompanionRelationshipState;
  eventType: "companion_talk_completed";
  questionText: string;
  companionText: string;
  commandCount: number;
  visionUsed: boolean;
  visualSnapshot?: ShowroomVisualSnapshot;
  rewardContext?: CompanionRewardContext;
  createdAt?: string;
};

export type CompanionInteractionEventRecord = {
  type: "companion_interaction_event";
  version: 1;
  id: string;
  childId: string;
  companionId: string;
  callSource: CompanionCallSource;
  relationshipState: CompanionRelationshipState;
  eventType: "companion_talk_completed";
  questionText: string;
  companionText: string;
  commandCount: number;
  visionUsed: boolean;
  visual?: Omit<ShowroomVisualSnapshot, "base64">;
  rewardContext?: CompanionRewardContext;
  createdAt: string;
};

export type CompanionMemorySummaryPatch = Pick<
  CompanionCareMemory,
  | "lastSessionSummary"
  | "lastEmotionalMoment"
  | "reunionLineSeed"
  | "relationshipFacts"
  | "favoriteMoments"
  | "emotionalTone"
>;

export type CompanionInteractionSummarizer = (input: {
  childId: string;
  companionId: string;
  events: CompanionInteractionEventRecord[];
  existingMemory: CompanionCareMemory;
}) => Promise<CompanionMemorySummaryPatch>;

type CompanionInteractionMemoryOptions = {
  rootDir?: string;
};

type CompanionInteractionCompactionOptions = CompanionInteractionMemoryOptions & {
  summarize?: CompanionInteractionSummarizer;
  minEvents?: number;
  minCharacters?: number;
};

function normalizeId(value: string, fallback: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
  return normalized.replace(/^_+|_+$/g, "") || fallback;
}

function normalizeText(value: string, maxLength = MAX_LEDGER_TEXT_LENGTH): string {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeIso(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? new Date().toISOString() : date.toISOString();
}

function dayFromIso(value: string): string {
  return value.slice(0, 10);
}

function interactionDir(childId: string, opts: CompanionInteractionMemoryOptions = {}): string {
  return path.join(resolveChildContextDir(childId, { rootDir: opts.rootDir }), "companion_interactions");
}

function companionCarePath(
  childId: string,
  companionId: string,
  opts: CompanionInteractionMemoryOptions = {},
): string {
  return path.join(
    resolveChildContextDir(childId, { rootDir: opts.rootDir }),
    "companion_care",
    `${companionId}.json`,
  );
}

function hashRecordSeed(value: string): string {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readCarePlan(
  childId: string,
  companionId: string,
  opts: CompanionInteractionMemoryOptions = {},
): { plan: CompanionCarePlan; filePath: string } | null {
  const filePath = companionCarePath(childId, companionId, opts);
  if (!fs.existsSync(filePath)) return null;
  const plan = safeJsonParse<CompanionCarePlan>(fs.readFileSync(filePath, "utf8"));
  return plan ? { plan, filePath } : null;
}

function writeCarePlan(filePath: string, plan: CompanionCarePlan): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(plan, null, 2), "utf8");
}

function sanitizeMemoryField(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = normalizeText(value, MAX_MEMORY_FIELD_LENGTH);
  return trimmed || undefined;
}

function sanitizeMemoryList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => sanitizeMemoryField(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, MAX_MEMORY_LIST_ITEMS);
  return items.length ? items : undefined;
}

function sanitizeMemoryPatch(patch: CompanionMemorySummaryPatch): CompanionMemorySummaryPatch {
  return {
    ...(sanitizeMemoryField(patch.lastSessionSummary) && {
      lastSessionSummary: sanitizeMemoryField(patch.lastSessionSummary),
    }),
    ...(sanitizeMemoryField(patch.lastEmotionalMoment) && {
      lastEmotionalMoment: sanitizeMemoryField(patch.lastEmotionalMoment),
    }),
    ...(sanitizeMemoryField(patch.reunionLineSeed) && {
      reunionLineSeed: sanitizeMemoryField(patch.reunionLineSeed),
    }),
    ...(sanitizeMemoryList(patch.relationshipFacts) && {
      relationshipFacts: sanitizeMemoryList(patch.relationshipFacts),
    }),
    ...(sanitizeMemoryList(patch.favoriteMoments) && {
      favoriteMoments: sanitizeMemoryList(patch.favoriteMoments),
    }),
    ...(sanitizeMemoryField(patch.emotionalTone) && {
      emotionalTone: sanitizeMemoryField(patch.emotionalTone),
    }),
  };
}

export function recordCompanionInteractionEvent(
  input: CompanionInteractionEventInput,
  opts: CompanionInteractionMemoryOptions = {},
): { persisted: true; filePath: string; record: CompanionInteractionEventRecord } {
  const childId = normalizeId(input.childId, "showroom");
  const companionId = normalizeId(input.companionId, "companion");
  const createdAt = normalizeIso(input.createdAt);
  const record: CompanionInteractionEventRecord = {
    type: "companion_interaction_event",
    version: 1,
    id: `companion_interaction_${hashRecordSeed(
      `${childId}:${companionId}:${createdAt}:${input.questionText}:${input.commandCount}`,
    )}`,
    childId,
    companionId,
    callSource: input.callSource,
    relationshipState: input.relationshipState,
    eventType: input.eventType,
    questionText: normalizeText(input.questionText),
    companionText: normalizeText(input.companionText),
    commandCount: Math.max(0, Math.floor(Number(input.commandCount) || 0)),
    visionUsed: Boolean(input.visionUsed),
    ...(input.visualSnapshot && {
      visual: {
        mimeType: input.visualSnapshot.mimeType,
        reason: normalizeText(input.visualSnapshot.reason, 120),
        capturedAt: input.visualSnapshot.capturedAt,
        width: input.visualSnapshot.width,
        height: input.visualSnapshot.height,
      },
    }),
    ...(input.rewardContext && { rewardContext: input.rewardContext }),
    createdAt,
  };
  const dir = interactionDir(childId, opts);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${dayFromIso(createdAt)}.ndjson`);
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
  console.log(
    ` 🎮 [companion-memory] [ledger_append] [ok] child=${childId} companion=${companionId} source=${record.callSource} relation=${record.relationshipState}`,
  );
  return { persisted: true, filePath, record };
}

export function readCompanionInteractionEvents(
  childIdInput: string,
  companionIdInput: string,
  opts: CompanionInteractionMemoryOptions = {},
): CompanionInteractionEventRecord[] {
  const childId = normalizeId(childIdInput, "showroom");
  const companionId = normalizeId(companionIdInput, "companion");
  const dir = interactionDir(childId, opts);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".ndjson"))
    .sort()
    .flatMap((file) =>
      fs
        .readFileSync(path.join(dir, file), "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => safeJsonParse<CompanionInteractionEventRecord>(line))
        .filter((record): record is CompanionInteractionEventRecord =>
          Boolean(record && record.companionId === companionId),
        ),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function readCompanionCareMemoryForPrompt(
  childIdInput: string,
  companionIdInput: string,
  opts: CompanionInteractionMemoryOptions = {},
): CompanionCareMemory | undefined {
  const childId = normalizeId(childIdInput, "showroom");
  const companionId = normalizeId(companionIdInput, "companion");
  return readCarePlan(childId, companionId, opts)?.plan.memory;
}

function eventsAfterLastCompaction(
  events: CompanionInteractionEventRecord[],
  memory: CompanionCareMemory,
): CompanionInteractionEventRecord[] {
  const watermark = memory.lastCompanionInteractionCompactedAt;
  if (!watermark) return events;
  return events.filter((event) => event.createdAt > watermark);
}

function interactionCharacterCount(events: CompanionInteractionEventRecord[]): number {
  return events.reduce(
    (sum, event) => sum + event.questionText.length + event.companionText.length,
    0,
  );
}

function stripJsonFences(raw: string): string {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  return text;
}

function compactEventsForPrompt(events: CompanionInteractionEventRecord[]): unknown[] {
  return events.map((event) => ({
    createdAt: event.createdAt,
    callSource: event.callSource,
    relationshipState: event.relationshipState,
    questionText: event.questionText,
    companionText: event.companionText,
    commandCount: event.commandCount,
    visionUsed: event.visionUsed,
    rewardContext: event.rewardContext,
    visual: event.visual
      ? {
          reason: event.visual.reason,
          width: event.visual.width,
          height: event.visual.height,
        }
      : undefined,
  }));
}

async function summarizeCompanionInteractionsWithHaiku(input: {
  childId: string;
  companionId: string;
  events: CompanionInteractionEventRecord[];
  existingMemory: CompanionCareMemory;
}): Promise<CompanionMemorySummaryPatch> {
  const client = new Anthropic();
  const message = await client.messages.create({
    model: COMPANION_MEMORY_HAIKU_MODEL,
    max_tokens: 520,
    system:
      "You compact child-companion interaction logs into stable companion relationship memory. Do not invent facts. Do not include raw screenshots, base64, or private implementation details. Return JSON only.",
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          childId: input.childId,
          companionId: input.companionId,
          existingMemory: input.existingMemory,
          events: compactEventsForPrompt(input.events),
          outputShape: {
            lastSessionSummary: "one concise summary",
            lastEmotionalMoment: "one concise emotional moment",
            reunionLineSeed: "one short line seed for next call",
            relationshipFacts: ["stable facts to remember"],
            favoriteMoments: ["warm moments worth recalling"],
            emotionalTone: "few words",
          },
        }),
      },
    ],
  });
  const raw = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  const parsed = safeJsonParse<CompanionMemorySummaryPatch>(stripJsonFences(raw));
  if (!parsed) {
    throw new Error("companion_memory_compaction_invalid_json");
  }
  return parsed;
}

export async function maybeCompactCompanionInteractionMemory(
  input: { childId: string; companionId: string },
  opts: CompanionInteractionCompactionOptions = {},
): Promise<
  | { compacted: true; eventCount: number; filePath: string; memory: CompanionCareMemory }
  | { compacted: false; reason: string; eventCount: number }
> {
  const childId = normalizeId(input.childId, "showroom");
  const companionId = normalizeId(input.companionId, "companion");
  const care = readCarePlan(childId, companionId, opts);
  if (!care) {
    console.log(
      ` 🎮 [companion-memory] [compact_skip] [missing_care_plan] child=${childId} companion=${companionId}`,
    );
    return { compacted: false, reason: "missing_companion_care", eventCount: 0 };
  }
  const events = eventsAfterLastCompaction(
    readCompanionInteractionEvents(childId, companionId, opts),
    care.plan.memory,
  );
  const minEvents = opts.minEvents ?? DEFAULT_COMPACT_EVENT_THRESHOLD;
  const minCharacters = opts.minCharacters ?? DEFAULT_COMPACT_CHARACTER_THRESHOLD;
  const charCount = interactionCharacterCount(events);
  if (events.length < minEvents && charCount < minCharacters) {
    console.log(
      ` 🎮 [companion-memory] [compact_skip] [below_threshold] child=${childId} companion=${companionId} events=${events.length} chars=${charCount}`,
    );
    return { compacted: false, reason: "below_threshold", eventCount: events.length };
  }

  const summarize = opts.summarize ?? summarizeCompanionInteractionsWithHaiku;
  const patch = sanitizeMemoryPatch(
    await summarize({
      childId,
      companionId,
      events,
      existingMemory: care.plan.memory,
    }),
  );
  const latestEvent = events[events.length - 1];
  const nextMemory: CompanionCareMemory = {
    ...care.plan.memory,
    ...patch,
    lastCompanionInteractionCompactedAt: latestEvent.createdAt,
    lastCompanionInteractionId: latestEvent.id,
    interactionSummaryRevision: (care.plan.memory.interactionSummaryRevision ?? 0) + 1,
  };
  const nextPlan: CompanionCarePlan = {
    ...care.plan,
    memory: nextMemory,
    updatedAt: new Date().toISOString(),
  };
  writeCarePlan(care.filePath, nextPlan);
  console.log(
    ` 🎮 [companion-memory] [compact] [ok] child=${childId} companion=${companionId} events=${events.length}`,
  );
  return {
    compacted: true,
    eventCount: events.length,
    filePath: care.filePath,
    memory: nextMemory,
  };
}
