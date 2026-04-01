import Anthropic from "@anthropic-ai/sdk";
import { generateText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { PSYCHOLOGIST_PROMPT, PSYCHOLOGIST_CONTEXT } from "../prompts";
import { loadChildFiles } from "../../utils/loadChildFiles";
import { appendToContext } from "../../utils/appendToContext";
import { querySessions, flagGap } from "./tools";
import { curriculumPlanner } from "../curriculum-planner/planner";
import { runTranslator } from "../translator/translator";

/** One row from the generic homework extractor (any subject). */
export type StructuredWorksheetVisibleFacts =
  | {
      kind: "compare_amounts";
      leftAmountCents: number;
      rightAmountCents: number;
      askVisual: "greater" | "less";
    }
  | {
      kind: "money_count";
      itemLabel: string;
      itemPriceCents: number;
      totalSpentCents: number;
    }
  | {
      kind: "multiple_choice";
      options: string[];
    }
  | {
      kind: "free_response";
      promptSummary: string;
    };

export type StructuredWorksheetContract = {
  page: number;
  promptVisible: string;
  promptSpoken: string;
  problemType:
    | "compare_amounts"
    | "money_count"
    | "multiple_choice"
    | "free_response"
    | "spelling"
    | "unknown";
  answerKind: "numeric" | "text" | "choice";
  canonicalAnswer: string;
  visibleFacts: StructuredWorksheetVisibleFacts;
  evidence: string[];
  confidence: number;
  linkedGames: string[];
  overlayTargets?: Array<{
    label: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }>;
};

export type HomeworkProblemItem = {
  id: number;
  /** What the companion says aloud — natural spoken question only. */
  question: string;
  /** Raw worksheet directions — never spoken or shown to the child. */
  instructions: string[];
  answer: string;
  hint: string;
  /** Short plain-text scene description; server generates SVG from this. */
  canvas_display: string;
  page?: number;
  promptVisible?: string;
  promptSpoken?: string;
  linkedGames?: string[];
  evidence?: string[];
  confidence?: number;
  structured?: StructuredWorksheetContract;
};

export type HomeworkSessionDirectives = {
  problems_today?: number[];
  teaching_order?: number[];
  reward_after?: number;
  interaction_mode?: "review" | "answer_entry";
};

export type HomeworkExtractionResult = {
  subject: string;
  problems: HomeworkProblemItem[];
  session_directives?: HomeworkSessionDirectives;
};

export type HomeworkPageAsset = {
  filename: string;
  mediaType: "image/jpeg" | "image/png";
  data: string;
};

export type HomeworkExtractionInput =
  | string
  | {
      rawText: string;
      pageAssets?: HomeworkPageAsset[];
    };

const GENERIC_EXTRACTOR_SYSTEM = `You are a worksheet analyst for a voice tutoring companion.
You extract practice problems from raw homework text or OCR. You never pick a fixed "subject type" code — only a human-readable label.`;

const GENERIC_EXTRACTOR_INSTRUCTIONS = `
For any homework worksheet you receive:
  CHILD PROFILE FILTER — apply before extracting:
    Read the child's grade level and math skills from their soul file.

    For Reina (2nd grade):
    - INCLUDE: counting, addition, subtraction, comparing amounts, coin identification
    - EXCLUDE: any problem requiring multiplication, division, or multi-step operations the child hasn't mastered
    - If a problem requires an excluded operation, skip it entirely — do not extract it

    This filter applies to ALL worksheets regardless of what the teacher assigned. Our job is to meet the child where they are, not where the worksheet assumes they are.

  Extract every problem as JSON with these fields:

  question: What Matilda says aloud to the child.
    - Natural spoken language only
    - A tutor asking a question, not a worksheet
    - Example: 'How many cookies did I buy?'
    - NEVER: 'Circle the amount' or '[Sale sign]'

  instructions: Array of raw worksheet directions.
    - Exact text from the worksheet like 'Circle...' or 'Write the amount in the box'
    - May be empty array [] if none found
    - These are NEVER spoken aloud or shown to child

  answer: The correct answer as a child would say it

  hint: One sentence to help if child is stuck.
    Supportive, not giving away the answer.

  canvas_display: One sentence scene description.
    What to draw — not the answer, just context.
    Apply these principles:
    - SCENE not LABEL: 'Cookie shop where...' not 'show cookie 10¢'
    - CONTEXT not ANSWER: show what helps thinking
    - Include budget/total if problem has one: 'child has 35¢ to spend'
    - NEVER include the solution
  Plain text only — NO SVG, NO HTML, NO JSON objects. The server generates the visual.

  structured: A structured worksheet contract. This is the source of truth for worksheet meaning.
    page: 1-based page number where the problem appears
    promptVisible: the worksheet wording as seen on the page
    promptSpoken: the spoken tutor wording
    problemType: compare_amounts | money_count | multiple_choice | free_response | spelling | unknown
    answerKind: numeric | text | choice
    canonicalAnswer: normalized canonical answer for grading
    visibleFacts:
      - compare_amounts: { kind, leftAmountCents, rightAmountCents, askVisual }
      - money_count: { kind, itemLabel, itemPriceCents, totalSpentCents }
      - multiple_choice: { kind, options }
      - free_response: { kind, promptSummary }
    evidence: short array of worksheet-grounded evidence snippets
    confidence: number from 0 to 1
    linkedGames: array of teaching game ids that fit the exact concept
    overlayTargets: optional authored targets for answer boxes if visible

  When the worksheet shows dollars, normalize to cents in structured.visibleFacts and canonicalAnswer.
  Example: $1.18 -> 118.

  After extraction build session_directives:
    problems_today: first 5 problem ids (or fewer if there are fewer questions)
    teaching_order: list the same ids from easiest to hardest
    reward_after: N correct answers before a reward game (use 5 if unsure)

Output ONLY a single JSON object (no markdown fences, no commentary) with this exact shape:
{
  "subject": "<short label, e.g. spelling homework — not a type enum>",
  "problems": [
    {
      "id": 1,
      "question": "<spoken question only>",
      "instructions": ["<raw direction 1>", "<raw direction 2>"],
      "answer": "<short canonical answer>",
      "hint": "<one-sentence teaching hint>",
      "canvas_display": "<one short plain-text scene, no SVG or HTML>",
      "page": 1,
      "promptVisible": "<worksheet wording on the page>",
      "promptSpoken": "<same spoken wording as question>",
      "linkedGames": ["store-game"],
      "evidence": ["<short page-grounded fact>"],
      "confidence": 0.98,
      "structured": {
        "page": 1,
        "promptVisible": "<worksheet wording on the page>",
        "promptSpoken": "<spoken wording>",
        "problemType": "compare_amounts",
        "answerKind": "numeric",
        "canonicalAnswer": "75",
        "visibleFacts": {
          "kind": "compare_amounts",
          "leftAmountCents": 51,
          "rightAmountCents": 75,
          "askVisual": "greater"
        },
        "evidence": ["first amount is 51 cents", "second amount is 75 cents"],
        "confidence": 0.98,
        "linkedGames": ["coin-counter"],
        "overlayTargets": []
      }
    }
  ],
  "session_directives": {
    "problems_today": [1, 2, 3],
    "teaching_order": [1, 2, 3],
    "reward_after": 5,
    "interaction_mode": "review"
  }
}

Rules:
- Assign ids starting at 1.
- Include every answerable question you can find; if there are no questions, return "problems": [].
- Every problem must include id, question, instructions (array, may be empty), answer, hint, and canvas_display.
- Every problem must include a structured object, even if problemType is "unknown".
- hints must be supportive, not giving away the full answer on the first line unless the worksheet already does.
- When page images are present, trust the image over OCR noise.
`.trim();

function normalizeCanvasDisplay(
  raw: unknown,
  rowQuestion: string,
): string {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const board = String(o.boardText ?? "").trim();
    const speak = String(o.speakQuestion ?? "").trim();
    const q = String(o.question ?? "").trim();
    if (board) return board;
    if (speak) return speak;
    if (q) return q;
    const svg = String(o.svg ?? "").trim();
    if (svg.startsWith("<svg")) return rowQuestion;
    return JSON.stringify(o);
  }
  const s = String(raw ?? "").trim();
  return s || rowQuestion;
}

