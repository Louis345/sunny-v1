import { readLivingProfile, recordLivingFactsFromCall, type ProposedChildFact } from "./livingProfileFacts";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { CompanionCareMemory, CompanionCarePlan, CompanionChildGivenName } from "../shared/companionCareTypes";
import type {
  CompanionCallSource,
  CompanionRelationshipState,
  CompanionRewardContext,
  ShowroomVisualSnapshot,
} from "./companionShowroomTalk";
import { resolveChildContextDir } from "../utils/contextRoot";
import { requestForModel } from "../engine/plannerTransport";

const COMPANION_MEMORY_HAIKU_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_COMPACT_EVENT_THRESHOLD = 3;
const DEFAULT_COMPACT_CHARACTER_THRESHOLD = 1_800;
const MAX_LEDGER_TEXT_LENGTH = 1_500;
const MAX_MEMORY_FIELD_LENGTH = 360;
const MAX_MEMORY_LIST_ITEMS = 8;
const COMPANION_MEMORY_SUMMARY_TOOL = "save_companion_memory_summary";

export type CompanionInteractionEventType =
  | "companion_talk_completed"
  | "companion_activity_completed";

/**
 * Game beats are driven by machine-authored prompts ("You are about to place
 * your O on square 5"), which must never be filed as something the child said.
 * They ride here instead, so memory is built from real conversation.
 */
export type CompanionInteractionActivityContext = {
  activityId: string;
  eventType: string;
  result?: "child_win" | "companion_win" | "draw";
  machinePrompt?: string;
};

export type CompanionInteractionEventInput = {
  childId: string;
  companionId: string;
  callSource: CompanionCallSource;
  relationshipState: CompanionRelationshipState;
  eventType: CompanionInteractionEventType;
  questionText: string;
  companionText: string;
  commandCount: number;
  visionUsed: boolean;
  visualSnapshot?: ShowroomVisualSnapshot;
  rewardContext?: CompanionRewardContext;
  activityContext?: CompanionInteractionActivityContext;
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
  eventType: CompanionInteractionEventType;
  questionText: string;
  companionText: string;
  commandCount: number;
  visionUsed: boolean;
  visual?: Omit<ShowroomVisualSnapshot, "base64">;
  rewardContext?: CompanionRewardContext;
  activityContext?: CompanionInteractionActivityContext;
  createdAt: string;
};

export type CompanionMemorySummaryPatch = Pick<
  CompanionCareMemory,
  | "lastSessionSummary"
  | "lastEmotionalMoment"
  | "relationshipFacts"
  | "favoriteMoments"
  | "rivalryNote"
  | "companionSelfNotes"
>;

export type CompanionInteractionSummarizer = (input: {
  childId: string;
  companionId: string;
  events: CompanionInteractionEventRecord[];
  existingMemory: CompanionCareMemory;
}) => Promise<CompanionMemorySummaryPatch & { childFacts?: ProposedChildFact[] }>;

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

/**
 * Where a companion's memory of a child lives (2026-11-10). The child's own companion keeps it inside her care plan;
 * any other companion she calls (Hikari on FaceTime) keeps it in a relationship file that holds memory only — never
 * coins or vitals, so a second companion can never fork her one coin balance.
 */
type CompanionRelationship = {
  memory: CompanionCareMemory;
  filePath: string;
  save: (memory: CompanionCareMemory) => void;
};

export function companionRelationshipPath(
  childId: string,
  companionId: string,
  opts: CompanionInteractionMemoryOptions = {},
): string {
  return path.join(
    resolveChildContextDir(childId, { rootDir: opts.rootDir }),
    "companion_relationships",
    `${companionId}.json`,
  );
}

type CompanionRelationshipFile = {
  version: 1;
  childId: string;
  companionId: string;
  memory: CompanionCareMemory;
  updatedAt: string;
};

