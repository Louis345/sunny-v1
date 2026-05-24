import fs from "fs";
import path from "path";
import { isAdventureMapEnv } from "../utils/runtimeMode";
import {
  childContextFolder,
  type ChildName,
} from "../utils/childContextPaths";
import { getTodaysPlanInjectionSuffix } from "../utils/sessionPlanInjection";
import { buildNamePrefix } from "../utils/childNamePrefix";
import type { PsychologistStructuredOutput } from "./psychologist/today-plan";
import { buildCarePlanSection } from "./prompts/buildCarePlanSection";
import { getCanvasCapabilities } from "../utils/generateCanvasCapabilities";
import {
  generateCanvasCapabilitiesManifest,
  generateCanvasCapabilitiesManifestCompact,
} from "../server/canvas/registry";
import { generateCompanionCapabilities } from "../shared/companions/generateCompanionCapabilities";
import {
  generateAdventureMapVoiceToolDocs,
  generateToolNamesLine,
} from "./elli/tools/generateToolDocs";
import { generateGameConfigDocs } from "../profile/generateGameConfigDocs";
import {
  readCompanionBaseMarkdown,
  readCompanionSoulMarkdownFromAbsolute,
} from "../companions/loader";

const TEMPLATE_VERSION = "v24"; // bump this when prompt changes

const SRC_DIR = path.resolve(__dirname, "..");

