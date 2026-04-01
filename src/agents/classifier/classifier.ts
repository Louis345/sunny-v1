import "dotenv/config";

/**
 * Drop-folder Classifier Agent
 *
 * Scans drop/ (and drop/ila/, drop/reina/) for new files.
 * Classifies each file and routes to:
 *   - homework/<child>/<date>/   — spelling/math/reading/handwriting
 *   - src/context/<child>_context.md — everything else
 *
 * Move originals to drop/processed/ after handling.
 *
 * Usage (manual):
 *   npm run drop
 *
 * Usage (automatic):
 *   Called by session-manager.ts at the start of every session.
 */

import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = process.cwd();
const DROP_DIR = path.join(ROOT, "drop");
const PROCESSED_DIR = path.join(DROP_DIR, "processed");

const SUPPORTED_EXTENSIONS = [
  ".jpg", ".jpeg", ".png", ".pdf",
  ".txt", ".md", ".vtt",
];

export type DocumentType =
  | "spelling_homework"
  | "math_homework"
  | "reading_assignment"
  | "handwriting_sample"
  | "teacher_note"
  | "report_card"
  | "iep_document"
  | "tutoring_session"
  | "unknown";

export type Destination = "homework" | "context";

export interface ClassificationResult {
  type: DocumentType;
  destination: Destination;
  date: string;
  summary: string;
}

export interface IngestFileReport {
  filename: string;
  sourcePath: string;
  childName: "Ila" | "Reina";
  status: "routed" | "skipped" | "failed";
  plannedSteps: string[];
  detectedBy: "filename" | "model";
  initialClassification: {
    type: DocumentType;
    destination: Destination;
    summary: string;
  } | null;
  finalClassification: {
    type: DocumentType;
    destination: Destination;
    summary: string;
  } | null;
  guardrailPromoted: boolean;
  extractedText: boolean;
  preservedAsset: boolean;
  outputPaths: string[];
  updatedFiles: string[];
  processedPath: string | null;
  warnings: string[];
  notes: string[];
}

export interface IngestRunReport {
  createdAt: string;
  totalFiles: number;
  routedCount: number;
  failedCount: number;
  reports: IngestFileReport[];
}

