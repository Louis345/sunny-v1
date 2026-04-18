import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

const PDF_PATH = '/Users/jamaltaylor/Downloads/4_16 reading.pdf';

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const SONNET_MODEL = "claude-sonnet-4-20250514";

const REFERENCE_HTML_PATH = path.join(
  process.cwd(),
  "web",
  "public",
  "games",
  "chimp-quest.html",
);

const READING_TEXT_OUT = path.join(
  process.cwd(),
  "src",
  "context",
  "ila",
  "homework",
  "chimp-reading-text.txt",
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

function textFromMessage(resp: Anthropic.Message): string {
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function stripJsonFences(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  return t;
}

function parseExtractedJson(raw: string): unknown {
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

function stripHtmlFences(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/i, "").trim();
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

function buildSonnetPrompt(extractedJson: string, referenceHtml: string): string {
  const referenceBlock =
    referenceHtml.trim() === ""
      ? ""
      : `REFERENCE HTML (manually built — mirror DOM/CSS structure and polish; replace all questions and copy with the new homework):
<<<REFERENCE_HTML>>>
${referenceHtml}
<<<END_REFERENCE_HTML>>>

`;

  return `${referenceBlock}Generate a complete single-file interactive HTML game for Ila (age 8, grade 2).
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
    childId: 'ila'
  }, '*');

Homework data:
${extractedJson}

Return raw HTML only. No markdown.`;
}

async function main(): Promise<void> {
  const client = new Anthropic();

  const pdfBytes = fs.readFileSync(PDF_PATH);
  const pdfBase64 = pdfBytes.toString("base64");

  const extractResp = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 8192,
    messages: [
      {
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
      },
    ],
  });

  const extractRaw = textFromMessage(extractResp);
  const extracted = parseExtractedJson(extractRaw);
  const extractedJsonPretty = JSON.stringify(extracted, null, 2);

  const textResult = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 4000,
    messages: [
      {
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

  fs.mkdirSync(path.dirname(READING_TEXT_OUT), { recursive: true });
  fs.writeFileSync(READING_TEXT_OUT, fullText, "utf8");

  console.log(`📖 Book text extracted: ${fullText.length} characters`);
  console.log(`📄 Pages: ${pages.length}`);
  console.log(`First 200 chars: ${fullText.slice(0, 200)}`);

  const referenceHtml = loadOptionalReferenceHtml();
  const genPrompt = buildSonnetPrompt(extractedJsonPretty, referenceHtml);

  const genResp = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 16384,
    messages: [{ role: "user", content: genPrompt }],
  });

  const html = stripHtmlFences(textFromMessage(genResp));

  fs.writeFileSync("web/public/games/chimp-quest-generated.html", html);

  console.log("✅ Game generated: web/public/games/chimp-quest-generated.html");
  console.log(`✅ Reading text: ${READING_TEXT_OUT}`);
  console.log("📊 Extraction:", JSON.stringify(extracted, null, 2));
  console.log("📁 Open in browser to review");
}

main().catch((err) => {
  console.error("🎮 [generateGame] failed", err);
  process.exit(1);
});
