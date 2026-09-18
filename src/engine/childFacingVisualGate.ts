import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";

export const CHILD_FACING_VISUAL_GATE_VERSION = 2;
export const CHILD_FACING_VISUAL_PROMPT = "Review these screenshots as a child would. Are there any visual bugs, confusing or contradictory elements, or anything that would make the activity difficult to understand or complete? Describe everything you notice.";

export type ChildFacingVisualVerdict = {
  decision: "approve" | "reject";
  observations: string[];
};

type VisualJudgeClient = Pick<Anthropic, "messages">;

const VISUAL_VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["decision", "observations"],
  properties: {
    decision: { type: "string", enum: ["approve", "reject"] },
    observations: { type: "array", items: { type: "string" }, maxItems: 8 },
  },
} as const;

type VisualReviewStatus = "in_flight" | "received_raw" | "received" | "rejected" | "outcome_uncertain";
type VisualReviewAttempt = {
  attempt: number;
  startedAt: string;
  finishedAt?: string;
  status: VisualReviewStatus;
  error?: string;
  code?: number;
};
type SavedVisualVerdict = Partial<ChildFacingVisualVerdict> & {
  version: number;
  requestHash: string;
  model: string;
  screenshotHashes: string[];
  status?: VisualReviewStatus;
  rawResponse?: unknown;
  attempts?: VisualReviewAttempt[];
  error?: string;
};

function digest(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseVerdict(value: unknown): ChildFacingVisualVerdict {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  const decision = record?.decision;
  const observations = record?.observations;
  if ((decision !== "approve" && decision !== "reject")
    || !Array.isArray(observations)
    || observations.some(item => typeof item !== "string" || !item.trim())
    || observations.length > 8
    || (decision === "reject" && observations.length === 0)) {
    throw new Error("child_visual_review_invalid_verdict");
  }
  return { decision, observations: observations.map(String) };
}

function openAiResponseText(payload: Record<string, unknown>): string | undefined {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? (item as Record<string, unknown>).content as unknown[]
      : [];
    for (const part of content) {
      if (part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string") {
        return (part as Record<string, unknown>).text as string;
      }
    }
  }
  return undefined;
}

function parseProviderVerdict(provider: "openai" | "anthropic", response: unknown): ChildFacingVisualVerdict {
  if (provider === "openai") {
    if (!response || typeof response !== "object") throw new Error("child_visual_review_missing_verdict");
    const rawVerdict = openAiResponseText(response as Record<string, unknown>);
    if (!rawVerdict) throw new Error("child_visual_review_missing_verdict");
    return parseVerdict(JSON.parse(rawVerdict));
  }
  const content = response && typeof response === "object" && Array.isArray((response as { content?: unknown }).content)
    ? (response as { content: Array<{ type?: string; input?: unknown }> }).content
    : [];
  const toolUse = content.find(block => block.type === "tool_use");
  if (!toolUse) throw new Error("child_visual_review_missing_verdict");
  return parseVerdict(toolUse.input);
}

function atomicJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
}

