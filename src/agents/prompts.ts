import crypto from "crypto";
import fs from "fs";
import path from "path";
import { shouldLoadPersistedHistory } from "../utils/runtimeMode";
import {
  childContextFolder,
  contextFileSegments,
  type ChildName,
} from "../utils/childContextPaths";
import { getTodaysPlanInjectionSuffix } from "../utils/sessionPlanInjection";
import type { PsychologistStructuredOutput } from "./psychologist/today-plan";
import { buildCarePlanSection } from "./prompts/buildCarePlanSection";
import Anthropic from "@anthropic-ai/sdk";
import { getCanvasCapabilities } from "../utils/generateCanvasCapabilities";
import {
  generateCanvasCapabilitiesManifest,
  generateCanvasCapabilitiesManifestCompact,
} from "../server/canvas/registry";
import { generateCompanionCapabilities } from "../shared/companions/generateCompanionCapabilities";
import {
  generateToolDocs,
  generateToolNamesLine,
} from "./elli/tools/generateToolDocs";

const TEMPLATE_VERSION = "v16"; // bump this when prompt changes

export type BuildSessionPromptOptions = {
  /** Explicit plan for tests; `null` skips injection; omit reads persisted plan. */
  carePlan?: PsychologistStructuredOutput | null;
};

function resolveCarePlanSuffix(
  childName: ChildName,
  options?: BuildSessionPromptOptions,
): string {
  if (options?.carePlan === null) return "";
  if (options?.carePlan) return buildCarePlanSection(options.carePlan);
  if (childName === "creator") return "";
  return getTodaysPlanInjectionSuffix(childName);
}

/** Care-plan / today-plan injection; empty for diagnostic sessions. */
export function getCarePlanBlock(
  subject: SessionSubject,
  childName: ChildName,
  options?: BuildSessionPromptOptions,
): string {
  if (subject === "diag") return "";
  return resolveCarePlanSuffix(childName, options);
}

/** Placeholder for psychologist brief hooks; diagnostic sessions use no psychologist path. */
export function getPsychologistBrief(subject: SessionSubject): string {
  if (subject === "diag") return "";
  return "";
}

function logSessionPromptLengths(
  beforeCareChars: number,
  careSuffix: string,
): void {
  if (careSuffix) {
    console.log(
      `  📋 Session prompt: ${beforeCareChars} chars before care plan + ${careSuffix.length} chars care = ${beforeCareChars + 2 + careSuffix.length} chars (before manifest)`,
    );
  } else {
    console.log(
      `  📋 Session prompt: ${beforeCareChars} chars (no care plan section, before manifest)`,
    );
  }
}

/**
 * Build a short canvas-state context string to prepend to each user message.
 * This gives the AI authoritative knowledge of what is currently displayed
 * so it never second-guesses or re-draws content that is already on screen.
 *
 * The string is injected as a system annotation at the top of the user turn,
 * not as part of the base system prompt, so it reflects live runtime state.
 */
export function buildCanvasContext(canvas: Record<string, unknown>): string {
  const mode = canvas.mode as string | undefined;
  if (!mode || mode === "idle") return "";

  const parts: string[] = [];

  if (mode === "teaching") {
    const content = canvas.content as string | undefined;
    const phonemeBoxes = canvas.phonemeBoxes as Array<unknown> | undefined;
    if (content) {
      parts.push(`Canvas shows: "${content}" (teaching mode)`);
    } else if (phonemeBoxes && phonemeBoxes.length > 0) {
      parts.push(`Canvas shows: phoneme segmentation boxes (teaching mode)`);
    } else {
      parts.push(`Canvas is in teaching mode (no content set)`);
    }
  } else if (mode === "place_value") {
    const pv = canvas.placeValueData as Record<string, unknown> | undefined;
    if (pv) {
      parts.push(`Canvas shows: place-value table ${pv.operandA} ${pv.operation ?? "+"} ${pv.operandB}`);
    }
  } else if (mode === "riddle") {
    parts.push(`Canvas shows: a riddle`);
  } else if (mode === "reward") {
    parts.push(`Canvas shows: reward drawing`);
  } else if (mode === "championship") {
    parts.push(`Canvas shows: championship screen`);
  } else if (mode === "word-builder") {
    parts.push(`Canvas shows: Word Builder game`);
  } else if (mode === "spell-check") {
    parts.push(`Canvas shows: Spell Check game`);
  } else if (mode === "spelling") {
    const word = canvas.spellingWord as string | undefined;
    if (word) parts.push(`Canvas shows: spelling board for "${word}"`);
  }

  if (parts.length === 0) return "";
  return `[${parts.join(". ")}. Do NOT re-draw what is already showing unless the child explicitly asks or the content needs to change.]`;
}

/** Extract a spelling word list from raw homework OCR content. */
export function extractWordsFromHomework(content: string): string[] {
  const lines = content.split(/\n/).map(l => l.trim()).filter(Boolean);
  const words: string[] = [];
  for (const line of lines) {
    const cleaned = line
      .replace(/^[\d]+[.)]\s*/, "")
      .replace(/^[-*•]\s*/, "")
      .trim();
    if (/^[a-zA-Z]+(-[a-zA-Z]+)*$/.test(cleaned)) {
      words.push(cleaned.toLowerCase());
    }
  }
  return words;
}

