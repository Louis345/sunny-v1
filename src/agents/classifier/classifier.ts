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
 *   npm run learn
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

type DocumentType =
  | "spelling_homework"
  | "math_homework"
  | "reading_assignment"
  | "handwriting_sample"
  | "teacher_note"
  | "report_card"
  | "iep_document"
  | "tutoring_session"
  | "unknown";

type Destination = "homework" | "context";

interface ClassificationResult {
  type: DocumentType;
  destination: Destination;
  date: string;
  summary: string;
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
context destination = teacher_note, report_card, iep_document, tutoring_session, unknown`,
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

function moveToProcessed(filePath: string): void {
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
}

function appendToContext(childName: "Ila" | "Reina", text: string): void {
  const fileName =
    childName === "Ila" ? "ila_context.md" : "reina_context.md";
  const filePath = path.join(ROOT, "src", "context", fileName);
  const timestamp = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
  });
  const entry = `\n\n## Ingested Document — ${timestamp}\n${text}`;
  fs.appendFileSync(filePath, entry, "utf-8");
}

export async function classifyAndRoute(
  childName: "Ila" | "Reina"
): Promise<{ hasNewFiles: boolean; routed: string[] }> {
  const allFiles = collectDropFiles().filter((f) => {
    const child = detectChildFromPath(f);
    return child === childName || child === null;
  });

  if (allFiles.length === 0) {
    return { hasNewFiles: false, routed: [] };
  }

  const client = new Anthropic();
  const routed: string[] = [];

  for (const filePath of allFiles) {
    const filename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const child = detectChildFromPath(filePath) ?? childName;

    if (child !== childName) {
      console.log(`  ⏭️  Skipping ${filename} — belongs to ${child}`);
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
    } catch (err) {
      console.warn(`  ⚠️  Could not read ${filename}: ${String(err)}`);
      continue;
    }

    if (!rawText.trim()) {
      console.warn(`  ⚠️  Empty content for ${filename} — skipping`);
      continue;
    }

    let result: ClassificationResult;
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
    }

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
          const destTxt = path.join(destDir, "spelling-words.txt");
          fs.writeFileSync(destTxt, homeworkText.trim() + "\n", "utf-8");
          const msg = `📚 PDF OCR'd → homework/${child.toLowerCase()}/${date}/`;
          console.log(`  ${msg}`);
          routed.push(msg);
        } catch (err) {
          console.warn(
            `  ⚠️  Homework PDF OCR failed for ${filename}: ${String(err)}`
          );
          continue;
        }
      } else {
        const destFile = path.join(destDir, filename);
        fs.copyFileSync(filePath, destFile);
        const msg = `📚 ${result.type} → homework/${child.toLowerCase()}/${date}/`;
        console.log(`  ${msg}`);
        routed.push(msg);
      }
    } else {
      appendToContext(child, `### ${result.type}\n${result.summary}\n\n${rawText}`);
      const msg = `🧠 ${result.type} → ${child}'s context`;
      console.log(`  ${msg}`);
      routed.push(msg);
    }

    try {
      moveToProcessed(filePath);
    } catch (err) {
      console.warn(`  ⚠️  Could not move ${filename} to processed/: ${String(err)}`);
    }
  }

  return { hasNewFiles: allFiles.length > 0, routed };
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

  const children: Array<"Ila" | "Reina"> = ["Ila", "Reina"];
  const seen = new Set<string>();

  for (const child of children) {
    const { routed } = await classifyAndRoute(child);
    for (const r of routed) seen.add(r);
  }

  if (seen.size === 0) {
    console.log("  ⚠️  No files could be routed (check child name in filename or subfolder)");
  } else {
    console.log(`\n  ✅ ${seen.size} file(s) routed`);
  }
}

main().catch((err) => {
  console.error("  🔴 Classifier error:", err);
  process.exit(1);
});