export async function judgeChildFacingScreens(input: {
  screenshotPaths: string[];
  model?: string;
  auditFile?: string;
  client?: VisualJudgeClient;
  retryUncertain?: boolean;
}): Promise<ChildFacingVisualVerdict> {
  const screenshotPaths = [...new Set(input.screenshotPaths)].filter(file => fs.existsSync(file));
  if (screenshotPaths.length === 0) throw new Error("child_visual_review_screenshots_missing");
  const model = input.model ?? process.env.SUNNY_VISUAL_JUDGE_MODEL
    ?? (input.client ? "claude-sonnet-5" : "gpt-5.6");
  const provider = model.startsWith("gpt-") ? "openai" : "anthropic";
  const screenshotHashes = screenshotPaths.map(file => digest(fs.readFileSync(file)));
  const requestHash = digest(JSON.stringify({
    version: CHILD_FACING_VISUAL_GATE_VERSION,
    model,
    prompt: CHILD_FACING_VISUAL_PROMPT,
    screenshotHashes,
  }));

  let saved: SavedVisualVerdict | undefined;
  if (input.auditFile && fs.existsSync(input.auditFile)) {
    saved = JSON.parse(fs.readFileSync(input.auditFile, "utf8")) as SavedVisualVerdict;
    const savedStatus = saved.status ?? (saved.decision ? "received" : undefined);
    if (saved.version === CHILD_FACING_VISUAL_GATE_VERSION
      && saved.requestHash !== requestHash
      && (savedStatus === "in_flight" || savedStatus === "outcome_uncertain" || savedStatus === "received_raw")
      && !input.retryUncertain) {
      throw new Error(`child_visual_review_${savedStatus}:${input.auditFile}${saved.error ? `:${saved.error}` : ""}`);
    }
    if (saved.version === CHILD_FACING_VISUAL_GATE_VERSION && saved.requestHash === requestHash) {
      const status = savedStatus;
      if (status === "received") {
        const verdict = parseVerdict(saved);
        console.log(` 🎮 [visual-judge] [verdict] [reused] decision=${verdict.decision}`);
        return verdict;
      }
      if (status === "received_raw") {
        const verdict = parseProviderVerdict(provider, saved.rawResponse);
        atomicJson(input.auditFile, { ...saved, status: "received", ...verdict });
        console.log(` 🎮 [visual-judge] [verdict] [recovered] decision=${verdict.decision}`);
        return verdict;
      }
      if (!input.retryUncertain && status) {
        throw new Error(`child_visual_review_${status}:${input.auditFile}${saved.error ? `:${saved.error}` : ""}`);
      }
    } else {
      saved = undefined;
    }
  }

  if (!input.auditFile && !input.client) throw new Error("child_visual_review_audit_required");

  if (provider === "openai" && !process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("child_visual_review_missing:OPENAI_API_KEY");
  }
  if (provider === "anthropic" && !input.client && !process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error("child_visual_review_missing:ANTHROPIC_API_KEY");
  }

  const startedAt = new Date().toISOString();
  const priorAttempts = saved?.version === CHILD_FACING_VISUAL_GATE_VERSION
    && saved.requestHash === requestHash && Array.isArray(saved.attempts)
    ? saved.attempts
    : [];
  const attempts: VisualReviewAttempt[] = [
    ...priorAttempts,
    { attempt: priorAttempts.length + 1, startedAt, status: "in_flight" },
  ];
  if (input.auditFile) atomicJson(input.auditFile, {
    version: CHILD_FACING_VISUAL_GATE_VERSION,
    requestHash,
    model,
    screenshotHashes,
    status: "in_flight",
    attempts,
  } satisfies SavedVisualVerdict);

  let rawResponse: unknown;
  try {
  if (provider === "openai") {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY!.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [{
          role: "user",
          content: [
            ...screenshotPaths.map(file => ({
              type: "input_image",
              image_url: `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`,
              detail: "high",
            })),
            { type: "input_text", text: CHILD_FACING_VISUAL_PROMPT },
          ],
        }],
        text: { format: { type: "json_schema", name: "child_visual_verdict", strict: true, schema: VISUAL_VERDICT_SCHEMA } },
        reasoning: { effort: "low" },
        max_output_tokens: 1000,
        store: false,
      }),
      signal: AbortSignal.timeout(Number(process.env.SUNNY_AI_TIMEOUT_MS ?? 600_000)),
    });
    if (!response.ok) {
      const error = new Error(`child_visual_review_openai_failed:${response.status}:${await response.text()}`) as Error & { status: number };
      error.status = response.status;
      throw error;
    }
    const payload = await response.json() as Record<string, unknown>;
    if (payload.status && payload.status !== "completed") throw new Error(`child_visual_review_openai_incomplete:${payload.status}`);
    rawResponse = payload;
  } else {
    const client = input.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    rawResponse = await client.messages.create({
      model,
      max_tokens: 1000,
      tools: [{
        name: "record_visual_verdict",
        description: "Record the result of the open-ended screenshot inspection.",
        input_schema: VISUAL_VERDICT_SCHEMA,
      }],
      tool_choice: { type: "tool", name: "record_visual_verdict" },
      messages: [{
        role: "user",
        content: [
          ...screenshotPaths.map(file => ({
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: "image/png" as const,
              data: fs.readFileSync(file).toString("base64"),
            },
          })),
          { type: "text" as const, text: CHILD_FACING_VISUAL_PROMPT },
        ],
      }],
    });
  }
  } catch (error) {
    const code = Number((error as { status?: number }).status ?? 0);
    const status: VisualReviewStatus = code >= 400 && code < 500 ? "rejected" : "outcome_uncertain";
    const finishedAt = new Date().toISOString();
    attempts[attempts.length - 1] = {
      ...attempts[attempts.length - 1]!,
      status,
      finishedAt,
      error: error instanceof Error ? error.message : String(error),
      ...(code ? { code } : {}),
    };
    if (input.auditFile) atomicJson(input.auditFile, {
      version: CHILD_FACING_VISUAL_GATE_VERSION,
      requestHash,
      model,
      screenshotHashes,
      status,
      error: error instanceof Error ? error.message : String(error),
      attempts,
    } satisfies SavedVisualVerdict);
    throw new Error(`child_visual_review_${status}:${input.auditFile ?? "injected"}:${error instanceof Error ? error.message : String(error)}`);
  }

  const receivedAt = new Date().toISOString();
  attempts[attempts.length - 1] = { ...attempts[attempts.length - 1]!, status: "received_raw", finishedAt: receivedAt };
  if (input.auditFile) atomicJson(input.auditFile, {
    version: CHILD_FACING_VISUAL_GATE_VERSION,
    requestHash,
    model,
    screenshotHashes,
    status: "received_raw",
    rawResponse,
    attempts,
  } satisfies SavedVisualVerdict);
  const verdict = parseProviderVerdict(provider, rawResponse);
  if (input.auditFile) atomicJson(input.auditFile, {
    version: CHILD_FACING_VISUAL_GATE_VERSION,
    requestHash,
    model,
    screenshotHashes,
    status: "received",
    attempts: attempts.map((attempt, index) => index === attempts.length - 1 ? { ...attempt, status: "received" } : attempt),
    ...verdict,
  } satisfies SavedVisualVerdict);
  console.log(` 🎮 [visual-judge] [verdict] [${verdict.decision}] observations=${verdict.observations.length}`);
  return verdict;
}