function toWorkspaceRelative(filePath: string): string {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

export function buildIngestPlan(_filename: string, extension: string): string[] {
  const steps = ["Read file"];
  if ([".pdf", ".png", ".jpg", ".jpeg"].includes(extension)) {
    steps.push("OCR/text extraction");
  } else {
    steps.push("Load text/transcript");
  }
  steps.push("AI classification");
  steps.push("Server guardrail check");
  if ([".pdf", ".png", ".jpg", ".jpeg"].includes(extension)) {
    steps.push("Preserve original asset");
  }
  steps.push("Route side effects");
  steps.push("Move to processed");
  return steps;
}

function formatProgressBar(completed: number, total: number, width = 16): string {
  if (total <= 0) return `[${"-".repeat(width)}]`;
  const ratio = Math.max(0, Math.min(1, completed / total));
  const filled = Math.round(ratio * width);
  return `[${"#".repeat(filled)}${"-".repeat(width - filled)}]`;
}

export function renderIngestReport(report: IngestFileReport): string {
  const lines = [
    `${report.filename}`,
    `- child: ${report.childName}`,
    `- status: ${report.status}`,
    `- plan: ${report.plannedSteps.join(" -> ")}`,
  ];
  if (report.initialClassification) {
    lines.push(
      `- ai classification: ${report.initialClassification.destination}/${report.initialClassification.type}`,
    );
  }
  if (report.guardrailPromoted) {
    lines.push("- server guardrail: promoted");
  }
  if (report.finalClassification) {
    lines.push(
      `- final destination: ${report.finalClassification.destination}/${report.finalClassification.type}`,
    );
  }
  lines.push(`- extracted text: ${report.extractedText ? "yes" : "no"}`);
  lines.push(`- preserved asset: ${report.preservedAsset ? "yes" : "no"}`);
  if (report.outputPaths.length > 0) {
    lines.push(`- output paths: ${report.outputPaths.join(", ")}`);
  }
  if (report.updatedFiles.length > 0) {
    lines.push(`- updated files: ${report.updatedFiles.join(", ")}`);
  }
  if (report.processedPath) {
    lines.push(`- processed path: ${report.processedPath}`);
  }
  if (report.notes.length > 0) {
    lines.push(`- notes: ${report.notes.join(" | ")}`);
  }
  if (report.warnings.length > 0) {
    lines.push(`- warnings: ${report.warnings.join(" | ")}`);
  }
  return lines.join("\n");
}

function writeIngestRunReport(report: IngestRunReport): string {
  const reportsDir = path.join(DROP_DIR, "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const stampedName = `ingest-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const stampedPath = path.join(reportsDir, stampedName);
  const latestPath = path.join(reportsDir, "latest.json");
  const body = JSON.stringify(report, null, 2) + "\n";
  fs.writeFileSync(stampedPath, body, "utf-8");
  fs.writeFileSync(latestPath, body, "utf-8");
  return toWorkspaceRelative(latestPath);
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function inferHomeworkType(text: string, filenameLower: string): DocumentType {
  const source = `${filenameLower}\n${text}`.toLowerCase();
  const mathScore = countMatches(source, [
    /\bmath\b/,
    /\bcount\b/,
    /\bcoins?\b/,
    /\b(add|subtract|greater|less|amount)\b/,
    /\b\d+\s*(?:¢|cents?)\b/,
    /[0-9]\s*[+\-×÷]\s*[0-9]/,
  ]);
  const spellingScore = countMatches(source, [
    /\bspell(?:ing)?\b/,
    /\bphonics\b/,
    /\bword list\b/,
    /\bunscramble\b/,
    /\bsyllable\b/,
  ]);
  const readingScore = countMatches(source, [
    /\bread(?:ing)?\b/,
    /\bpassage\b/,
    /\bcomprehension\b/,
    /\bread and answer\b/,
  ]);
  const handwritingScore = countMatches(source, [
    /\bhandwriting\b/,
    /\btrace\b/,
    /\bcopy the sentence\b/,
  ]);

  const ranked: Array<[DocumentType, number]> = [
    ["math_homework", mathScore],
    ["spelling_homework", spellingScore],
    ["reading_assignment", readingScore],
    ["handwriting_sample", handwritingScore],
  ];
  ranked.sort((a, b) => b[1] - a[1]);
  return ranked[0][1] > 0 ? ranked[0][0] : "spelling_homework";
}

function looksLikeContextDocument(text: string, filenameLower: string): boolean {
  const source = `${filenameLower}\n${text}`.toLowerCase();
  return countMatches(source, [
    /\biep\b/,
    /\bevaluation\b/,
    /\bpsychological\b/,
    /\beligibility\b/,
    /\bpresent levels\b/,
    /\bannual goals\b/,
    /\baccommodations\b/,
    /\bclassification recommendation\b/,
    /\bresource room\b/,
    /\breport card\b/,
    /\bteacher note\b/,
  ]) >= 2;
}

function looksLikeHomeworkDocument(text: string, filenameLower: string): boolean {
  const source = `${filenameLower}\n${text}`.toLowerCase();
  const score = countMatches(source, [
    /\bworksheet\b/,
    /\bhomework\b/,
    /\bcircle\b/,
    /\bcount\b/,
    /\bwrite\b/,
    /\bfill in\b/,
    /\bhow many\b/,
    /\bwhich amount\b/,
    /\bshow your work\b/,
    /\bmatch\b/,
    /\bchoose\b/,
    /\bread and answer\b/,
    /\bspell(?:ing)?\b/,
    /\btrace\b/,
    /\b\d+\s*(?:¢|cents?)\b/,
    /[0-9]\s*[+\-×÷]\s*[0-9]/,
  ]);
  return score >= 2;
}

export function stabilizeClassification(args: {
  filename: string;
  extension: string;
  rawText: string;
  classification: ClassificationResult;
}): ClassificationResult {
  const filenameLower = args.filename.toLowerCase();
  const rawText = args.rawText.trim();
  const classification = args.classification;

  if (classification.destination === "homework") {
    return classification;
  }
  if (!rawText) {
    return classification;
  }
  if (looksLikeContextDocument(rawText, filenameLower)) {
    return classification;
  }
  if (
    [".pdf", ".png", ".jpg", ".jpeg", ".txt"].includes(args.extension) &&
    looksLikeHomeworkDocument(rawText, filenameLower)
  ) {
    return {
      ...classification,
      type: inferHomeworkType(rawText, filenameLower),
      destination: "homework",
      summary:
        classification.summary === "Could not classify document."
          ? "Likely homework/worksheet content detected by server guardrail."
          : `${classification.summary} Promoted to homework by server guardrail.`,
    };
  }
  return classification;
}

function todayYYYYMMDD(): string {
  return new Date().toISOString().slice(0, 10);
}

function detectChildFromFilename(
  filename: string
): "Ila" | "Reina" | null {
  const lower = filename.toLowerCase();
  if (lower.includes("ila")) return "Ila";
  if (lower.includes("reina")) return "Reina";
  return null;
}

function parseVtt(content: string): string {
  return content
    .split("\n")
    .filter(
      (line) =>
        !line.match(/^\d{2}:\d{2}:\d{2}/) &&
        !line.match(/^WEBVTT/) &&
        !line.match(/^\d+$/) &&
        line.trim() !== ""
    )
    .join(" ")
    .trim();
}

async function readFileContent(
  filePath: string
): Promise<{ text?: string; imageBase64?: string; mimeType?: string }> {
  const ext = path.extname(filePath).toLowerCase();

  if ([".jpg", ".jpeg", ".png"].includes(ext)) {
    const buffer = fs.readFileSync(filePath);
    const base64 = buffer.toString("base64");
    const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
    return { imageBase64: base64, mimeType };
  }

  if (ext === ".pdf") {
    const buffer = fs.readFileSync(filePath);
    const base64 = buffer.toString("base64");
    return { imageBase64: base64, mimeType: "application/pdf" };
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  if (ext === ".vtt") {
    return { text: parseVtt(raw) };
  }
  return { text: raw };
}

async function ocrWithClaude(
  client: Anthropic,
  imageBase64: string,
  mimeType: string
): Promise<string> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType as "image/jpeg" | "image/png",
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: "Extract all text exactly as written. Return plain text only.",
          },
        ],
      },
    ],
  });
  return response.content
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b ? b.text : ""))
    .join("\n");
}