function normalizeLinkedGames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

function normalizeEvidence(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

function normalizeOverlayTargets(
  raw: unknown,
): StructuredWorksheetContract["overlayTargets"] {
  if (!Array.isArray(raw)) return [];
  const targets: NonNullable<StructuredWorksheetContract["overlayTargets"]> = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const label = String(item.label ?? "").trim();
    if (!label) continue;
    const numeric = (value: unknown): number | undefined =>
      typeof value === "number" && Number.isFinite(value) ? value : undefined;
    targets.push({
      label,
      x: numeric(item.x),
      y: numeric(item.y),
      width: numeric(item.width),
      height: numeric(item.height),
    });
  }
  return targets;
}

function normalizeStructuredVisibleFacts(
  raw: unknown,
): StructuredWorksheetVisibleFacts {
  if (!raw || typeof raw !== "object") {
    return { kind: "free_response", promptSummary: "" };
  }
  const value = raw as Record<string, unknown>;
  const kind = String(value.kind ?? "").trim();
  if (kind === "compare_amounts") {
    return {
      kind,
      leftAmountCents:
        typeof value.leftAmountCents === "number" ? value.leftAmountCents : 0,
      rightAmountCents:
        typeof value.rightAmountCents === "number" ? value.rightAmountCents : 0,
      askVisual: value.askVisual === "less" ? "less" : "greater",
    };
  }
  if (kind === "money_count") {
    return {
      kind,
      itemLabel: String(value.itemLabel ?? "").trim(),
      itemPriceCents:
        typeof value.itemPriceCents === "number" ? value.itemPriceCents : 0,
      totalSpentCents:
        typeof value.totalSpentCents === "number" ? value.totalSpentCents : 0,
    };
  }
  if (kind === "multiple_choice") {
    return {
      kind,
      options: Array.isArray(value.options)
        ? value.options.map((entry) => String(entry ?? "").trim()).filter(Boolean)
        : [],
    };
  }
  return {
    kind: "free_response",
    promptSummary: String(value.promptSummary ?? "").trim(),
  };
}