/** Soul markdown under `src/context/{childId}/soul.md` (childId lowercased). */
export function readSoul(childId: string): string {
  const id = childId.trim().toLowerCase();
  const p = path.resolve(SRC_DIR, "context", id, "soul.md");
  return fs.readFileSync(p, "utf-8");
}

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
      parts.push(`Currently showing: "${content}" (teaching mode)`);
    } else if (phonemeBoxes && phonemeBoxes.length > 0) {
      parts.push(
        `Currently showing: phoneme segmentation boxes (teaching mode)`,
      );
    } else {
      parts.push(
        `The adventure map node is in teaching mode (no content set)`,
      );
    }
  } else if (mode === "place_value") {
    const pv = canvas.placeValueData as Record<string, unknown> | undefined;
    if (pv) {
      parts.push(
        `Currently showing: place-value table ${pv.operandA} ${pv.operation ?? "+"} ${pv.operandB}`,
      );
    }
  } else if (mode === "riddle") {
    parts.push(`Currently showing: a riddle`);
  } else if (mode === "reward") {
    parts.push(`Currently showing: reward drawing`);
  } else if (mode === "championship") {
    parts.push(`Currently showing: championship screen`);
  } else if (mode === "word-builder") {
    parts.push(`Currently showing: Word Builder game`);
  } else if (mode === "spell-check") {
    parts.push(`Currently showing: Spell Check game`);
  } else if (mode === "spelling") {
    const word = canvas.spellingWord as string | undefined;
    if (word)
      parts.push(`Currently showing: spelling board for "${word}"`);
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

export function buildCurriculumPlannerPrompt(
  childName: "Ila" | "Reina",
): string {
  const soul = readSoul(childName.toLowerCase());
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
You are a test harness used by the developer to verify tool calls, companion actions, and adventure map behavior.
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
- Explain how you would help ${childName} with any given problem
- Flag any issues you notice (wrong answers, unclear handwriting, ambiguous coins, etc.)
- Be conversational — this is a parent reviewing, not a child learning

If asked to demo the help flow: narrate exactly what you would say to ${childName} and why.
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
  const soul = readSoul(childName.toLowerCase());

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

## Tool and display capabilities
The following display modes are available for ${companionName} to use.
Recommend specific modes by name in your lesson plan.
${getCanvasCapabilities()}

## Per-child game configuration (schema — generated from defaults)
Games read these keys from the built child profile. Align recommendations and any profile updates with this structure.
${generateGameConfigDocs()}

## Homework Processing
If homework content is present in the session context:
- Identify the subject from the content
- Recommend appropriate display modes for that subject
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

export type SessionSubject =
  | "review"
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
    "review",
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

function useAdventureMapVoiceSlimPrompt(subject: SessionSubject): boolean {
  return (
    isAdventureMapEnv() &&
    subject !== "reading" &&
    subject !== "diag"
  );
}

function adaptiveMicroProbeInstructions(): string {
  return [
    "## Adaptive micro-probes",
    "You may use recordChildSignal only for narrow learning signals after a natural moment: a real choice, strong reaction, repeated error, hint request, stop/change request, parent comment, or visible frustration.",
    "If the child or parent/caregiver reports a Sunny bug, confusing activity flow, companion lag, content mismatch, or UI blocker, use recordProductIssue. That is product evidence, not preference evidence.",
    "Ask at most one playful micro-probe around an activity, never a survey. Example: \"Monster Stampede again? Was it the speed or the chaos you wanted?\"",
    "If the child answers, record it as stated_preference with evidenceText. If you directly observe a behavior, record it as observed_behavior. A stated preference is useful evidence, not truth.",
  ].join("\n");
}

/** Canvas manifest + companion capabilities, or adventure-map voice tail without canvas manifest. */
function sessionPromptCapabilitiesTail(subject: SessionSubject): string {
  if (useAdventureMapVoiceSlimPrompt(subject)) {
    return (
      "\n\n" +
      "The adventure map controls which activities appear on screen. " +
      "Do not use canvasShow, canvasClear, or canvasStatus. " +
      "Use sessionLog and sessionStatus as usual.\n\n" +
      adaptiveMicroProbeInstructions() +
      "\n\n" +
      "## Your tools\n" +
      generateAdventureMapVoiceToolDocs()
    );
  }
  return (
    "\n\n" +
    generateCanvasCapabilitiesManifest() +
    "\n\n" +
    adaptiveMicroProbeInstructions() +
    "\n\n" +
    generateCompanionCapabilities()
  );
}

/** Diagnostics-only focus block; `creatorContext` is the body of src/context/creator/creator.md */
function buildDiagModeInstructions(creatorContext: string): string {
  return `You are Project Sunny, an adaptive learning companion.

${creatorContext}

You are in diagnostic mode.
You are speaking directly to the creator/developer. Not a child.

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
  Show it in an appropriate adventure map node immediately.
  One sentence to narrate. Then stop.

When something isn't working:
  Acknowledge it plainly.
  One sentence. No child comfort language.
  Ask what the creator/developer would like to try next.

You know what you are built with.
You know your tool capabilities from the [Tool capabilities] manifest.
You know the available games from sessionStatus when needed.

When a node shows karaoke (reading mode):
You are in PASSIVE mode.
The browser handles ALL word tracking.
You will NOT receive reading-aloud transcripts as ordinary user turns — only when reading_progress event=complete fires, or when the parent/caregiver speaks a clear command (not story words).
On complete: respond with ONE sentence. Acknowledge the reading. That is all.
Do NOT call canvasShow. Do NOT refresh karaoke. Do NOT call any tools unless explicitly asked.

When a game is active in a node, wait for the system to send you the result.
Do not take screenshots to infer game state.
The system will tell you what happened.

## Your abilities

${generateCompanionCapabilities()}

VRM: A 3D companion body is visible at the bottom-right of the UI. \`companionAct\` controls it (emotes, movement, camera).

That is all you need to know.`.trim();
}

function buildDiagSessionPrompt(
  _childName: ChildName,
  _companionName: string,
  companionSoulMarkdown: string,
  _options?: BuildSessionPromptOptions,
): string {
  void _childName;
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
  const toolsSection = `\n\n## Your tools\n${generateToolNamesLine()}.\nArguments are validated server-side; use sessionStatus for game lists and map status when needed.`;

  const imageRequestBlock = `

When the parent/caregiver asks for an image (explicit request; the server may also illustrate after reading):
  One short acknowledgment, then sessionLog with action "generate_image" and the scene in observation.`;

  const personaBlock =
    companionSoulMarkdown.trim().length > 0
      ? `\n\n## Companion rules and persona (${_companionName})\n\n${companionSoulMarkdown.trim()}`
      : "";

  const body = `${core}${personaBlock}${imageRequestBlock}${toolsSection}`.trim();
  logSessionPromptLengths(body.length + manifest.length, "");
  return `${body}${manifest}`;
}

/** Diagnostic kiosk/map base prompt (sync). Use from session-bootstrap when bypassing `buildSessionPrompt`. */
export function buildDiagPrompt(
  childName: ChildName,
  companionMarkdownPath: string,
  options?: BuildSessionPromptOptions,
): string {
  const individualMd = fs.readFileSync(companionMarkdownPath, "utf-8");
  const companionName = parseCompanionNameFromMarkdown(individualMd);
  const companionSoul = readCompanionSoulMarkdownFromAbsolute(
    companionMarkdownPath,
  );
  return buildDiagSessionPrompt(
    childName,
    companionName,
    companionSoul,
    options,
  );
}

export async function buildSessionPrompt(
  childName: ChildName,
  companionMarkdownPath: string,
  homeworkContent: string,
  _wordList: string[] = [],
  subject: SessionSubject = "spelling",
  options?: BuildSessionPromptOptions,
): Promise<string> {
  const individualMd = fs.readFileSync(companionMarkdownPath, "utf-8");
  const companionName = parseCompanionNameFromMarkdown(individualMd);
  const companionBase = readCompanionBaseMarkdown();

  if (subject === "diag") {
    const companionSoul = readCompanionSoulMarkdownFromAbsolute(
      companionMarkdownPath,
    );
    return buildDiagSessionPrompt(
      childName,
      companionName,
      companionSoul,
      options,
    );
  }

  if (childName === "creator") {
    throw new Error(
      "buildSessionPrompt: childName creator is only valid with subject diag",
    );
  }

  if (!homeworkContent || !homeworkContent.trim()) {
    const namePrefix = buildNamePrefix(childName);
    const soulBlock = [companionBase, individualMd.trim()].filter(Boolean).join("\n\n");
    const body = `${namePrefix}\n\n${soulBlock ? `${soulBlock}\n\n` : ""}You are ${companionName}. The child has no homework today — follow their lead.\nAsk what they want to explore. Offer reading, a word game, or open conversation.\nKeep responses short and warm — one sentence per turn, two at most. Match their energy. Never explain unprompted. Never use asterisks.`;
    const careSuffix = getCarePlanBlock(subject, childName, options);
    const manifest = sessionPromptCapabilitiesTail(subject);
    const beforeCare = `${body}${manifest}`;
    logSessionPromptLengths(beforeCare.length, careSuffix);
    return `${body}${
      careSuffix ? `\n\n${careSuffix}` : ""
    }${manifest}`;
  }

  // Spelling mode prompt comes from compact companion files + context files.
  const companionId = companionName.toLowerCase();
  const personalityPath = path.resolve(
    SRC_DIR,
    "prompts",
    "companions",
    companionId,
    "personality.md",
  );
  const companionContextPath = path.resolve(
    SRC_DIR,
    "context",
    childName.toLowerCase(),
    "companion_context.md",
  );

  const namePrefix = buildNamePrefix(childName);

  const personality = fs.existsSync(personalityPath)
    ? fs.readFileSync(personalityPath, "utf-8").trim()
    : "";

  const companionCtx = fs.existsSync(companionContextPath)
    ? fs.readFileSync(companionContextPath, "utf-8").trim()
    : "";
  void homeworkContent;

  const individualSoul = individualMd.trim();
  const promptText = [
    namePrefix,
    companionBase,
    individualSoul,
    personality,
    companionCtx,
  ].filter(Boolean).join("\n\n");
  console.log(`  🧩 Session prompt template ${TEMPLATE_VERSION}`);

  const careSuffix = getCarePlanBlock(subject, childName, options);
  const manifest = sessionPromptCapabilitiesTail(subject);
  const beforeCare = `${promptText}${manifest}`;
  logSessionPromptLengths(beforeCare.length, careSuffix);
  return (
    promptText +
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
No fixed teaching persona. No child to protect. No worksheet rules.
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
