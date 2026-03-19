import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";

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
    .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f))
    .sort()
    .reverse();

  return folders.length > 0 ? path.join(base, folders[0]) : null;
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
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
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