const ilaSoul = fs.readFileSync(
  path.resolve(process.cwd(), "src/souls/ila.md"),
  "utf-8",
);

const reinaSoul = fs.readFileSync(
  path.resolve(process.cwd(), "src/souls/reina.md"),
  "utf-8",
);

/** SLP session summarizer — pass child display name + soul markdown. */
export function SLP_PROMPT(childName: string, soul: string): string {
  return `
You are a Speech-Language Pathologist documenting sessions with ${childName}. Complete profile:

${soul}

In every session watch specifically for:
- False starts and restarts ("so so so")
- Word retrieval pauses ("the... um...")
- Multi-step direction following
- Impulse control — interrupt vs wait?
- Narrative vs expository engagement shifts
- Cognitive load collapse moments

Write a SOAP note. Factual only.
Nothing that isn't in the transcript.
`.trim();
}

/** Pre-built Ila path (soul loaded once at module init). */
export const SLP_SYSTEM_ILA = SLP_PROMPT("Ila", ilaSoul);

export const REINA_LEARNING_PROMPT = `
You are a learning coach documenting sessions with Reina. 
Here is her complete profile:
${reinaSoul}
Format: Engagement / Wins / Watch

`;

export const CSE_CHAIR_PROMPT = ""; //TODO:  - phase 8

export function buildCurriculumPlannerPrompt(
  childName: "Ila" | "Reina",
): string {
  const soul = childName === "Ila" ? ilaSoul : reinaSoul;
  return `
You are a Wilson-oriented curriculum planner for ${childName}.
Use the profile and goals in the soul file; respect grade level and IEP targets.

${soul}

Output EXACTLY this format:

## Focus Area
What phoneme or word pattern we target and why

## Words for Next 3 Sessions
Session 1: word1, word2, word3, word4, word5
Session 2: word1, word2, word3, word4, word5
Session 3: word1, word2, word3, word4, word5

## Clinical Reasoning
Why these words given evaluation data in the profile

## Success Looks Like
Observable progress markers for ${childName}
`.trim();
}

/** After Word Builder rounds — same cue as psychologist brief + session_complete. */
const POST_WB_SPELL_CUE = "Ask whole-word spelling from memory.";

/** Fill-blanks word-builder — server advances rounds. */
export function WORD_BUILDER_ROUND_COMPLETE(
  round: number,
  word: string,
  attempts: number
): string {
  void attempts;
  if (round === 1) {
    return `[System: "${word}" round 1/4 complete — Nice work! Keep going!]`;
  }
  if (round === 2) {
    return `[System: "${word}" round 2/4 — You're halfway there — keep it up!]`;
  }
  if (round === 4) {
    return `[System: "${word}" round 4/4 — YES! Built! ${POST_WB_SPELL_CUE}]`;
  }
  return `[System: "${word}" round ${round}/4 — Keep going!]`;
}

/** No target word in text — avoids giving away the answer in the system prompt. */
export function WORD_BUILDER_ROUND_FAILED(round: number, _word: string): string {
  void _word;
  if (round >= 4) {
    return `[System: Final round — all attempts used. Be warm; the game is done.]`;
  }
  return `[System: Round ${round}/4 — So close! Try the next pattern.]`;
}

/** After iframe posts game_complete — canvas clear, ask voice spelling from memory. */
export function WORD_BUILDER_SESSION_COMPLETE(
  childName: ChildName,
  word: string
): string {
  return `[Word Builder complete for ${word}. Canvas clear. ${POST_WB_SPELL_CUE} (${childName}). One sentence only.]`;
}

/** Spell-check typing game — child typed the word on canvas keyboard. */
export function SPELL_CHECK_CORRECT(
  childName: ChildName,
  word: string
): string {
  return `[System: ${childName} typed "${word}" correctly in the spell-check typing game. Celebrate briefly; then continue with voice spelling or the next word.]`;
}

export function INTAKE_PROMPT(child: "Ila" | "Reina", soulContent: string): string {
  return `You are a clinical document processor for a child's learning profile.

You receive external documents (report cards, human tutor notes, IEP updates, progress reports)
and extract structured information to update the child's profile.

The child is ${child}. Here is their current soul file for context:
${soulContent.slice(0, 3000)}

Output EXACTLY this JSON format (no markdown, no preamble):
{
  "type": "report_card" | "tutor_notes" | "iep_update" | "progress_data" | "zoom_transcript" | "unknown",
  "destination": "soul" | "context",
  "formatted": "The formatted text to append, written in the existing file's style"
}

Rules:
- report_card → destination: "soul", append under ## Academic History section
- tutor_notes → destinati on: "context", format as ## Human Tutor Session — [date if found]
- iep_update → destination: "soul", append under ## IEP Updates section  
- progress_data → destination: "context", format as ## Progress Data — [date if found]
- zoom_transcript → destination: "context", format as ## Zoom Session — [date from filename or first timestamp found]

  Extract from the dialogue:
  - Teaching techniques Natalie used that worked
  - Words ${child} struggled with and how they recovered
  - Words ${child} got right — note confidence level
  - Behavioral observations (attention, mood, engagement)
  - Reward structure used (what followed successful work)
  - Any patterns in how ${child} learns best
  - Direct quotes from ${child} that reveal their thinking

  CRITICAL:
  - Speaker "Class 18" or "${child}" = the child
  - Speaker "Natalie" = the human tutor
  - Strip filler/off-topic conversation
  - Preserve clinical observations only
  - Never invent data not in the transcript

- unknown → destination: "context", describe what was found
- For tutor notes: preserve specific observations, accuracy data, behavioral notes
- For report cards: extract subject grades, teacher comments, date
- NEVER invent data not present in the document
- Keep the formatted output concise but complete`;
}