/** PDF via Messages API document block (not image). */
async function ocrPdfWithClaude(
  client: Anthropic,
  pdfBase64: string,
  prompt: string
): Promise<string> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
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
          {
            type: "text",
            text: prompt,
          },
        ],
      },
    ],
  });
  return response.content
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b ? b.text : ""))
    .join("\n");
}

/** Filename-only routing before Claude. Context checked before homework. */
function classifyFromFilename(filenameLower: string): ClassificationResult | null {
  const contextPatterns: Array<{
    keyword: string;
    type: DocumentType;
    summary: string;
  }> = [
    { keyword: "psychological", type: "iep_document", summary: "Psychological document (filename keyword)." },
    { keyword: "evaluation", type: "iep_document", summary: "Evaluation document (filename keyword)." },
    { keyword: "assessment", type: "iep_document", summary: "Assessment document (filename keyword)." },
    { keyword: "eligibility", type: "iep_document", summary: "Eligibility document (filename keyword)." },
    { keyword: "consent", type: "iep_document", summary: "Consent form (filename keyword)." },
    { keyword: "iep", type: "iep_document", summary: "IEP-related document (filename keyword)." },
    { keyword: "report", type: "report_card", summary: "School report (filename keyword)." },
  ];

  for (const { keyword, type, summary } of contextPatterns) {
    if (filenameLower.includes(keyword)) {
      return {
        type,
        destination: "context",
        date: "unknown",
        summary,
      };
    }
  }

  const homeworkPatterns: Array<{
    keyword: string;
    type: DocumentType;
    summary: string;
  }> = [
    { keyword: "math", type: "math_homework", summary: "Math homework (filename keyword)." },
    { keyword: "spelling", type: "spelling_homework", summary: "Spelling homework (filename keyword)." },
    { keyword: "handwriting", type: "handwriting_sample", summary: "Handwriting (filename keyword)." },
    { keyword: "reading", type: "reading_assignment", summary: "Reading (filename keyword)." },
    { keyword: "fluency", type: "reading_assignment", summary: "Fluency (filename keyword)." },
    { keyword: "homework", type: "spelling_homework", summary: "Homework (filename keyword)." },
    { keyword: "worksheet", type: "spelling_homework", summary: "Worksheet (filename keyword)." },
    { keyword: "unit", type: "spelling_homework", summary: "Unit work (filename keyword)." },
    { keyword: "week", type: "spelling_homework", summary: "Weekly work (filename keyword)." },
  ];

  for (const { keyword, type, summary } of homeworkPatterns) {
    if (filenameLower.includes(keyword)) {
      return {
        type,
        destination: "homework",
        date: "unknown",
        summary,
      };
    }
  }

  return null;
}

