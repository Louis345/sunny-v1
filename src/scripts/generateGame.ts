import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import type { ChildProfile } from "../shared/childProfile";

export const HAIKU_MODEL = "claude-haiku-4-5-20251001";
export const SONNET_MODEL = "claude-sonnet-4-20250514";

const GAME_GOAL_BY_TYPE: Record<string, string> = {
  spelling_test: `This game prepares a child for a spelling test.
The child must PRODUCE each spelling word from memory.
Correct mechanics: hear word then type it from memory,
see word then hide it then type it, fill missing letters,
unscramble scrambled letters to form the word.
Wrong mechanics: alphabetizing, sorting, matching words
to definitions, drag-and-drop ordering, multiple choice
where child picks a word from a list.
Every single interaction must require the child to
actively spell the word — not recognize or sort it.`,

  reading: `This game tests reading comprehension.
Ask questions about the passage or vocabulary.
Correct mechanics: multiple choice questions about content,
written short answers, fill in the blank from context.
Wrong mechanics: spelling drills, math problems, sorting.`,

  math: `This game practices the math skills on this worksheet.
Correct mechanics: solve problems shown, input numeric answers,
work through steps to reach a solution.
Wrong mechanics: spelling, reading comprehension, sorting.`,

  coins: `This game practices counting coins and money.
Correct mechanics: count coin values shown, identify correct
coin combinations to make a total, match amounts.
Wrong mechanics: spelling, alphabetizing, reading questions.`,

  clocks: `This game practices telling time.
Correct mechanics: read clock faces and write the time,
match digital time to analog clock, set clock hands.
Wrong mechanics: spelling, math equations, sorting.`,

  generic: `This game practices the specific skills shown
in the homework content provided. Analyze the content
and build the most appropriate interactive mechanic.
Match the game mechanic to the skill being practiced.`,
};

const REFERENCE_HTML_PATH = path.join(
  process.cwd(),
  "web",
  "public",
  "games",
  "chimp-quest.html",
);

const TEXT_FROM_PDF_PROMPT = `Extract ALL readable text from this document 
               in reading order. Return JSON only:
               {
                 "title": string,
                 "fullText": string,
                 "pages": [{ "pageNum": number, "text": string }]
               }
               Preserve sentences and paragraphs.
               Skip page numbers and headers.
               Include all story/book content.`;

const EXTRACTION_PROMPT = `Extract this homework assignment as JSON only.
No markdown. No explanation. Just JSON:
{
  topic: string,
  type: 'comprehension'|'spelling'|'math'|'phonics',
  gradeLevel: number,
  concepts: string[],
  vocabularyWords: [{ word: string, definition: string }],
  sightWords: string[],
  warmUpWords: string[],
  problems: [{
    id: number,
    question: string,
    type: 'multiple_choice'|'written'|'fill_in',
    options: string[] or null,
    correctAnswer: string or null,
    keyPoints: string[] or null,
    hint: string
  }]
}`;

export function textFromMessage(resp: Anthropic.Message): string {
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

export function stripJsonFences(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }
  return t;
}

export function parseExtractedJson(raw: string): unknown {
  const stripped = stripJsonFences(raw);
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(stripped.slice(start, end + 1));
    }
    throw new Error("Could not parse extraction as JSON");
  }
}