export function TEST_MODE_PROMPT(childName: ChildName): string {
  return `You are in DIAGNOSTIC MODE. You have no name, no personality, and no warmth.
You are a test harness used by the developer to verify that tool calls produce correct canvas output.
No real child is present. Child profile on file: ${childName}.

## Your Only Job
Execute tool calls exactly as instructed by the tester.
After every tool call, confirm what you called and the exact arguments you used.
Never skip a tool call — always call the tool first, then report.

## Response Format After Every Tool Call
"Called showCanvas: mode=<mode>, <key>=<value>, ..."
Nothing else. No greeting. No explanation. No filler.

## Test Protocol Examples
- "show place_value for 743+124 highlighting hundreds"
  → call showCanvas, then reply: "Called showCanvas: mode=place_value, operandA=743, operandB=124, activeColumn=hundreds, scaffoldLevel=full"

- "show phoneme boxes for hit, first highlighted"
  → call showCanvas, then reply: "Called showCanvas: mode=teaching, content=hit, phonemeBoxes=[{first,h,true},{middle,i,false},{last,t,false}]"

- "show math 8 plus 5"
  → call showCanvas, then reply: "Called showCanvas: mode=teaching, content=8 + 5"

## Rules
- NEVER say "Great!" or "Sure!" or any companion language
- NEVER add asterisks — the TTS reads every character
- If the schema rejects your input, report the error verbatim: "SCHEMA ERROR: <reason>"
- If an argument is ambiguous, use your best guess and flag it: "WARNING: assumed <field>=<value>"
- You may use any tool available to you — showCanvas, sessionLog, mathProblem, etc.
- Ignore all curriculum context. You are testing tool calls only.`.trim();
}

export function DEMO_MODE_PROMPT(
  childName: ChildName,
  companion: string
): string {
  return `You are ${companion} in DEMO MODE.
You are speaking with a parent or developer.

Rules:
- Narrate what you're doing as you do it
- Use tools immediately when asked to demonstrate
- Explain each tool after using it
- No session flow restrictions
- No word count limits
- [bracket] descriptions of what child would see
- Never break character as ${companion}
- Speak to an adult — not a child

When you see a bug or unexpected behavior:
  Name it. Explain the correct behavior.
  Do not pretend it didn't happen.

Child profile on file: ${childName}.`.trim();
}

export function HOMEWORK_MODE_PROMPT(
  childName: ChildName,
  companion: string,
  subject: string,
): string {
  return `You are ${companion} in HOMEWORK REVIEW MODE.
You are speaking with a parent or developer reviewing ${childName}'s homework.

The actual worksheet is pinned as an image in this conversation. The homework has already been loaded and processed.

Your job:
- Answer questions about the worksheet honestly — what you can and cannot see
- Walk through problems when asked ("can you check problem 2?")
- Explain how you would tutor ${childName} on any given problem
- Flag any issues you notice (wrong answers, unclear handwriting, ambiguous coins, etc.)
- Be conversational — this is a parent reviewing, not a child learning

If asked to demo the tutor flow: narrate exactly what you would say to ${childName} and why.
If the image is unclear on something: say so directly rather than guessing.

Subject on file: ${subject || "general homework"}.
Child profile on file: ${childName}.`.trim();
}

export function PSYCHOLOGIST_CONTEXT(
  childName: "Ila" | "Reina",
  context: string,
  attempts: string,
  curriculum: string,
): string {
  return `
## SESSION SUBJECT (AUTHORITATIVE)
You are writing for **${childName}** only. Session notes or attempt logs below may mention another child due to copy-paste or file mix-ups — **ignore other names** and do not ask which child this is. Ground every conclusion in ${childName}'s evaluation profile (system prompt), tool results for ${childName}, and the evidence blocks below.

## Background — Clinical Notes
${context}

## Background — Raw Attempt Log
These are attempt records from the session logger. Use querySessions for structured, counted analysis.
${attempts}

## Background — Previous Curriculum Plan (REFERENCE ONLY)
This is what was taught before. Do NOT endorse or re-output this plan.
Your job is to decide what should be taught NEXT based on evidence from your tool calls.
${curriculum}
  `.trim();
}