async function classifyText(
  client: Anthropic,
  text: string
): Promise<ClassificationResult> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 400,
    system: `Classify this educational document.
Return JSON only (no markdown, no code block):
{
  "type": "spelling_homework" | "math_homework" | "reading_assignment" | "handwriting_sample" | "teacher_note" | "report_card" | "iep_document" | "tutoring_session" | "unknown",
  "destination": "homework" | "context",
  "date": "YYYY-MM-DD" | "unknown",
  "summary": "one sentence"
}

homework destination = spelling_homework, math_homework, reading_assignment, handwriting_sample
context destination = teacher_note, report_card, iep_document, tutoring_session, unknown

iep_document: Any Individualized Education Program, IEP eligibility notice, prior written notice from a school district, CSE meeting notes, evaluation reports, disability classification documents, special education consent forms.
Keywords: IEP, CSE, CPSE, Resource Room, Special Education, disability classification, annual goals, present levels of performance, testing accommodations, related services.`,
    messages: [
      {
        role: "user",
        content: text.slice(0, 3000),
      },
    ],
  });

  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b ? b.text : ""))
    .join("");

  try {
    return JSON.parse(raw) as ClassificationResult;
  } catch {
    return {
      type: "unknown",
      destination: "context",
      date: "unknown",
      summary: "Could not classify document.",
    };
  }
}

const CONTEXT_SUMMARY_MAX_CHARS = 120_000;

async function summarizeForContext(
  client: Anthropic,
  rawText: string,
  meta: { type: string; summary: string; childName: string }
): Promise<string> {
  const excerpt = rawText.slice(0, CONTEXT_SUMMARY_MAX_CHARS);
  const truncated =
    rawText.length > CONTEXT_SUMMARY_MAX_CHARS
      ? "\n\n[Document truncated for summarization — only the beginning was sent.]"
      : "";

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 900,
    system: `You write brief entries for a child's educational companion context file (markdown).

Rules:
- Maximum 200 words total.
- Output structured markdown with short bullets or small headings: Child name, Document type, Key clinical/educational flags, Relevant accommodations, Goals and needs.
- Summarize only; do NOT dump letter text, form boilerplate, or reproduce long policy language.
- If the excerpt is a spelling list or homework, say so briefly and list only topic/theme, not every word.
- If information is missing, omit that section rather than inventing.`,
    messages: [
      {
        role: "user",
        content:
          `Classified type: ${meta.type}\nOne-line summary: ${meta.summary}\nDefault child (if not in doc): ${meta.childName}\n\n---\n\nDocument excerpt:\n${excerpt}${truncated}`,
      },
    ],
  });

  const out = response.content
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b ? b.text : ""))
    .join("\n")
    .trim();

  return out || `*(No summary produced — classification: ${meta.type})*`;
}

