import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";

export const CHILD_FACING_VISUAL_GATE_VERSION = 1;
export const CHILD_FACING_VISUAL_PROMPT = "Review these screenshots as a child would. Are there any visual bugs, confusing or contradictory elements, or anything that would make the activity difficult to understand or complete? Describe everything you notice.";

export type ChildFacingVisualVerdict = {
  decision: "approve" | "reject";
  observations: string[];
};

type VisualJudgeClient = Pick<Anthropic, "messages">;

type SavedVisualVerdict = ChildFacingVisualVerdict & {
  version: number;
  requestHash: string;
  model: string;
  screenshotHashes: string[];
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
}): Promise<ChildFacingVisualVerdict> {
  const screenshotPaths = [...new Set(input.screenshotPaths)].filter(file => fs.existsSync(file));
  if (screenshotPaths.length === 0) throw new Error("child_visual_review_screenshots_missing");
  const model = input.model ?? process.env.SUNNY_VISUAL_JUDGE_MODEL ?? "claude-sonnet-5";
  const screenshotHashes = screenshotPaths.map(file => digest(fs.readFileSync(file)));
  const requestHash = digest(JSON.stringify({
    version: CHILD_FACING_VISUAL_GATE_VERSION,
    model,
    prompt: CHILD_FACING_VISUAL_PROMPT,
    screenshotHashes,
  }));

  if (input.auditFile && fs.existsSync(input.auditFile)) {
    const saved = JSON.parse(fs.readFileSync(input.auditFile, "utf8")) as SavedVisualVerdict;
    if (saved.version === CHILD_FACING_VISUAL_GATE_VERSION && saved.requestHash === requestHash) {
      console.log(` 🎮 [visual-judge] [verdict] [reused] decision=${saved.decision}`);
      return parseVerdict(saved);
    }
  }

  if (!input.client && !process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error("child_visual_review_missing:ANTHROPIC_API_KEY");
  }
  const client = input.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model,
    max_tokens: 1000,
    tools: [{
      name: "record_visual_verdict",
      description: "Record the result of the open-ended screenshot inspection.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["decision", "observations"],
        properties: {
          decision: { type: "string", enum: ["approve", "reject"] },
          observations: { type: "array", items: { type: "string" }, maxItems: 8 },
        },
      },
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
  const toolUse = response.content.find(block => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("child_visual_review_missing_verdict");
  const verdict = parseVerdict(toolUse.input);
  if (input.auditFile) atomicJson(input.auditFile, {
    version: CHILD_FACING_VISUAL_GATE_VERSION,
    requestHash,
    model,
    screenshotHashes,
    ...verdict,
  } satisfies SavedVisualVerdict);
  console.log(` 🎮 [visual-judge] [verdict] [${verdict.decision}] observations=${verdict.observations.length}`);
  return verdict;
}