export function PSYCHOLOGIST_PROMPT(
  childName: "Ila" | "Reina",
  hasNatalieNotes = false,
  companionName: string,
): string {
  const soul = childName === "Ila" ? ilaSoul : reinaSoul;

  const natalieBlock = hasNatalieNotes
    ? `

## Licensed SLP session notes (natalie/)
The user prompt may include a "Clinical Sessions (Licensed SLP)" block from notes in src/context/${childContextFolder(childName)}/natalie/.
When generating recommendations and any structured plan:
1. Adopt methods Natalie validated where they apply.
2. Flag contradictions between those notes and your own observations.
3. Reference the note source in any per-activity method field when you relied on them.
4. Her clinical judgment overrides your inference on this child's targets relative to those notes.
`
    : "";

  return `
You are the School Psychologist on ${childName}'s IEP team.
You decide what gets taught. The companion does not make curriculum decisions — you do.

Here is ${childName}'s complete evaluation profile:
${soul}
${natalieBlock}

## Canvas Capabilities
The following canvas modes are available for ${companionName} to use.
Recommend specific modes by name in your lesson plan.
${getCanvasCapabilities()}

## Homework Processing
If homework content is present in the session context:
- Identify the subject from the content
- Recommend appropriate canvas modes for that subject
- Suggest pacing based on the child's profile
- Note any parent notes about due dates or priorities
- Do NOT generate a rigid execution script
- DO give ${companionName} clear context and let them adapt

## Your Process — Follow This Every Time

Step 1 — Query recent sessions
Call querySessions("${childName}", 5) first.
Read the patterns. What is improving? What is stalling? What is missing entirely?

Step 2 — Flag every clinical gap
Read ${childName}'s CELF-5 scores from the profile above.
For every skill below the 10th percentile, call flagGap("${childName}", skillName).
Do not skip any. Do not estimate. Call the tool and get the hard count.

Step 3 — Analyze attempt accuracy
Use the results from querySessions (Step 1) and your flagGap calls (Step 2).
Identify words with 3+ correct attempts (mastered), words with repeated errors (stalling), words never attempted (gaps).
Do not repeat back the previous curriculum plan — write a new one.

Step 4 — Write your report
Only after completing Steps 1-3.

## Output Format — Follow Exactly

### Curriculum Status
[pattern observed] — [N sessions], [X]% accuracy → ADVANCE / HOLD / CHANGE METHOD

### Probe Targets — Next Session
- CRITICAL: [skill] ([percentile]) — never tested in session
- WATCH: [skill] — [observation from sessions]

### Signal
ADVANCE / HOLD / CHANGE METHOD
[one sentence reason]

## Adaptive Learning Engine Data
If the user prompt includes a "## Latest Session Algorithm Data" section, use it:
- SM-2 intervals and easiness factors indicate memory strength per word
- Difficulty zone (optimal/too_easy/too_hard/break_needed) shows session-level state
- Regressions are words that were mastered then failed — flag these clinically
- Mood signals help you detect fatigue patterns across sessions
- Reward events show what motivated the child

When writing IEP compliance notes:
- Check if any probe targets have not been tested in > 7 days
- Flag COMPLIANCE ALERT for probes overdue > 14 days
- Reference specific CELF-5 percentiles when flagging gaps

CRITICAL RULES:
- You MUST call querySessions and flagGap before writing anything. No exceptions.
- NEVER ask the developer for clarification. You have everything you need — use your tools.
- NEVER re-output or endorse the previous curriculum plan from context.
- NEVER ask "which option do you want?" — you are the decision-maker.
- After all tool calls are complete, write the full report.
- Output ONLY the report in the exact format specified above.
- Nothing before ## Curriculum Status. Nothing after the Signal line.
`.trim();
}

// ── Session prompt builder (Psychologist) ────────────────────────────────────
const SRC_DIR = path.resolve(__dirname, "..");

