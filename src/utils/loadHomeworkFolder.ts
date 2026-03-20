import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Parse homework date folder names. Accepts:
 * - ISO: 2026-03-19
 * - US-style: 3-19-2026, 03-19-2026
 * Returns UTC ms for sorting (newest first), or null if unrecognized.
 */
function parseHomeworkDateFolderName(name: string): number | null {
  const parts = name.split("-");
  if (parts.length !== 3) return null;

  const [a, b, c] = parts;
  // ISO: YYYY-MM-DD
  if (/^\d{4}$/.test(a) && /^\d{2}$/.test(b) && /^\d{2}$/.test(c)) {
    const y = parseInt(a, 10);
    const mo = parseInt(b, 10);
    const d = parseInt(c, 10);
    const t = Date.UTC(y, mo - 1, d);
    return Number.isNaN(t) ? null : t;
  }
  // US: M-D-YYYY
  if (/^\d{1,2}$/.test(a) && /^\d{1,2}$/.test(b) && /^\d{4}$/.test(c)) {
    const mo = parseInt(a, 10);
    const d = parseInt(b, 10);
    const y = parseInt(c, 10);
    const t = Date.UTC(y, mo - 1, d);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

export function findLatestHomeworkFolder(
  childName: "Ila" | "Reina"
): string | null {
  const base = path.join(
    process.cwd(),
    "homework",
    childName.toLowerCase()
  );

  if (!fs.existsSync(base)) return null;

  const folders = fs
    .readdirSync(base)
    .map((name) => {
      const full = path.join(base, name);
      if (!fs.statSync(full).isDirectory()) return null;
      const ts = parseHomeworkDateFolderName(name);
      return ts !== null ? { name, ts } : null;
    })
    .filter((x): x is { name: string; ts: number } => x !== null)
    .sort((x, y) => y.ts - x.ts);

  return folders.length > 0 ? path.join(base, folders[0].name) : null;
}

export interface HomeworkFile {
  filename: string;
  type: "image" | "notes";
  content: string;
  mimeType?: string;
}

export function readHomeworkFolder(folderPath: string): HomeworkFile[] {
  const files = fs.readdirSync(folderPath);
  const result: HomeworkFile[] = [];

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    if (fs.statSync(filePath).isDirectory()) continue;

    const ext = path.extname(file).toLowerCase();

    if ([".jpg", ".jpeg", ".png"].includes(ext)) {
      const buffer = fs.readFileSync(filePath);
      const base64 = buffer.toString("base64");
      const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
      result.push({
        filename: file,
        type: "image",
        content: base64,
        mimeType,
      });
    } else if (file === "notes.txt") {
      const text = fs.readFileSync(filePath, "utf-8");
      result.push({
        filename: file,
        type: "notes",
        content: text,
      });
    }
    // All other file types (including .pdf) — skip silently
  }

  return result;
}

export async function extractHomeworkContent(
  files: HomeworkFile[]
): Promise<string> {
  const client = new Anthropic();

  const imageFiles = files.filter((f) => f.type === "image");
  const notes = files.find((f) => f.type === "notes");

  if (imageFiles.length === 0) return "";

  const content: Anthropic.MessageParam["content"] = [
    ...imageFiles.map((f) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: f.mimeType as "image/jpeg" | "image/png",
        data: f.content,
      },
    })),
    {
      type: "text" as const,
      text: `These are scanned homework pages for a child.
Extract all content exactly as written.
For each page identify:
- Subject (spelling, math, reading, etc)
- All words, problems, or questions present
- Any instructions visible on the page
Return as plain text, one section per page.
${notes ? `Parent notes: ${notes.content}` : ""}`,
    },
  ];

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2000,
    messages: [{ role: "user", content }],
  });

  return response.content
    .filter((block) => block.type === "text")
    .map((block) => ("text" in block ? block.text : ""))
    .join("\n");
}

export interface HomeworkPayload {
  childName: string;
  date: string;
  rawContent: string;
  fileCount: number;
  hasNotes: boolean;
}

export async function loadHomeworkPayload(
  childName: "Ila" | "Reina"
): Promise<HomeworkPayload | null> {
  const folder = findLatestHomeworkFolder(childName);
  if (!folder) return null;

  const date = path.basename(folder);
  const files = readHomeworkFolder(folder);

  if (files.filter((f) => f.type === "image").length === 0) {
    return null;
  }

  console.log(
    `  📂 Homework folder found for ${childName}: ` +
      `${date} (${files.length} files)`
  );

  const rawContent = await extractHomeworkContent(files);

  return {
    childName,
    date,
    rawContent,
    fileCount: files.filter((f) => f.type === "image").length,
    hasNotes: files.some((f) => f.type === "notes"),
  };
}