function collectDropFiles(): string[] {
  const files: string[] = [];
  const processedAbs = path.resolve(PROCESSED_DIR);

  const scan = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (path.resolve(full) === processedAbs) continue;
        scan(full);
      } else if (
        SUPPORTED_EXTENSIONS.includes(
          path.extname(entry.name).toLowerCase()
        ) &&
        !entry.name.startsWith(".")
      ) {
        files.push(full);
      }
    }
  };

  scan(DROP_DIR);
  return files;
}

function detectChildFromPath(filePath: string): "Ila" | "Reina" | null {
  const rel = path.relative(DROP_DIR, filePath);
  const parts = rel.split(path.sep);
  if (parts.length >= 2) {
    const sub = parts[0].toLowerCase();
    if (sub === "ila") return "Ila";
    if (sub === "reina") return "Reina";
  }
  return detectChildFromFilename(path.basename(filePath));
}

function moveToProcessed(filePath: string): string {
  fs.mkdirSync(PROCESSED_DIR, { recursive: true });
  const dest = path.join(PROCESSED_DIR, path.basename(filePath));
  // Avoid clobbering if same name processed twice
  const unique =
    fs.existsSync(dest)
      ? path.join(
          PROCESSED_DIR,
          `${Date.now()}-${path.basename(filePath)}`
        )
      : dest;
  fs.renameSync(filePath, unique);
  return unique;
}

function appendToContext(childName: "Ila" | "Reina", text: string): string {
  const fileName =
    childName === "Ila" ? "ila_context.md" : "reina_context.md";
  const filePath = path.join(ROOT, "src", "context", fileName);
  const timestamp = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
  });
  const entry = `\n\n## Ingested Document — ${timestamp}\n${text}`;
  fs.appendFileSync(filePath, entry, "utf-8");
  return toWorkspaceRelative(filePath);
}