function normalizeStructuredWorksheetContract(
  raw: unknown,
  fallbackQuestion: string,
  fallbackAnswer: string,
): StructuredWorksheetContract | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  const promptSpoken =
    String(value.promptSpoken ?? fallbackQuestion).trim() || fallbackQuestion;
  const canonicalAnswer =
    String(value.canonicalAnswer ?? fallbackAnswer).trim() || fallbackAnswer;
  return {
    page:
      typeof value.page === "number" && Number.isFinite(value.page)
        ? value.page
        : 1,
    promptVisible: String(value.promptVisible ?? fallbackQuestion).trim() || fallbackQuestion,
    promptSpoken,
    problemType:
      (String(value.problemType ?? "unknown").trim() as StructuredWorksheetContract["problemType"]) ||
      "unknown",
    answerKind:
      value.answerKind === "choice" || value.answerKind === "text"
        ? value.answerKind
        : "numeric",
    canonicalAnswer,
    visibleFacts: normalizeStructuredVisibleFacts(value.visibleFacts),
    evidence: normalizeEvidence(value.evidence),
    confidence:
      typeof value.confidence === "number" && Number.isFinite(value.confidence)
        ? Math.max(0, Math.min(1, value.confidence))
        : 0,
    linkedGames: normalizeLinkedGames(value.linkedGames),
    overlayTargets: normalizeOverlayTargets(value.overlayTargets),
  };
}

/** Coerce model output to string[]; single string becomes [string]; missing → []. */
function normalizeWorksheetInstructions(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (typeof raw === "string") {
    const s = raw.trim();
    return s ? [s] : [];
  }
  if (Array.isArray(raw)) {
    return raw
      .map((x) => String(x ?? "").trim())
      .filter(Boolean);
  }
  return [];
}

function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Extractor response contained no JSON object");
  }
  return text.slice(start, end + 1);
}

function normalizeExtraction(raw: unknown): HomeworkExtractionResult {
  if (!raw || typeof raw !== "object") {
    return { subject: "", problems: [] };
  }
  const o = raw as Record<string, unknown>;
  const subject = typeof o.subject === "string" ? o.subject : "";
  const problemsIn = Array.isArray(o.problems) ? o.problems : [];
  const problems: HomeworkProblemItem[] = [];

  for (let i = 0; i < problemsIn.length; i++) {
    const p = problemsIn[i];
    if (!p || typeof p !== "object") continue;
    const row = p as Record<string, unknown>;
    const question = String(row.question ?? "").trim();
    const answer = String(row.answer ?? "").trim();
    if (!question || !answer) continue;
    const idRaw = row.id;
    const id =
      typeof idRaw === "number" && !Number.isNaN(idRaw)
        ? idRaw
        : i + 1;
    problems.push({
      id,
      question,
      instructions: normalizeWorksheetInstructions(row.instructions),
      answer,
      hint:
        String(row.hint ?? "").trim() ||
        "Think about what the question is asking.",
      canvas_display: normalizeCanvasDisplay(row.canvas_display, question),
      page:
        typeof row.page === "number" && Number.isFinite(row.page) ? row.page : 1,
      promptVisible:
        String(row.promptVisible ?? row.prompt_visible ?? question).trim() ||
        question,
      promptSpoken:
        String(row.promptSpoken ?? row.prompt_spoken ?? question).trim() ||
        question,
      linkedGames: normalizeLinkedGames(row.linkedGames ?? row.linked_games),
      evidence: normalizeEvidence(row.evidence),
      confidence:
        typeof row.confidence === "number" && Number.isFinite(row.confidence)
          ? Math.max(0, Math.min(1, row.confidence))
          : undefined,
      structured: normalizeStructuredWorksheetContract(
        row.structured,
        question,
        answer,
      ),
    });
  }

  let session_directives: HomeworkSessionDirectives | undefined;
  const sd = o.session_directives;
  if (sd && typeof sd === "object") {
    const sdo = sd as Record<string, unknown>;
    session_directives = {
      problems_today: Array.isArray(sdo.problems_today)
        ? sdo.problems_today.filter(
            (x): x is number => typeof x === "number" && !Number.isNaN(x),
          )
        : undefined,
      teaching_order: Array.isArray(sdo.teaching_order)
        ? sdo.teaching_order.filter(
            (x): x is number => typeof x === "number" && !Number.isNaN(x),
          )
        : undefined,
      reward_after:
        typeof sdo.reward_after === "number" && !Number.isNaN(sdo.reward_after)
          ? sdo.reward_after
          : undefined,
      interaction_mode:
        sdo.interaction_mode === "review" || sdo.interaction_mode === "answer_entry"
          ? sdo.interaction_mode
          : undefined,
    };
  }

  return { subject, problems, session_directives };
}