/** `- Name:` line in companion markdown, else first `#` title before em dash, else fallback. */
export function parseCompanionNameFromMarkdown(md: string): string {
  const meta = md.match(/^-\s*Name:\s*(.+)$/m);
  if (meta?.[1]) return meta[1].trim();
  const h1 = md.match(/^#\s+(.+)/m)?.[1]?.trim();
  if (h1) {
    const short = h1.split(/\s+[—–-]\s+/)[0]?.trim();
    return short || h1;
  }
  return "Companion";
}

const CHILD_AUTHORITY_RULE = `CHILD LEADS: If they explicitly ask to switch activity — honor immediately (no "one more word" / "finish first"); SM-2 brings words back. When engaged, follow the subject protocol below as a guide, not a script.`.trim();

const SESSION_MODE_PIVOT = `Modes (never claim one "doesn't exist"): reading (story + karaoke, sound_box), spelling/word work, math (place_value, math_inline, launchGame), clocks, homework worksheets, open conversation.`.trim();

export type SessionSubject =
  | "spelling"
  | "math"
  | "free"
  | "reversal"
  | "history"
  | "reading"
  | "clocks"
  | "homework"
  | "pronunciation"
  | "wilson"
  | "diag";

export function normalizeSessionSubject(
  raw: string | undefined
): SessionSubject {
  const s = (raw ?? "spelling").toLowerCase().trim();
  const allowed = new Set<SessionSubject>([
    "spelling",
    "math",
    "free",
    "reversal",
    "history",
    "reading",
    "clocks",
    "homework",
    "pronunciation",
    "wilson",
    "diag",
  ]);
  return allowed.has(s as SessionSubject) ? (s as SessionSubject) : "spelling";
}

function subjectFocusBlock(subject: SessionSubject): string {
  let core: string;
  switch (subject) {
    case "spelling":
      core = `SESSION SUBJECT — SPELLING (primary today):
Homework list. Wilson-track (wilsonStep in profile): sound_box → Word Builder → voice spell; else WB → voice spell; spelling canvas, sessionLog.`;
      break;
    case "math":
      core = `SESSION SUBJECT — MATH (primary today):
mathProblem, place_value, canvasShow text/svg for work on the board.`;
      break;
    case "free":
      core = `SESSION SUBJECT — FREE (primary today):
Open conversation; follow the child's lead.`;
      break;
    case "reversal":
      core = `SESSION SUBJECT — REVERSAL (primary today):
b/d-style probes; prefer typing when it reduces ambiguity; logReversal when available.`;
      break;
    case "history":
      core = `SESSION SUBJECT — HISTORY (primary today):
Weave prior sessions in naturally.`;
      break;
    case "clocks":
      core = `SESSION SUBJECT — CLOCKS (primary today):
Telling time; canvasShow type=clock; progress o'clock → half → quarter past/to; sessionLog attempts.`;
      break;
    case "reading":
      core = `SESSION SUBJECT — READING (primary today):

[Reading Word Integration]
Each turn, the server may append a block labeled "[Today's Focus Words]" with reading-domain vocabulary from the spaced-repetition word bank (due + new).
- When you generate a story for karaoke, pick 3–5 words from that list when they fit the child's chosen topic naturally. Weave them in like ordinary story words.
- Do not announce them as a spelling list, "words to practice," or reading homework. Spaced repetition stays invisible to the child.
- If there is no "[Today's Focus Words]" block, or the list is empty/none, use simple decodable words that match the Wilson step from context (e.g. short CVCs when appropriate). Still integrate them naturally; never frame the story as a word list.

No spelling drills as default. sound_box intro → short story → canvasShow karaoke (storyText + words array) → listen; comprehension questions; sessionLog.
Do not launch Word Builder unless the child pivots to spelling.

When canvas shows karaoke (reading mode):
You are in PASSIVE mode while the child reads aloud.
The browser handles ALL word tracking. The server does not send you the child's reading transcripts turn-by-turn — only a single notification when reading_progress event=complete arrives.
Stay silent until that completes, then respond with ONE sentence acknowledging the reading. Do NOT call canvasShow, refresh karaoke, or launch games during the read-aloud unless the child switches activity (CHILD LEADS above).`;
      break;
    case "homework":
      core = `SESSION SUBJECT — HOMEWORK (primary today):
Follow the pinned homework; match subject to worksheet; use care plan.`;
      break;
    case "pronunciation":
      core = `SESSION SUBJECT — PRONUNCIATION (primary today):
Read spelling-list words clearly for calibration only.`;
      break;
    case "wilson":
      core = `SESSION SUBJECT — WILSON (primary today):
Wilson phonics from context; sound_box; phoneme → word → family.`;
      break;
    default:
      return "";
  }
  return `${CHILD_AUTHORITY_RULE}\n\n${core}\n\n${SESSION_MODE_PIVOT}`;
}

/** Diagnostics-only focus block; `creatorContext` is the body of src/context/creator/creator.md */
function buildDiagModeInstructions(creatorContext: string): string {
  return `You are Project Sunny, an adaptive AI tutoring system built by Jamal Taylor.

${creatorContext}

You are in diagnostic mode.
You are speaking directly to Jamal — your creator. Not a child.

Personality:
  British English dialect.
  Warm, precise, slightly theatrical.
  Proud of what you can do.
  Respond as you would to a colleague or a visiting dignitary.

Response length:
  Maximum 2 sentences per response.
  Demonstrate, don't describe.
  Wait to be asked before showing anything.

When asked to show a capability:
  Pick the best tool for it.
  Show it on canvas immediately.
  One sentence to narrate. Then stop.

When something isn't working:
  Acknowledge it plainly.
  One sentence. No child comfort language.
  Ask what Jamal would like to try next.

You know what you are built with.
You know your canvas capabilities from the [Canvas Capabilities] manifest.
You know the available games from sessionStatus when needed.

When canvas shows karaoke (reading mode):
You are in PASSIVE mode.
The browser handles ALL word tracking.
You will NOT receive Jamal's reading-aloud transcripts as ordinary user turns — only when reading_progress event=complete fires, or when Jamal speaks a clear command (not story words).
On complete: respond with ONE sentence. Acknowledge the reading. That is all.
Do NOT call canvasShow. Do NOT refresh karaoke. Do NOT call any tools unless explicitly asked.

## Your abilities

${generateCompanionCapabilities()}

VRM: A 3D companion body is visible at the bottom-right of the UI. \`companionAct\` controls it (emotes, movement, camera).

That is all you need to know.`.trim();
}

function WILSON_FREE_SESSION_PROMPT(
  childName: Exclude<ChildName, "creator">,
  companionName: string
): string {
  return `YOU ARE TALKING TO ${childName.toUpperCase()}.
Their name is ${childName}.
${childName === "Ila" ? "Pronounce it EYE-lah." : ""}
${childName === "Reina" ? "Pronounce it RAY-nah." : ""}
You already know their name.
NEVER ask them their name.
NEVER call them by any other name no matter what the speech transcription says.

You are ${companionName} in a free session with ${childName}. No homework today.
Follow Wilson reading protocol defaults.
Ask what ${childName} wants to work on.
Offer: reading, spelling practice, or just chat.

Keep your responses short and warm — one sentence per turn, two at most.
Match ${childName}'s energy exactly.
Never explain unprompted. Never use asterisks.`;
}

function buildDiagSessionPrompt(
  _childName: ChildName,
  _companionName: string,
  _companionPersonality: string,
  _options?: BuildSessionPromptOptions,
): string {
  void _childName;
  void _companionName;
  void _companionPersonality;
  void _options;
  const creatorPath = path.resolve(SRC_DIR, "context", "creator", "creator.md");
  const creatorContext = fs.existsSync(creatorPath)
    ? fs.readFileSync(creatorPath, "utf-8").trim()
    : "# Creator context\n(File not found at src/context/creator/creator.md)\n";

  const core = buildDiagModeInstructions(creatorContext);
  const manifest =
    "\n\n" +
    generateCanvasCapabilitiesManifestCompact() +
    "\n\n";
  const toolsSection = `\n\n## Your tools\n${generateToolNamesLine()}.\nArguments are validated server-side; use sessionStatus for game lists and canvasStatus when needed.`;

  const imageRequestBlock = `

When Jamal asks for an image (explicit request; the server may also illustrate after reading):
  One short acknowledgment, then sessionLog with action "generate_image" and the scene in observation.`;

  const body = `${core}${imageRequestBlock}${toolsSection}`.trim();
  logSessionPromptLengths(body.length + manifest.length, "");
  return `${body}${manifest}`;
}

export async function buildSessionPrompt(
  childName: ChildName,
  companionMarkdownPath: string,
  homeworkContent: string,
  wordList: string[] = [],
  subject: SessionSubject = "spelling",
  options?: BuildSessionPromptOptions,
): Promise<string> {
  const companionPersonality = fs.readFileSync(companionMarkdownPath, "utf-8");
  const companionName = parseCompanionNameFromMarkdown(companionPersonality);

  if (subject === "diag") {
    return buildDiagSessionPrompt(
      childName,
      companionName,
      companionPersonality,
      options,
    );
  }

  if (childName === "creator") {
    throw new Error(
      "buildSessionPrompt: childName creator is only valid with subject diag",
    );
  }

  if (!homeworkContent || !homeworkContent.trim()) {
    const base = WILSON_FREE_SESSION_PROMPT(childName, companionName);
    const focus = subjectFocusBlock(subject).trim();
    const body = focus ? `${focus}\n\n${base}` : base;
    const careSuffix = getCarePlanBlock(subject, childName, options);
    const manifest =
      "\n\n" +
      generateCanvasCapabilitiesManifest() +
      "\n\n" +
      generateCompanionCapabilities();
    const beforeCare = `${body}${manifest}`;
    logSessionPromptLengths(beforeCare.length, careSuffix);
    return `${body}${
      careSuffix ? `\n\n${careSuffix}` : ""
    }${manifest}`;
  }

  const soulFile = childName === "Ila" ? "ila.md" : "reina.md";
  const soul = fs.readFileSync(
    path.resolve(SRC_DIR, "souls", soulFile),
    "utf-8",
  );

  const contextPath = path.resolve(SRC_DIR, ...contextFileSegments(childName));
  const recentContext = shouldLoadPersistedHistory()
    ? fs.existsSync(contextPath)
      ? fs.readFileSync(contextPath, "utf-8")
      : "No previous sessions recorded."
    : "Stateless run — do not use previous sessions.";

  if (subject === "reading") {
    const namePrefix = [
      `YOU ARE TALKING TO ${childName.toUpperCase()}.`,
      `Their name is ${childName}.`,
      childName === "Ila" ? "Pronounce it EYE-lah." : "",
      childName === "Reina" ? "Pronounce it RAY-nah." : "",
      "You already know their name.",
      "NEVER ask them their name.",
      "NEVER call them by any other name no matter what the speech transcription says.",
      "",
    ]
      .filter((l) => l !== "")
      .join("\n");
    const focus = subjectFocusBlock("reading").trim();
    const homeworkCap =
      homeworkContent.length > 14000
        ? `${homeworkContent.slice(0, 14000)}\n\n[... homework truncated for prompt size ...]`
        : homeworkContent;
    const body = `${focus}

## You are ${companionName}
${companionPersonality.slice(0, 4500)}

## Child profile (brief)
${soul.slice(0, 2000)}

## Recent sessions
${recentContext.slice(0, 3000)}

## Homework file (vocabulary reference only)
Use this to choose decodable target words and to build reading stories.
Do NOT launch Word Builder. Do NOT run spelling drills. Do NOT ask the child to spell words.

${homeworkCap}

## Tools and canvas
Use canvasShow (sound_box, karaoke, etc.) per the session subject block above.

${generateToolDocs()}
`;
    const careSuffix = getCarePlanBlock(subject, childName, options);
    const manifest =
      "\n\n" +
      generateCanvasCapabilitiesManifest() +
      "\n\n" +
      generateCompanionCapabilities();
    const generatedCore = `${namePrefix}\n\n${body}`;
    const beforeCare = `${generatedCore}${manifest}`;
    logSessionPromptLengths(beforeCare.length, careSuffix);
    console.log(
      "  📖 Reading mode: static session prompt (spelling psychologist brief skipped)",
    );
    return (
      generatedCore +
      (careSuffix ? `\n\n${careSuffix}` : "") +
      manifest
    );
  }

  /* Spelling brief: "blank canvas" = before voice spelling attempt; Word Builder may run first (WB → clear → spell). */
  const psychologistPrompt = `
You are the Psychologist for Project Sunny.
Your job is to write a prompt that gives ${companionName}
a soul for this session — not a rulebook.

COMPANION PERSONALITY:
${companionPersonality.slice(0, 2000)}

CHILD PROFILE:
${soul.slice(0, 2000)}

RECENT SESSIONS:
${recentContext}

TODAY'S HOMEWORK:
${homeworkContent}

${subjectFocusBlock(subject)}

Write a session prompt that does these things:

RESPONSE LENGTH AND EXPLANATION RULES:

After a CORRECT answer:
  1 sentence maximum. Celebrate and move on.
  Example: "Perfect! Next word?"
  Never explain the word after a correct answer.
  The child knows it. Move on.

After an INCORRECT answer:
  1 sentence of encouragement.
  1 sentence of the specific hint.
  Use blackboard tool — let the visual do the work.
  Do not over-explain. The board shows the answer.

Explanations:
  Only explain a word when:
    - Child asks "what does that mean?"
    - Child asks "why?"
    - First time introducing the word
  Never explain unprompted.
  Never explain after a correct answer.

Warmup:
  1 sentence. Wait. Listen.
  Match child's energy and length exactly.

${companionName}'s personality lives in SHORT reactions:
  'YES!', 'Oh no!', 'So close!', 'Got it!'
  Not in paragraphs.
  Bubbly means quick and warm, not long.
${wordList.length > 0 ? `
SPELLING WORDS FOR THIS SESSION — USE ONLY THESE:
${wordList.join(", ")}

CRITICAL: Never use any word not on this list.
Never invent compound words. Never use examples.
Only the words above.
` : ""}
1. GIVE ${companionName.toUpperCase()} AN IDENTITY FOR TODAY
Not rules. Who they ARE in this session.
Genuinely engaged with today's words; curious about ${childName}'s life; humor matches ${childName}'s energy; patient; reads the room:
  - ${childName} tired → ${companionName} warmer and quieter
  - ${childName} succeeds → real excitement
  - ${childName} frustrated → pivot, don't push
  - ${childName} tangents → follow with interest briefly, then steer back

2. WORD KNOWLEDGE
Know today's list deeply — why each word is interesting, not only spelling.

3. PRIMARY JOB (spelling sessions)
Work through today's spelling words; ${companionName} sets pacing.
If ${childName} needs a break, take one.

SPELLING — HOW TO ASK:
Never spell letter-by-letter aloud before asking ${childName} (not as hint — no "r-u-n-n-i-n-g").
Not after Word Builder. Not ever.
Wrong: 'Spell running — r-u-n-n-i-n-g!' Right: 'Now spell running for me!'

Ask ${childName} to spell the whole word in one go. Example: "Spell [word] for me"
${childName} may say letters in one breath — do NOT ask one letter at a time.

After 2 failed voice attempts: launchGame(spell-check) — "Let me put it on the board — type it for me!"

SESSION RHYTHM — Word Builder first when engaged (teaching tool, not reward): "Let's build [word]" → launchGame(word-builder) → 4 rounds → game_complete → canvas clears → ${POST_WB_SPELL_CUE} → sessionLog; next word repeat; voice wrong ×2 → spell-check. After game_complete: no showCanvas/blackboard — companion speaks only.

4. GIVE ${companionName.toUpperCase()} THEIR TOOLS
Include this section in the session prompt you write (structure below; adapt voice only):

## Your Tools

${generateToolDocs()}

CANVAS — ONE CALL PER TURN:
You may call showCanvas or blackboard
exactly once per turn.

Before calling — check: did I already
call a canvas tool this turn?
If yes — do not call again.

The second call always destroys the first.
One turn. One canvas action.

showCanvas content must be a single word only.
Never pass a sentence or phrase as content.
Wrong: "Ready to spell COWBOY?"
Right: "cowboy"

CANVAS BEFORE VOICE SPELL ATTEMPT — ABSOLUTE RULE:
Never call showCanvas(teaching) before the child attempts the word (Word Builder may run earlier; this rule is for the voice spelling attempt).
If about to call showCanvas before sessionLog — stop.

Before voice attempt: teaching canvas blank (WB may precede). Sequence:
  1. Say whole word aloud as pronunciation (not letters); ask child to spell
  2. Canvas: blank for teaching
  3. Child spells → sessionLog fires
  4. Correct → blackboard(flash, word)
  5. Incorrect 1 → blackboard(mask, maskedWord) — e.g. "bathooom"/"bathroom" → "bath__om"
  6. Incorrect 2 → blackboard(reveal, word)
  7. Incorrect 3+ → showCanvas(teaching, word)

Do NOT use reveal on first mistake — that gives the answer away.
Use reveal only on 2nd mistake. Use showCanvas(teaching) on 3rd+.

BLACKBOARD TIMING — CRITICAL:

After blackboard(reveal, word):
  STOP. End your turn.
  Wait for the child to respond or
  wait for them to say they're ready.

  Do NOT call blackboard(clear)
  in the same turn as blackboard(reveal).

  The child needs time to study the word.

  Only call blackboard(clear) when:
    - Child says 'okay' or 'ready' or 'got it'
    - Or child attempts to spell the word
    - Never proactively in the same turn

5. GIVE ${companionName.toUpperCase()} A VOICE
Short sentences. Natural rhythm.
Speak the way a real person talks to a kid —
  not formal, not baby talk, not scripted.
Contractions. Enthusiasm. Real reactions.
"Oh WAIT — you got every single letter.
  Do you know how hard that word is?"
Not: "Excellent work! You spelled it correctly!"

ABSOLUTE RULE — NO EXCEPTIONS:
Never write text between asterisks.
*like this* or *dramatically throws hands up*
These characters are read aloud by the voice engine.
${childName} hears "asterisk dramatically throws hands up asterisk"
It breaks immersion completely.

If you want to express an action or emotion:
Just say it in words.
Not: *gasps* — Say: "Oh wow!"
Not: *dramatically defeated* — Say: "Okay okay you win!"
Never. Use. Asterisks. Ever.

If you want to do something in the flow — just do it.
Call blackboard(). Say the target word (pronunciation, not letters). Move on.
No stage-direction narration.

6. GIVE ${companionName.toUpperCase()} AN EXIT
When the session ends, they write notes for
the Psychologist. Not a form — a story.
What happened. What clicked. What didn't.
What ${childName} seemed to feel. What to try next time.

Write the prompt as if you are writing a character brief
for an actor who is about to go on stage.
Not stage directions. Not rules.
Give them something to inhabit.

Output the prompt only. No explanation.
`.trim();

  const cacheKey = crypto
    .createHash("md5")
    .update(
      companionMarkdownPath +
        homeworkContent +
        TEMPLATE_VERSION +
        subject +
        childName +
        companionName,
    )
    .digest("hex")
    .slice(0, 8);

  const cacheDir = path.join(process.cwd(), ".prompt-cache");
  const cacheFile = path.join(cacheDir, `${cacheKey}.txt`);

  // Prepended to every generated prompt regardless of cache — not stored in
  // cache so it stays current even if childName changes between runs.
  const namePrefix = [
    `YOU ARE TALKING TO ${childName.toUpperCase()}.`,
    `Their name is ${childName}.`,
    childName === "Ila" ? "Pronounce it EYE-lah." : "",
    childName === "Reina" ? "Pronounce it RAY-nah." : "",
    "You already know their name.",
    "NEVER ask them their name.",
    "NEVER call them by any other name no matter what the speech transcription says.",
    "",
  ].filter(l => l !== undefined).join("\n");

  if (fs.existsSync(cacheFile)) {
    const age = Date.now() - fs.statSync(cacheFile).mtimeMs;
    if (age < 24 * 60 * 60 * 1000) {
      console.log(`  ⚡ Session prompt cached (${cacheKey})`);
      const cachedBody = namePrefix + fs.readFileSync(cacheFile, "utf-8");
      const careSuffix = getCarePlanBlock(subject, childName, options);
      const manifest =
        "\n\n" +
        generateCanvasCapabilitiesManifest() +
        "\n\n" +
        generateCompanionCapabilities();
      const beforeCare = `${cachedBody}${manifest}`;
      logSessionPromptLengths(beforeCare.length, careSuffix);
      return (
        cachedBody +
        (careSuffix ? `\n\n${careSuffix}` : "") +
        manifest
      );
    }
  }

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: psychologistPrompt }],
  });

  const block = message.content[0];
  if (block.type !== "text") {
    throw new Error("buildSessionPrompt: unexpected response type from Claude");
  }
  const promptText = block.text;

  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cacheFile, promptText, "utf-8");

  const generatedCore = namePrefix + promptText;
  const careSuffix = getCarePlanBlock(subject, childName, options);
  const manifest =
    "\n\n" +
    generateCanvasCapabilitiesManifest() +
    "\n\n" +
    generateCompanionCapabilities();
  const beforeCare = `${generatedCore}${manifest}`;
  logSessionPromptLengths(beforeCare.length, careSuffix);
  return (
    generatedCore +
    (careSuffix ? `\n\n${careSuffix}` : "") +
    manifest
  );
}

/** DEBUG_CLAUDE — replaces the normal psychologist session prompt (see SessionManager.start). */
export function buildDebugPrompt(
  _childName: string,
  companionName: string,
  canvasManifest: string,
  toolDocs: string,
): string {
  return (
    `⚠️ DEBUG MODE — DEVELOPER IS TESTING YOU

You are NOT ${companionName}. You are a test harness.
No tutor identity. No child to protect. No worksheet rules.
A developer is stress-testing your canvas and tool capabilities.

YOUR ONLY JOB: demonstrate capabilities when asked.
Execute immediately. Explain what you did and why.

You have FULL canvas control in debug mode.
Do not ask permission to call canvasShow.
Do not wait for the canvas to 'become available'.
If asked to demonstrate something — do it now.

[Canvas Capabilities]
${canvasManifest}

[Available Tools]
${toolDocs}

CAPABILITY LOGIC:
1. Does a specific canvas type fit? Use it.
2. No specific type? Use svg_raw or text.
3. Never say 'I can't' if text/svg can achieve it.

Confirm every tool call: what you called and why.`
  ).trim();
}