export async function classifyAndRoute(
  childName: "Ila" | "Reina",
  options?: {
    progressState?: { processed: number; total: number };
    logProgress?: boolean;
  },
): Promise<{ hasNewFiles: boolean; routed: string[]; reports: IngestFileReport[] }> {
  const allFiles = collectDropFiles().filter((f) => {
    const child = detectChildFromPath(f);
    return child === childName || child === null;
  });

  if (allFiles.length === 0) {
    return { hasNewFiles: false, routed: [], reports: [] };
  }

  const client = new Anthropic();
  const routed: string[] = [];
  const reports: IngestFileReport[] = [];

  for (const filePath of allFiles) {
    const filename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const child = detectChildFromPath(filePath) ?? childName;
    const report: IngestFileReport = {
      filename,
      sourcePath: toWorkspaceRelative(filePath),
      childName: child,
      status: "failed",
      plannedSteps: buildIngestPlan(filename, ext),
      detectedBy: "model",
      initialClassification: null,
      finalClassification: null,
      guardrailPromoted: false,
      extractedText: false,
      preservedAsset: false,
      outputPaths: [],
      updatedFiles: [],
      processedPath: null,
      warnings: [],
      notes: [],
    };
    const progressState = options?.progressState;
    if (options?.logProgress && progressState) {
      const current = progressState.processed + 1;
      console.log(
        `  ${formatProgressBar(progressState.processed, progressState.total)} ${current}/${progressState.total} starting ${filename}`,
      );
      console.log(`  🗺️  plan: ${report.plannedSteps.join(" -> ")}`);
    }

    if (child !== childName) {
      console.log(`  ⏭️  Skipping ${filename} — belongs to ${child}`);
      report.status = "skipped";
      report.notes.push(`Skipped because file belongs to ${child}.`);
      reports.push(report);
      continue;
    }

    let rawText: string;
    let pdfBase64: string | undefined;

    try {
      const { text, imageBase64, mimeType } = await readFileContent(filePath);

      if (ext === ".pdf" && imageBase64) {
        pdfBase64 = imageBase64;
        rawText = await ocrPdfWithClaude(
          client,
          imageBase64,
          "Extract all text exactly as written. Return plain text only."
        );
      } else if (imageBase64 && mimeType && mimeType !== "application/pdf") {
        rawText = await ocrWithClaude(client, imageBase64, mimeType);
      } else {
        rawText = text ?? "";
      }
      report.extractedText = rawText.trim().length > 0;
    } catch (err) {
      const warning = `Could not read ${filename}: ${String(err)}`;
      console.warn(`  ⚠️  ${warning}`);
      report.warnings.push(warning);
      reports.push(report);
      if (progressState) {
        progressState.processed++;
      }
      continue;
    }

    if (!rawText.trim()) {
      const warning = `Empty content for ${filename} — skipping`;
      console.warn(`  ⚠️  ${warning}`);
      report.warnings.push(warning);
      reports.push(report);
      if (progressState) {
        progressState.processed++;
      }
      continue;
    }

    const lowerBase = path.basename(filePath).toLowerCase();
    const fromFilename = classifyFromFilename(lowerBase);
    let result: ClassificationResult;
    if (fromFilename) {
      report.detectedBy = "filename";
      result = fromFilename;
    } else {
      try {
        result = await classifyText(client, rawText);
      } catch (err) {
        console.warn(`  ⚠️  Classification failed for ${filename}: ${String(err)}`);
        result = {
          type: "unknown",
          destination: "context",
          date: "unknown",
          summary: "Classification failed.",
        };
        report.warnings.push(`Classification failed for ${filename}: ${String(err)}`);
      }
    }
    report.initialClassification = {
      type: result.type,
      destination: result.destination,
      summary: result.summary,
    };
    const stabilized = stabilizeClassification({
      filename,
      extension: ext,
      rawText,
      classification: result,
    });
    if (
      stabilized.destination !== result.destination ||
      stabilized.type !== result.type
    ) {
      report.guardrailPromoted = true;
      report.notes.push(
        `Server guardrail promoted ${result.destination}/${result.type} to ${stabilized.destination}/${stabilized.type}.`,
      );
      console.log(
        `  🧭 routing guardrail promoted ${filename}: ${result.destination}/${result.type} → ${stabilized.destination}/${stabilized.type}`,
      );
    }
    result = stabilized;
    report.finalClassification = {
      type: result.type,
      destination: result.destination,
      summary: result.summary,
    };

    const date =
      result.date && result.date !== "unknown"
        ? result.date
        : todayYYYYMMDD();

    if (result.destination === "homework") {
      const destDir = path.join(
        ROOT,
        "homework",
        child.toLowerCase(),
        date
      );
      fs.mkdirSync(destDir, { recursive: true });

      if (ext === ".pdf" && pdfBase64) {
        try {
          console.log(`  📄 Processing: ${filename} for ${child}`);
          const homeworkText = await ocrPdfWithClaude(
            client,
            pdfBase64,
            "Extract all text from this educational document exactly as written. Return plain text only."
          );
          const destPdf = path.join(destDir, filename);
          const destTxt = path.join(destDir, "spelling-words.txt");
          fs.copyFileSync(filePath, destPdf);
          fs.writeFileSync(destTxt, homeworkText.trim() + "\n", "utf-8");
          report.preservedAsset = true;
          report.outputPaths.push(
            toWorkspaceRelative(destPdf),
            toWorkspaceRelative(destTxt),
          );
          report.notes.push("Preserved original PDF and extracted OCR text for homework.");
          const msg = `📚 ${result.type} → homework/${child.toLowerCase()}/${date}/`;
          console.log(`  ${msg}`);
          routed.push(msg);
        } catch (err) {
          report.warnings.push(
            `Homework PDF OCR failed for ${filename}: ${String(err)}`,
          );
          console.warn(
            `  ⚠️  Homework PDF OCR failed for ${filename}: ${String(err)}`
          );
          reports.push(report);
          if (progressState) {
            progressState.processed++;
          }
          continue;
        }
      } else {
        const destFile = path.join(destDir, filename);
        fs.copyFileSync(filePath, destFile);
        report.preservedAsset = true;
        report.outputPaths.push(toWorkspaceRelative(destFile));
        report.notes.push("Preserved original routed asset in homework storage.");
        const msg = `📚 ${result.type} → homework/${child.toLowerCase()}/${date}/`;
        console.log(`  ${msg}`);
        routed.push(msg);
      }
      report.status = "routed";
    } else {
      let contextBody: string;
      try {
        contextBody = await summarizeForContext(client, rawText, {
          type: result.type,
          summary: result.summary,
          childName: child,
        });
      } catch (err) {
        console.warn(
          `  ⚠️  Context summarization failed for ${filename}: ${String(err)}`
        );
        contextBody = `${result.summary}\n\n*(Full document text omitted — summarization failed.)*`;
      }
      const updatedFile = appendToContext(
        child,
        `### ${result.type}\n${result.summary}\n\n${contextBody}`
      );
      report.updatedFiles.push(updatedFile);
      report.notes.push(`Updated child context file ${updatedFile}.`);
      const msg = `🧠 ${result.type} → ${child}'s context`;
      console.log(`  ${msg}`);
      routed.push(msg);
      report.status = "routed";
    }

    try {
      report.processedPath = toWorkspaceRelative(moveToProcessed(filePath));
    } catch (err) {
      const warning = `Could not move ${filename} to processed/: ${String(err)}`;
      console.warn(`  ⚠️  ${warning}`);
      report.warnings.push(warning);
    }
    reports.push(report);
    if (progressState) {
      progressState.processed++;
      if (options?.logProgress) {
        console.log(
          `  ${formatProgressBar(progressState.processed, progressState.total)} ${progressState.processed}/${progressState.total} finished ${filename}`,
        );
      }
    }
  }

  return { hasNewFiles: allFiles.length > 0, routed, reports };
}