export function stripHtmlFences(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t
      .replace(/^```(?:html)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }
  return t;
}

const REFERENCE_HTML_MAX_CHARS = 24_000;

function loadOptionalReferenceHtml(): string {
  if (!fs.existsSync(REFERENCE_HTML_PATH)) return "";
  const raw = fs.readFileSync(REFERENCE_HTML_PATH, "utf8");
  if (raw.length <= REFERENCE_HTML_MAX_CHARS) return raw;
  return `${raw.slice(0, REFERENCE_HTML_MAX_CHARS)}\n<!-- truncated for prompt size -->\n`;
}

type CliArgs = {
  childId: string;
  pdfOverridePath?: string;
  opus: boolean;
  preview: boolean;
};

type InputSource =
  | { kind: "pdf"; filePath: string }
  | { kind: "txt"; filePath: string };

function parseCliArgs(argv: string[]): CliArgs {
  let childId: string | undefined;
  let pdfOverridePath: string | undefined;
  let opus = false;
  let preview = false;

  for (const arg of argv) {
    if (arg.startsWith("--child=")) {
      childId = arg.slice("--child=".length).trim();
      continue;
    }
    if (arg.startsWith("--pdf=")) {
      const raw = arg.slice("--pdf=".length).trim();
      if (raw) pdfOverridePath = path.resolve(process.cwd(), raw);
      continue;
    }
    if (arg === "--opus") {
      opus = true;
      continue;
    }
    if (arg === "--preview") {
      preview = true;
    }
  }

  if (!childId) {
    throw new Error("Missing required argument --child=<childId>");
  }

  return { childId, pdfOverridePath, opus, preview };
}

function firstMatchingFile(
  dirPath: string,
  ext: ".pdf" | ".txt",
): string | undefined {
  if (!fs.existsSync(dirPath)) return undefined;
  const entries = fs.readdirSync(dirPath);
  const match = entries.find((entry) => entry.toLowerCase().endsWith(ext));
  return match ? path.join(dirPath, match) : undefined;
}

function resolveInputSource(args: CliArgs): InputSource {
  if (args.pdfOverridePath) {
    if (!fs.existsSync(args.pdfOverridePath)) {
      throw new Error(`--pdf path not found: ${args.pdfOverridePath}`);
    }
    const ext = path.extname(args.pdfOverridePath).toLowerCase();
    if (ext === ".pdf") return { kind: "pdf", filePath: args.pdfOverridePath };
    if (ext === ".txt") return { kind: "txt", filePath: args.pdfOverridePath };
    throw new Error(
      `--pdf must point to a .pdf or .txt file: ${args.pdfOverridePath}`,
    );
  }

  const incomingDir = path.join(
    process.cwd(),
    "src",
    "context",
    args.childId,
    "homework",
    "incoming",
  );
  const firstPdf = firstMatchingFile(incomingDir, ".pdf");
  if (firstPdf) return { kind: "pdf", filePath: firstPdf };

  const firstTxt = firstMatchingFile(incomingDir, ".txt");
  if (firstTxt) return { kind: "txt", filePath: firstTxt };

  throw new Error(
    `No input found for child "${args.childId}". Expected a .pdf or .txt in ${incomingDir}`,
  );
}

function resolveGameGoalHomeworkType(
  homeworkType?: string,
): keyof typeof GAME_GOAL_BY_TYPE {
  const t = (homeworkType ?? "generic").trim().toLowerCase();
  if (t === "spelling" || t === "spelling_test") return "spelling_test";
  if (t === "comprehension" || t === "reading") return "reading";
  if (t === "math") return "math";
  if (t === "coins") return "coins";
  if (t === "clocks") return "clocks";
  if (t in GAME_GOAL_BY_TYPE) return t as keyof typeof GAME_GOAL_BY_TYPE;
  return "generic";
}

type SonnetChildProfile = ChildProfile & {
  dyslexiaMode?: boolean;
  rewardPreferences?: unknown;
};

function buildSonnetPrompt(
  extractedJson: string,
  referenceHtml: string,
  homeworkType?: string,
  testDate?: string,
  childProfile?: SonnetChildProfile,
  validationFeedback?: string,
): string {
  const validationPreamble =
    validationFeedback && validationFeedback.trim().length > 0
      ? `PREVIOUS GENERATION FAILED VALIDATION:
${validationFeedback.trim()}
Fix these issues in this generation.

`
      : "";
  const goalKey = resolveGameGoalHomeworkType(homeworkType);
  const gameGoal = GAME_GOAL_BY_TYPE[goalKey] ?? GAME_GOAL_BY_TYPE.generic;
  const testDateLine = testDate ? `Test/due date: ${testDate}\n` : "";
  const purposeBlock = `GAME PURPOSE AND MECHANICS:
${gameGoal}

${testDateLine}
UNIVERSAL ASSESSMENT LAW:
If the game tests whether a child knows something,
never show them the answer while they answer.

For spelling games specifically:
- Never display the word list while the child is spelling
- Flash word briefly → hide it → child recalls from memory
- This is how real spelling tests work
- Showing the word while asking them to type it
  measures copying ability, not spelling ability
- Word list may appear BETWEEN questions as reference
  (after submitting, before next word begins)
  but NEVER during active input

This law applies regardless of child profile.
It is a property of correct assessment design.

`;

  const profileBlock = childProfile
    ? `
CHILD PROFILE — drives all visual and pacing decisions:
${JSON.stringify(
  {
    dyslexiaMode: childProfile.dyslexiaMode ?? false,
    ui: childProfile.ui,
    interests: childProfile.interests,
    attentionWindow_ms: childProfile.attentionWindow_ms,
    rewardPreferences: childProfile.rewardPreferences,
    level: childProfile.level,
  },
  null,
  2,
)}

Design rules:
- dyslexiaMode true → high contrast, no clutter,
  large tap targets, clean readable layout
- interests → theme the game world around these
  (if child likes dinosaurs → dinosaur world,
   if child likes space → space world, etc.)
- attentionWindow_ms → pace the game to this window,
  fewer items if shorter attention window
- rewardPreferences → match feedback style to profile
- Profile improves over time — your design reflects
  current data, not static assumptions
- NEVER hardcode child name — use GAME_PARAMS.childId
- NEVER hardcode colors or fonts — derive from profile
`
    : "";

  const referenceBlock =
    referenceHtml.trim() === ""
      ? ""
      : `REFERENCE HTML (manually built — mirror DOM/CSS structure and polish; replace all questions and copy with the new homework):
<<<REFERENCE_HTML>>>
${referenceHtml}
<<<END_REFERENCE_HTML>>>

`;

  return `${validationPreamble}${purposeBlock}${referenceBlock}Generate a complete single-file interactive HTML game for Ila (age 8, grade 2).
Match this EXACT visual style:
- Background: rich dark gradient (not flat dark blue).
  Use: linear-gradient(160deg, #064e3b, #065f46, #047857, #1a3a1a)
- Fonts: Fredoka One (titles), Nunito (body) from Google Fonts
- Quest giver: fixed bottom-left, oval shape with gradient,
  emoji + name label + animated mouth div
  (div.mouth that toggles class 'talking' on interval)
- Speech bubble: white rounded card next to quest giver
- Elli corner: fixed bottom-right, purple circle, 🌟 emoji
- Vocabulary strip: semi-transparent card with pill-shaped word chips
- Question cards: white cards with colored top border (4px gradient)
- Multiple choice: full-width buttons with letter circles (A/B/C/D)
- Written: textarea with focus border glow
- Progress: thin bar top with XP chip
- Confetti: particle explosion on correct answer (multiple choice full credit, or written score === 1)
- Tab navigation: Q1 Q2 Q3... pill buttons

REQUIRED: Add immediately after <body> tag:
<div id='sunny-companion' style='position:fixed;
bottom:20px;right:20px;width:120px;height:120px;
z-index:9999;pointer-events:none;'></div>
This is mandatory. Never omit it.

BEFORE game starts:
  Show modal overlay:
  '📚 Today's Quest: {n} questions worth {n*10} XP total'
  (n = number of problems in homework JSON)
  Elli emoji bouncing in modal
  [Let's Go! button] dismisses modal

WRITTEN / fill_in grading — call Sunny server Haiku (same origin as iframe):
  On submit for type "written" or "fill_in", POST JSON to /api/game-grade-written with:
  { "question": <problem.question>, "studentAnswer": <textarea value>,
    "keyPoints": <problem.keyPoints || []>, "gradeLevel": <homework.gradeLevel> }
  Parse JSON response: { "correct": boolean, "partial": boolean, "feedback": string, "score": 0 | 0.5 | 1 }
  Award XP per written question: score 1 → 10 XP + confetti(); score 0.5 → 5 XP + encouraging feedback (no confetti); score 0 → 0 XP + show problem.hint
  If fetch fails, show friendly message + hint, 0 XP.

Multiple choice / exact fill: 10 XP + confetti on correct; 0 XP on wrong; show feedback.

postMessage on complete:
  window.parent.postMessage({
    type: 'node_complete',
    accuracy: (total XP earned) / (n * 10),
    completed: true,
    timeSpent_ms: Date.now() - startTime,
    childId: GAME_PARAMS.childId
  }, '*');

COMPANION EVENTS — fire these via postMessage:
After _contract.js loads, call fireCompanionEvent() at:
- correct answer: fireCompanionEvent('correct_answer', 
    { word: currentWord, xp: 10 })
- wrong answer: fireCompanionEvent('wrong_answer', 
    { question: problem.question })
- streak of 3: fireCompanionEvent('streak_3', 
    { streak: 3 })
- game complete: fireCompanionEvent('game_complete', 
    { accuracy, xpEarned: totalXP })
- 10 seconds idle: fireCompanionEvent('idle_10s', {})

fireCompanionEvent is already defined in _contract.js
which is loaded at top of <head>
${profileBlock}
Homework data:
${extractedJson}

Return raw HTML only. No markdown.`;
}

function buildOpusPrompt(
  extractedJson: string,
  sonnetGame: string,
  childId: string,
): string {
  return `You are creating the FINAL BOSS NODE for a 
    child's homework session in Project Sunny.
    
    Child profile:
      - childId: ${childId}
      - Age 8, Grade 2, dyslexia + ADHD
      - Wilson Step 4, reading level 3
      - Lexend font required, 42px minimum
      - Cream background #FFF8F0
    
    The child has already played through these nodes:
    - Pronunciation game
    - Karaoke reading
    - Word builder
    - Quest game (see below)
    
    Previous quest game for reference:
    ${sonnetGame.slice(0, 8000)}
    
    Homework content:
    ${extractedJson}
    
    Create a BOSS NODE that:
    1. Is harder than the quest game
    2. Tests mastery not just recognition
    3. Has a dramatic boss battle feel
    4. Uses same visual style as quest game
    5. Includes companion events via fireCompanionEvent()
    6. Accepts URL params via GAME_PARAMS from _contract.js
    7. Posts node_complete on finish
    8. No hardcoded child names — use GAME_PARAMS.childId
    9. Lexend font, cream bg, large text for dyslexia
    10. 5-7 minutes to complete
    
    Return raw HTML only. No markdown.`;
}

export async function generateQuestGameHtml(args: {
  client: Anthropic;
  extractedJsonPretty: string;
  maxTokens?: number;
  homeworkType?: string;
  testDate?: string;
  childProfile?: SonnetChildProfile;
  validationFeedback?: string;
}): Promise<string> {
  const referenceHtml = loadOptionalReferenceHtml();
  const genPrompt = buildSonnetPrompt(
    args.extractedJsonPretty,
    referenceHtml,
    args.homeworkType,
    args.testDate,
    args.childProfile,
    args.validationFeedback,
  );
  const genResp = await args.client.messages.create({
    model: SONNET_MODEL,
    max_tokens: args.maxTokens ?? 16384,
    messages: [{ role: "user", content: genPrompt }],
  });
  const html = stripHtmlFences(textFromMessage(genResp));

  // Enforce companion anchor — inject if model omitted it
  if (
    !html.includes('id="sunny-companion"') &&
    !html.includes("id='sunny-companion'")
  ) {
    return html.replace(
      /<body[^>]*>/i,
      `$&\n<div id="sunny-companion" style="position:fixed;bottom:20px;right:20px;width:120px;height:120px;z-index:9999;pointer-events:none;"></div>`,
    );
  }
  return html;
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  const childId = args.childId;
  const inputSource = resolveInputSource(args);
  const OUT_DIR = path.join(
    process.cwd(),
    "src",
    "context",
    childId,
    "homework",
    "games",
  );
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const GAME_OUT = path.join(OUT_DIR, `${date}-quest.html`);
  const TEXT_OUT = path.join(OUT_DIR, `${date}-reading.txt`);

  const client = new Anthropic();
  console.log("📄 Step 1/4: Reading PDF...");

  let pdfBase64 = "";
  let textInput = "";
  if (inputSource.kind === "pdf") {
    const pdfBytes = fs.readFileSync(inputSource.filePath);
    pdfBase64 = pdfBytes.toString("base64");
  } else {
    textInput = fs.readFileSync(inputSource.filePath, "utf8");
  }

  const extractResp = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 8192,
    messages: [
      inputSource.kind === "pdf"
        ? {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: pdfBase64,
                },
              },
              { type: "text", text: EXTRACTION_PROMPT },
            ],
          }
        : {
            role: "user",
            content: `${EXTRACTION_PROMPT}\n\nHomework text:\n${textInput}`,
          },
    ],
  });

  const extractRaw = textFromMessage(extractResp);
  const extracted = parseExtractedJson(extractRaw);
  const extractedJsonPretty = JSON.stringify(extracted, null, 2);

  const incomingDir = path.join(
    process.cwd(),
    "src",
    "context",
    childId,
    "homework",
    "incoming",
  );
  let sidecarType: string | undefined;
  let sidecarTestDate: string | undefined;
  for (const name of ["extraction.json", "classification.json"]) {
    const fp = path.join(incomingDir, name);
    if (!fs.existsSync(fp)) continue;
    try {
      const j = JSON.parse(fs.readFileSync(fp, "utf8")) as {
        type?: string;
        testDate?: string | null;
      };
      if (typeof j.type === "string" && j.type.trim()) sidecarType ??= j.type;
      if (j.testDate != null && String(j.testDate).trim()) {
        sidecarTestDate ??= String(j.testDate);
      }
    } catch {
      // ignore malformed sidecar JSON
    }
  }
  const extMeta = extracted as { type?: string; testDate?: string };
  const homeworkTypeForGen = sidecarType ?? extMeta.type;
  const testDateForGen = sidecarTestDate ?? extMeta.testDate;

  const textResult = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 4000,
    messages: [
      inputSource.kind === "pdf"
        ? {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: pdfBase64,
                },
              },
              { type: "text", text: TEXT_FROM_PDF_PROMPT },
            ],
          }
        : {
            role: "user",
            content: `${TEXT_FROM_PDF_PROMPT}\n\nHomework text:\n${textInput}`,
          },
    ],
  });

  const textExtractRaw = textFromMessage(textResult);
  const textExtracted = parseExtractedJson(textExtractRaw) as {
    title?: string;
    fullText?: string;
    pages?: Array<{ pageNum: number; text: string }>;
  };
  const fullText =
    typeof textExtracted.fullText === "string" ? textExtracted.fullText : "";
  const pages = Array.isArray(textExtracted.pages) ? textExtracted.pages : [];

  fs.writeFileSync(TEXT_OUT, fullText, "utf8");
  console.log("✅ Step 1/4: PDF extracted");

  console.log(`📖 Book text extracted: ${fullText.length} characters`);
  console.log(`📄 Pages: ${pages.length}`);
  console.log(`First 200 chars: ${fullText.slice(0, 200)}`);

  console.log("🎮 Step 2/4: Building game...");
  const html = await generateQuestGameHtml({
    client,
    extractedJsonPretty,
    homeworkType: homeworkTypeForGen,
    testDate: testDateForGen,
  });
  console.log("✅ Step 2/4: Quest game ready");

  fs.writeFileSync(GAME_OUT, html);

  if (args.opus) {
    console.log("🏆 Step 3/4: Generating boss node...");
    const bossResp = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 16384,
      messages: [
        {
          role: "user",
          content: buildOpusPrompt(extractedJsonPretty, html, childId),
        },
      ],
    });

    const bossHtml = stripHtmlFences(textFromMessage(bossResp));
    const BOSS_OUT = path.join(OUT_DIR, `${date}-boss.html`);
    fs.writeFileSync(BOSS_OUT, bossHtml);
    console.log(`✅ Boss node: ${BOSS_OUT}`);
    console.log("✅ Step 3/4: Boss node ready");
  }

  console.log("💾 Step 4/4: Saving files...");
  console.log(`✅ Game generated: ${GAME_OUT}`);
  console.log(`✅ Reading text: ${TEXT_OUT}`);
  console.log("📊 Extraction:", JSON.stringify(extracted, null, 2));
  if (args.preview) {
    const previewUrl =
      `http://localhost:3001/games/${path.basename(GAME_OUT)}` +
      `?childId=${childId}&preview=true&companion=elli`;
    const { exec } = await import("child_process");
    exec(`open -a "Google Chrome" "${previewUrl}"`);
    console.log(`🔍 Preview: ${previewUrl}`);
  }
  console.log("✅ Done!");
  console.log("📁 Open in browser to review");
  console.log("\nUsage:");
  console.log("  npm run sunny:homework -- --child=ila");
  console.log("  npm run sunny:homework -- --child=ila --opus");
  console.log("  npm run sunny:homework -- --child=ila --preview");
}

if (typeof require !== "undefined" && require.main === module) {
  main().catch((err) => {
    console.error("🎮 [generateGame] failed", err);
    process.exit(1);
  });
}