/**
 * Parses the homework extractor model output into structured problems.
 * Used by extractHomeworkProblems; exported for contract tests.
 */
export function parseHomeworkExtractionModelText(
  rawModelText: string,
): HomeworkExtractionResult {
  try {
    const jsonStr = extractJsonObject(rawModelText.trim());
    const parsed = JSON.parse(jsonStr) as unknown;
    return normalizeExtraction(parsed);
  } catch {
    return { subject: "unknown", problems: [] };
  }
}

/**
 * One generic pass: any worksheet → structured problems + optional session_directives.
 * No subject-specific branches.
 */
export async function extractHomeworkProblems(
  input: HomeworkExtractionInput,
): Promise<HomeworkExtractionResult> {
  const rawHomework = typeof input === "string" ? input : input.rawText;
  const pageAssets = typeof input === "string" ? [] : input.pageAssets ?? [];
  const trimmed = (rawHomework ?? "").trim();
  if (!trimmed) {
    return { subject: "", problems: [] };
  }

  if (pageAssets.length > 0) {
    const client = new Anthropic();
    const content: Anthropic.MessageParam["content"] = [
      ...pageAssets.map((asset) => ({
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: asset.mediaType,
          data: asset.data,
        },
      })),
      {
        type: "text" as const,
        text:
          `${GENERIC_EXTRACTOR_INSTRUCTIONS}\n\n` +
          `Use the provided worksheet page images as the primary source of truth. ` +
          `Use the support text only to recover OCR that is hard to read.\n\n` +
          `--- SUPPORT TEXT ---\n${trimmed.slice(0, 120_000)}`,
      },
    ];
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      system: GENERIC_EXTRACTOR_SYSTEM,
      messages: [{ role: "user", content }],
    });
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => ("text" in block ? block.text : ""))
      .join("\n");
    return parseHomeworkExtractionModelText(text);
  }

  const { text } = await generateText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: GENERIC_EXTRACTOR_SYSTEM,
    maxOutputTokens: 4096,
    prompt: `${GENERIC_EXTRACTOR_INSTRUCTIONS}\n\n--- HOMEWORK ---\n${trimmed.slice(0, 120_000)}`,
  });

  return parseHomeworkExtractionModelText(text);
}

export async function runPsychologist(
  childName: "Ila" | "Reina",
  dryRun = false,
): Promise<void> {
  console.log("runPsychologist called with dryRun:", dryRun);
  const { context, curriculum, attempts } = loadChildFiles(childName);

  const prompt = PSYCHOLOGIST_CONTEXT(childName, context, attempts, curriculum);

  const tools = { querySessions, flagGap };
  console.log("Tools registered:", Object.keys(tools));

  const { text, steps } = await generateText({
    model: anthropic("claude-sonnet-4-5"),
    system: PSYCHOLOGIST_PROMPT(childName),
    prompt,
    tools,
    stopWhen: stepCountIs(10),
    maxOutputTokens: 1500,
    onStepFinish: (step) => {
      console.log(
        "Step:",
        step.finishReason,
        step.toolCalls?.length ?? 0,
        "tool calls",
      );
    },
  });

  console.log("Full steps count:", steps?.length ?? 0);
  console.log("Full text length:", text.length);
  console.log("Full text:", text);

  if (dryRun) {
    console.log("\n--- Psychologist Report (dry run) ---\n");
    console.log(text);
    console.log("\n--- End Report ---\n");
    return;
  }

  // Guard: a valid psychologist report must include a Signal line.
  // A missing Signal means the model stalled before completing its analysis.
  if (!text.includes("## Signal")) {
    console.error(
      `  🔴 [runPsychologist] Report for ${childName} is missing "## Signal" section — model likely stalled. Skipping appendToContext.`,
    );
    console.error(`  🔴 Output snippet: "${text.slice(0, 300)}"`);
    return;
  }

  await appendToContext(childName, "Psychologist Report", text);
  await runTranslator(childName, text);

  if (text.includes("ADVANCE")) {
    await curriculumPlanner(childName);
  }
}