// ── CLI entry point ───────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const allFiles = collectDropFiles();
  if (allFiles.length === 0) {
    console.log("  ✨ No new files in drop/");
    return;
  }

  console.log(`  📥 Document Classifier — scanning drop/`);
  console.log(`  Found ${allFiles.length} file(s)\n`);
  console.log("  Planned pipeline per file:");
  console.log("   1. Read file");
  console.log("   2. OCR/text extraction when needed");
  console.log("   3. AI classification");
  console.log("   4. Server guardrail check");
  console.log("   5. Route side effects + preserve assets");
  console.log("   6. Move original into processed/\n");

  const children: Array<"Ila" | "Reina"> = ["Ila", "Reina"];
  const seen = new Set<string>();
  const reports: IngestFileReport[] = [];
  const progressState = { processed: 0, total: allFiles.length };

  for (const child of children) {
    const { routed, reports: childReports } = await classifyAndRoute(child, {
      progressState,
      logProgress: true,
    });
    for (const r of routed) seen.add(r);
    reports.push(...childReports);
  }

  if (seen.size === 0) {
    console.log("  ⚠️  No files could be routed (check child name in filename or subfolder)");
  } else {
    console.log(`\n  ✅ ${seen.size} file(s) routed`);
  }

  const runReport: IngestRunReport = {
    createdAt: new Date().toISOString(),
    totalFiles: allFiles.length,
    routedCount: reports.filter((report) => report.status === "routed").length,
    failedCount: reports.filter((report) => report.status === "failed").length,
    reports,
  };
  const latestReportPath = writeIngestRunReport(runReport);

  console.log("\n  Ingest report\n");
  for (const report of reports) {
    console.log(renderIngestReport(report));
    console.log("");
  }
  console.log(`  📄 JSON report written: ${latestReportPath}`);
}

if (process.argv[1] && path.basename(process.argv[1]) === "classifier.ts") {
  main().catch((err) => {
    console.error("  🔴 Classifier error:", err);
    process.exit(1);
  });
}
