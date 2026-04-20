import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { parseExtractedJson, textFromMessage } from "./generateGame";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

type TutoringSummary = {
  date: string;
  coveredWords: string[];
  struggledWords: string[];
  tutorStrategies: string[];
  conceptsCovered: string[];
};

function parseCliArgs(argv: string[]): { childId: string } {
  const childArg = argv.find((arg) => arg.startsWith("--child="));
  if (!childArg) throw new Error("Missing required argument --child=<childId>");
  const childId = childArg.slice("--child=".length).trim().toLowerCase();
  if (!childId) throw new Error("Missing required argument --child=<childId>");
  return { childId };
}

export function parseCoveredWords(text: string): string[] {
  const match = text.match(/coveredWords:\s*([^\n]+)/i);
  if (!match) return [];
  return match[1]!.split(",").map((w) => w.trim()).filter(Boolean);
}

export function parseStruggledWords(text: string): string[] {
  const match = text.match(/struggledWords:\s*([^\n]+)/i);
  if (!match) return [];
  return match[1]!.split(",").map((w) => w.trim()).filter(Boolean);
}

export function appendTutoringSessionSection(
  curriculumMd: string,
  summary: TutoringSummary,
): string {
  const lines = [
    "",
    `## Tutoring Session ${summary.date}`,
    `- Covered: ${summary.coveredWords.join(", ")}`,
    `- Struggled: ${summary.struggledWords.join(", ")}`,
    `- Strategies used: ${summary.tutorStrategies.join(", ")}`,
    `- Sunny should reinforce: ${summary.struggledWords.join(", ")}`,
    `- Sunny should avoid re-teaching: ${summary.coveredWords.join(", ")} (tutor already covered these this week)`,
    "",
  ];
  return `${curriculumMd.trimEnd()}\n${lines.join("\n")}`;
}

export function moveTranscriptToProcessed(src: string, processedDir: string): string {
  fs.mkdirSync(processedDir, { recursive: true });
  const out = path.join(processedDir, path.basename(src));
  fs.renameSync(src, out);
  return out;
}

async function extractSummary(client: Anthropic, transcript: string): Promise<TutoringSummary> {
  const msg = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 1200,
    messages: [
      {
        role: "user",
        content: `Extract:
{
  "date": string,
  "coveredWords": string[],
  "struggledWords": string[],
  "tutorStrategies": string[],
  "conceptsCovered": string[]
}
Return JSON only.

Transcript:
${transcript}`,
      },
    ],
  });
  const parsed = parseExtractedJson(textFromMessage(msg)) as Partial<TutoringSummary>;
  return {
    date: String(parsed.date ?? new Date().toISOString().slice(0, 10)),
    coveredWords: Array.isArray(parsed.coveredWords) ? parsed.coveredWords.map(String) : [],
    struggledWords: Array.isArray(parsed.struggledWords) ? parsed.struggledWords.map(String) : [],
    tutorStrategies: Array.isArray(parsed.tutorStrategies) ? parsed.tutorStrategies.map(String) : [],
    conceptsCovered: Array.isArray(parsed.conceptsCovered) ? parsed.conceptsCovered.map(String) : [],
  };
}

export async function runIngestTutoring(argv: string[]): Promise<void> {
  const { childId } = parseCliArgs(argv);
  const client = new Anthropic();

  const base = path.join(process.cwd(), "src", "context", childId, "tutoring");
  const incomingDir = path.join(base, "incoming");
  const processedDir = path.join(base, "processed");
  fs.mkdirSync(processedDir, { recursive: true });

  const transcriptName = fs
    .readdirSync(incomingDir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.toLowerCase().endsWith(".txt"))
    .map((d) => d.name)
    .sort()[0];
  if (!transcriptName) {
    throw new Error(`No transcript .txt files found in ${incomingDir}`);
  }

  const transcriptPath = path.join(incomingDir, transcriptName);
  const transcript = fs.readFileSync(transcriptPath, "utf8");
  const summary = await extractSummary(client, transcript);

  const curriculumPath = path.join(process.cwd(), "src", "context", childId, "curriculum.md");
  const existing = fs.existsSync(curriculumPath) ? fs.readFileSync(curriculumPath, "utf8") : "# Curriculum\n";
  const next = appendTutoringSessionSection(existing, summary);
  fs.writeFileSync(curriculumPath, next, "utf8");

  moveTranscriptToProcessed(transcriptPath, processedDir);

  console.log("✅ Tutoring session ingested");
  console.log("📝 curriculum.md updated");
  console.log(`🎯 Reinforce next session: ${summary.struggledWords.join(", ")}`);
}

if (typeof require !== "undefined" && require.main === module) {
  runIngestTutoring(process.argv.slice(2)).catch((err) => {
    console.error("🎮 [ingestTutoring] failed", err);
    process.exit(1);
  });
}