function writeJsonFile(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

/** Only memory is replaced, against the file as it is now: a slow summary never rolls back coins earned meanwhile. */
function saveMemoryInto(filePath: string, memory: CompanionCareMemory): void {
  const current = fs.existsSync(filePath)
    ? safeJsonParse<Record<string, unknown>>(fs.readFileSync(filePath, "utf8"))
    : null;
  if (!current) throw new Error(`companion_memory_file_unreadable:${filePath}`);
  writeJsonFile(filePath, { ...current, memory, updatedAt: new Date().toISOString() });
}

function readRelationship(
  childId: string,
  companionId: string,
  opts: CompanionInteractionMemoryOptions = {},
): CompanionRelationship | null {
  const carePath = companionCarePath(childId, companionId, opts);
  const plan = fs.existsSync(carePath)
    ? safeJsonParse<CompanionCarePlan>(fs.readFileSync(carePath, "utf8"))
    : null;
  if (plan) {
    return {
      memory: plan.memory,
      filePath: carePath,
      save: (memory) => saveMemoryInto(carePath, memory),
    };
  }
  const relationPath = companionRelationshipPath(childId, companionId, opts);
  const file = fs.existsSync(relationPath)
    ? safeJsonParse<CompanionRelationshipFile>(fs.readFileSync(relationPath, "utf8"))
    : null;
  if (!file?.memory) return null;
  return {
    memory: file.memory,
    filePath: relationPath,
    save: (memory) => saveMemoryInto(relationPath, memory),
  };
}

/** First contact creates the relationship; a companion never meets a child without remembering it. */
export function ensureCompanionRelationship(
  childIdInput: string,
  companionIdInput: string,
  opts: CompanionInteractionMemoryOptions & { nowIso?: string } = {},
): CompanionRelationship & { created: boolean } {
  const childId = normalizeId(childIdInput, "showroom");
  const companionId = normalizeId(companionIdInput, "companion");
  const existing = readRelationship(childId, companionId, opts);
  if (existing) return { ...existing, created: false };
  const nowIso = normalizeIso(opts.nowIso);
  const file: CompanionRelationshipFile = {
    version: 1,
    childId,
    companionId,
    memory: { firstMetAt: nowIso },
    updatedAt: nowIso,
  };
  const filePath = companionRelationshipPath(childId, companionId, opts);
  writeJsonFile(filePath, file);
  console.log(
    ` 🎮 [companion-memory] [relationship_created] [ok] child=${childId} companion=${companionId}`,
  );
  const created = readRelationship(childId, companionId, opts);
  if (!created) throw new Error(`companion_relationship_unreadable:${filePath}`);
  return { ...created, created: true };
}

function sanitizeMemoryField(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = normalizeText(value, MAX_MEMORY_FIELD_LENGTH);
  return trimmed || undefined;
}

export function applyCompanionGameResult(
  record: CompanionCareMemory["gameRecord"],
  input: { activityId: string; result: "child_win" | "companion_win" | "draw"; at?: string },
): NonNullable<CompanionCareMemory["gameRecord"]> {
  const activityId = normalizeText(input.activityId, 60) || "unknown";
  const next = { ...(record ?? {}) };
  const previous = next[activityId] ?? {
    played: 0,
    childWins: 0,
    companionWins: 0,
    draws: 0,
    lastPlayedAt: "",
    currentStreak: 0,
  };
  // Positive streak = consecutive child wins, negative = companion wins.
  const currentStreak =
    input.result === "child_win"
      ? Math.max(0, previous.currentStreak) + 1
      : input.result === "companion_win"
        ? Math.min(0, previous.currentStreak) - 1
        : 0;
  next[activityId] = {
    played: previous.played + 1,
    childWins: previous.childWins + (input.result === "child_win" ? 1 : 0),
    companionWins: previous.companionWins + (input.result === "companion_win" ? 1 : 0),
    draws: previous.draws + (input.result === "draw" ? 1 : 0),
    lastPlayedAt: normalizeIso(input.at),
    currentStreak,
  };
  return next;
}

/**
 * Records a finished round straight into companion memory. Deliberately plain
 * arithmetic: a model must never be the thing that counts a child's wins.
 */
export function recordCompanionGameResult(
  input: {
    childId: string;
    companionId: string;
    activityId: string;
    result: "child_win" | "companion_win" | "draw";
    at?: string;
  },
  opts: CompanionInteractionMemoryOptions = {},
): { recorded: boolean; reason?: string } {
  const childId = normalizeId(input.childId, "showroom");
  const companionId = normalizeId(input.companionId, "companion");
  const relationship = ensureCompanionRelationship(childId, companionId, opts);
  const gameRecord = applyCompanionGameResult(relationship.memory.gameRecord, {
    activityId: input.activityId,
    result: input.result,
    at: input.at,
  });
  relationship.save({ ...relationship.memory, gameRecord });
  return { recorded: true };
}

const MAX_CHILD_GIVEN_NAMES = 5;

/**
 * Keeps a nickname or role the child gave her companion. The companion decides when she has given one (its own tool
 * call); code only stores it, newest last, without duplicates.
 */
export function recordChildGivenCompanionName(
  input: { childId: string; companionId: string; name: unknown; kind: unknown; childWords?: unknown; at?: string },
  opts: CompanionInteractionMemoryOptions = {},
): { recorded: true; entry: CompanionChildGivenName } | { recorded: false; reason: string } {
  const name = typeof input.name === "string" ? normalizeText(input.name, 60) : "";
  if (!name) return { recorded: false, reason: "empty_name" };
  const kind = input.kind === "role" ? "role" : "nickname";
  const childWords = typeof input.childWords === "string" ? normalizeText(input.childWords, 200) : "";
  const entry: CompanionChildGivenName = {
    name,
    kind,
    ...(childWords && { childWords }),
    givenAt: normalizeIso(input.at),
  };
  const relationship = ensureCompanionRelationship(input.childId, input.companionId, opts);
  const kept = (relationship.memory.childGivenNames ?? []).filter(
    (row) => row.name.toLowerCase() !== name.toLowerCase(),
  );
  relationship.save({
    ...relationship.memory,
    childGivenNames: [...kept, entry].slice(-MAX_CHILD_GIVEN_NAMES),
  });
  console.log(
    ` 🎮 [companion-memory] [child_given_name] [ok] child=${input.childId} companion=${input.companionId} kind=${kind} name="${name}"`,
  );
  return { recorded: true, entry };
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
    ...(sanitizeMemoryList(patch.relationshipFacts) && {
      relationshipFacts: sanitizeMemoryList(patch.relationshipFacts),
    }),
    ...(sanitizeMemoryList(patch.favoriteMoments) && {
      favoriteMoments: sanitizeMemoryList(patch.favoriteMoments),
    }),
    ...(sanitizeMemoryField(patch.rivalryNote) && {
      rivalryNote: sanitizeMemoryField(patch.rivalryNote),
    }),
    ...(sanitizeMemoryList(patch.companionSelfNotes) && {
      companionSelfNotes: sanitizeMemoryList(patch.companionSelfNotes)?.slice(0, 3),
    }),
    // gameRecord and childGivenNames are deliberately absent: the model may read them but never write them, so a
    // summarizer can never rewrite a child's win/loss history or the names she gave her companion.
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
    // A machine-authored game prompt is never "what the child said".
    questionText: input.activityContext ? "" : normalizeText(input.questionText),
    companionText: normalizeText(input.companionText),
    ...(input.activityContext && {
      activityContext: {
        activityId: normalizeText(input.activityContext.activityId, 60),
        eventType: normalizeText(input.activityContext.eventType, 60),
        ...(input.activityContext.result && { result: input.activityContext.result }),
        ...(input.activityContext.machinePrompt && {
          machinePrompt: normalizeText(input.activityContext.machinePrompt, 200),
        }),
      },
    }),
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
  companionIdInput: string | null,
  opts: CompanionInteractionMemoryOptions = {},
): CompanionInteractionEventRecord[] {
  const childId = normalizeId(childIdInput, "showroom");
  // null: every companion's calls with her (shared recall).
  const companionId = companionIdInput === null ? null : normalizeId(companionIdInput, "companion");
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
          Boolean(record && (companionId === null || record.companionId === companionId)),
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
  return readRelationship(childId, companionId, opts)?.memory;
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

export function readCompanionMemorySummaryToolResult(
  content: ReadonlyArray<{ type: string; name?: string; input?: unknown; text?: string }>,
): CompanionMemorySummaryPatch {
  const result = content.find(
    (block) => block.type === "tool_use" && block.name === COMPANION_MEMORY_SUMMARY_TOOL,
  );
  if (!result?.input || typeof result.input !== "object" || Array.isArray(result.input)) {
    throw new Error("companion_memory_compaction_missing_tool_result");
  }
  return result.input as CompanionMemorySummaryPatch;
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
    activityContext: event.activityContext,
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
}): Promise<CompanionMemorySummaryPatch & { childFacts?: ProposedChildFact[] }> {
  const client = new Anthropic();
  const message = await client.messages.create(requestForModel({
    model: COMPANION_MEMORY_HAIKU_MODEL,
    max_tokens: 900,
    system:
      "You compact child-companion interaction logs into stable companion relationship memory. Do not invent facts. Do not include raw screenshots, base64, or private implementation details. " +
      "Events with an activityContext are game beats: the child did not speak those words, so never attribute them to the child. " +
      "gameRecord is the authoritative win/loss history, counted by the app: never state, imply, or recompute a tally that disagrees with it, and never guess a record when it is absent. " +
      "childFacts: things the child said about herself in questionText (likes, dislikes, school, friends, family, feelings, health, things that happened). quote must be her exact words copied from one questionText. Set speaker to someone_else when the words were clearly said by someone else (an adult, her sister, talking about her). Reuse a topic name from knownTopics when it is the same subject. Leave childFacts empty when she said nothing about herself. " +
      `Call ${COMPANION_MEMORY_SUMMARY_TOOL} exactly once.`,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          childId: input.childId,
          companionId: input.companionId,
          existingMemory: input.existingMemory,
          gameRecord: input.existingMemory.gameRecord ?? {},
          knownTopics: (readLivingProfile(input.childId)?.current ?? []).map((fact) => fact.topic),
          events: compactEventsForPrompt(input.events),
          outputShape: {
            lastSessionSummary: "one concise summary",
            lastEmotionalMoment: "one concise emotional moment",
            rivalryNote:
              "one short line about the games they play, consistent with gameRecord; omit if no games played",
            companionSelfNotes: [
              "up to 3 short traits the companion has shown through real interaction",
            ],
            relationshipFacts: ["stable facts to remember"],
            favoriteMoments: ["warm moments worth recalling"],
          },
        }),
      },
    ],
    tools: [{
      name: COMPANION_MEMORY_SUMMARY_TOOL,
      description: "Save one evidence-grounded companion relationship memory summary.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          lastSessionSummary: { type: "string" },
          lastEmotionalMoment: { type: "string" },
          rivalryNote: { type: "string" },
          companionSelfNotes: { type: "array", maxItems: 3, items: { type: "string" } },
          relationshipFacts: { type: "array", maxItems: 8, items: { type: "string" } },
          favoriteMoments: { type: "array", maxItems: 8, items: { type: "string" } },
          childFacts: { type: "array", maxItems: 6, items: { type: "object", additionalProperties: false,
            properties: { topic: { type: "string" }, kind: { type: "string", enum: ["like", "dislike", "life_event", "school", "friends", "family", "feeling", "health", "other"] },
              statement: { type: "string" }, quote: { type: "string" }, speaker: { type: "string", enum: ["child", "someone_else"] } },
            required: ["topic", "kind", "statement", "quote", "speaker"] } },
        },
        required: [
          "lastSessionSummary",
          "lastEmotionalMoment",
          "companionSelfNotes",
          "relationshipFacts",
          "favoriteMoments",
        ],
      },
    }],
    tool_choice: { type: "tool", name: COMPANION_MEMORY_SUMMARY_TOOL },
  }));
  try {
    return readCompanionMemorySummaryToolResult(message.content);
  } catch (error) {
    console.error(
      ` 🎮 [companion-memory] [compact-provider] [invalid] stop=${message.stop_reason ?? "unknown"} blocks=${message.content.map((block) => block.type).join(",")}`,
    );
    throw error;
  }
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
  const relationship = ensureCompanionRelationship(childId, companionId, opts);
  const events = eventsAfterLastCompaction(
    readCompanionInteractionEvents(childId, companionId, opts),
    relationship.memory,
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
  // Old records remain intact; prospective dialogue is not evidence for a new summary.
  const { reunionLineSeed: _seed, emotionalTone: _tone, ...existingMemory } = relationship.memory;
  const summary = await summarize({
    childId,
    companionId,
    events,
    existingMemory,
  });
  const patch = sanitizeMemoryPatch(summary);
  const latestEvent = events[events.length - 1];
  const nextMemory: CompanionCareMemory = {
    ...relationship.memory,
    ...patch,
    lastCompanionInteractionCompactedAt: latestEvent.createdAt,
    lastCompanionInteractionId: latestEvent.id,
    interactionSummaryRevision: (relationship.memory.interactionSummaryRevision ?? 0) + 1,
  };
  relationship.save(nextMemory);
  // Her living profile: facts she shared, kept only when her own words in this call carry them.
  recordLivingFactsFromCall({ childId, companionId, events, proposed: summary.childFacts });
  console.log(
    ` 🎮 [companion-memory] [compact] [ok] child=${childId} companion=${companionId} events=${events.length}`,
  );
  return {
    compacted: true,
    eventCount: events.length,
    filePath: relationship.filePath,
    memory: nextMemory,
  };
}
