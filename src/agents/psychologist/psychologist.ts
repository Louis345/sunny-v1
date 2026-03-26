import { generateText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { PSYCHOLOGIST_PROMPT, PSYCHOLOGIST_CONTEXT } from "../prompts";
import { loadChildFiles } from "../../utils/loadChildFiles";
import { appendToContext } from "../../utils/appendToContext";
import { querySessions, flagGap } from "./tools";
import { curriculumPlanner } from "../curriculum-planner/planner";
import { runTranslator } from "../translator/translator";

/** One row from the generic homework extractor (any subject). */
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
};

export type HomeworkSessionDirectives = {
  problems_today?: number[];
  teaching_order?: number[];
  reward_after?: number;
};

export type HomeworkExtractionResult = {
  subject: string;
  problems: HomeworkProblemItem[];
  session_directives?: HomeworkSessionDirectives;
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
      "canvas_display": "<one short plain-text scene, no SVG or HTML>"
    }
  ],
  "session_directives": {
    "problems_today": [1, 2, 3],
    "teaching_order": [1, 2, 3],
    "reward_after": 5
  }
}

Rules:
- Assign ids starting at 1.
- Include every answerable question you can find; if there are no questions, return "problems": [].
- Every problem must include id, question, instructions (array, may be empty), answer, hint, and canvas_display.
- hints must be supportive, not giving away the full answer on the first line unless the worksheet already does.
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
  rawHomework: string,
): Promise<HomeworkExtractionResult> {
  const trimmed = (rawHomework ?? "").trim();
  if (!trimmed) {
    return { subject: "", problems: [] };
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

  const prompt = PSYCHOLOGIST_CONTEXT(context, attempts, curriculum);

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
  } else {
    await appendToContext(childName, "Psychologist Report", text);
    await runTranslator(childName, text);
  }

  if (text.includes("ADVANCE") && !dryRun) {
    await curriculumPlanner(childName);
  }
}
