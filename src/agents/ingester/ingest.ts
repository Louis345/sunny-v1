/**
 * Document Ingester Agent
 *
 * Drop files into src/intake/{ila|reina}/ and run:
 *   npx tsx src/agents/ingester/ingest.ts
 *   or: npm run sunny:ingest / npm run sunny:sync
 *
 * Supported document types:
 *   - Report cards (grades, teacher comments)
 *   - Human tutor session notes
 *   - IEP updates / evaluation reports
 *   - Progress monitoring data
 *
 * Output:
 *   - Report cards → appended to context/ila/soul.md or context/reina/soul.md
 *   - Session notes → appended to context/ila/ila_context.md or context/reina/reina_context.md
 *   - IEP updates → merged into soul file under ## Evaluation Updates
 */

import fs from "fs";
import path from "path";
import "dotenv/config";
import { resolveContextFilePath } from "../../utils/childContextPaths";
import type { ChildName } from "../../utils/childContextPaths";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { INTAKE_PROMPT } from "../prompts";

const INTAKE_DIR = path.resolve(process.cwd(), "src", "intake");
const SUPPORTED_EXTENSIONS = [".txt", ".md", ".json", ".vtt"];

/** Which child owns this path — derived only from `src/intake/ila/` vs `src/intake/reina/`. */
function childFromIntakePath(filePath: string): "Ila" | "Reina" {
  const abs = path.resolve(filePath);
  const ilaRoot = path.resolve(INTAKE_DIR, "ila");
  const reinaRoot = path.resolve(INTAKE_DIR, "reina");
  const under =
    (root: string) => abs === root || abs.startsWith(root + path.sep);
  if (under(ilaRoot)) return "Ila";
  if (under(reinaRoot)) return "Reina";
  throw new Error(`Intake file outside src/intake/ila or src/intake/reina: ${filePath}`);
}

/** All supported files under `dir` (recursive). */
function collectIntakeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) {
      out.push(...collectIntakeFiles(full));
    } else if (
      SUPPORTED_EXTENSIONS.includes(path.extname(name.name).toLowerCase()) &&
      !name.name.startsWith(".")
    ) {
      out.push(full);
    }
  }
  return out;
}

function parseVtt(content: string): string {
  return content
    .split("\n")
    .filter((line) => {
      if (!line.trim()) return false;
      if (line.trim() === "WEBVTT") return false;
      if (/^\d+$/.test(line.trim())) return false;
      if (/-->/i.test(line)) return false;
      return true;
    })
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

interface IngestResult {
  file: string;
  child: "Ila" | "Reina";
  type:
    | "report_card"
    | "tutor_notes"
    | "iep_update"
    | "progress_data"
    | "zoom_transcript"
    | "unknown";
  destination: "soul" | "context" | "curriculum";
  summary: string;
}

async function classifyAndExtract(
  content: string,
  filename: string,
  child: "Ila" | "Reina"
): Promise<{ type: IngestResult["type"]; destination: IngestResult["destination"]; formatted: string }> {
  const soulFolder = child === "Ila" ? "ila" : "reina";
  const currentSoul = fs.readFileSync(
    path.resolve(process.cwd(), "src", "context", soulFolder, "soul.md"),
    "utf-8",
  );

  const { text } = await generateText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: INTAKE_PROMPT(child, currentSoul),
    prompt: `Document filename: ${filename}

Document content:
${content}

Classify and extract this document.`,
    maxOutputTokens: 2000,
  });

  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    const result = JSON.parse(cleaned);
    return result;
  } catch {
    return {
      type: "unknown",
      destination: "context",
      formatted: `## Ingested Document — ${new Date().toLocaleDateString()}\n\nFilename: ${filename}\n\n${content.slice(0, 500)}`,
    };
  }
}

async function processFile(filePath: string): Promise<IngestResult> {
  const child = childFromIntakePath(filePath);
  const filename = path.basename(filePath);
  const content = fs.readFileSync(filePath, "utf-8");

  let processedContent = content;
  if (filename.endsWith(".vtt")) {
    processedContent = parseVtt(content);
    console.log(
      `  📝 Parsed VTT: ${content.split("\n").length} lines → ` +
        `${processedContent.split("\n").length} dialogue lines`
    );
  }

  console.log(`  📄 Processing: ${filename} for ${child}...`);

  const { type, destination, formatted } = await classifyAndExtract(
    processedContent,
    filename,
    child
  );

  const targetFile =
    destination === "soul"
      ? path.resolve(
          process.cwd(),
          "src",
          "context",
          child === "Ila" ? "ila" : "reina",
          "soul.md",
        )
      : resolveContextFilePath(child as ChildName);

  const separator = "\n\n---\n\n";
  fs.appendFileSync(targetFile, separator + formatted, "utf-8");

  console.log(`  ✅ Appended to ${path.basename(targetFile)}`);

  // Move processed file to src/intake/processed/
  const processedDir = path.resolve(INTAKE_DIR, "processed");
  fs.mkdirSync(processedDir, { recursive: true });
  fs.renameSync(filePath, path.resolve(processedDir, filename));

  return { file: filename, child, type, destination, summary: formatted.slice(0, 100) };
}

/** Exported for orchestration (e.g. src/scripts/sync.ts). Scans both ila and reina intake trees. */
export async function runIngest(): Promise<void> {
  console.log("\n  📥 Document Ingester — scanning src/intake/\n");

  // Ensure intake directories exist
  ["ila", "reina"].forEach((name) => {
    fs.mkdirSync(path.resolve(INTAKE_DIR, name), { recursive: true });
    fs.mkdirSync(path.resolve(INTAKE_DIR, name, "zoom-sessions"), { recursive: true });
  });

  const results: IngestResult[] = [];

  for (const child of ["Ila", "Reina"] as const) {
    const childDir = path.resolve(INTAKE_DIR, child.toLowerCase());
    if (!fs.existsSync(childDir)) continue;

    const files = collectIntakeFiles(childDir);

    if (files.length === 0) {
      console.log(`  ℹ️  No files in src/intake/${child.toLowerCase()}/`);
      continue;
    }

    for (const file of files) {
      const result = await processFile(file);
      results.push(result);
    }
  }

  if (results.length === 0) {
    console.log("\n  No files to process. Drop files into:\n    src/intake/ila/\n    src/intake/reina/\n");
    return;
  }

  console.log(`\n  📊 Ingested ${results.length} document(s):`);
  results.forEach((r) => {
    console.log(`    ${r.file} → ${r.type} → ${r.child}'s ${r.destination} file`);
  });

  // Trigger curriculum planner for each child whose context was updated
  const childrenWithContextUpdate = [
    ...new Set(
      results.filter((r) => r.destination === "context").map((r) => r.child)
    ),
  ];
  if (childrenWithContextUpdate.length > 0) {
    console.log("\n  🔄 Context updated — re-running Curriculum Planner...");
    const { curriculumPlanner } = await import("../curriculum-planner/planner");
    for (const child of childrenWithContextUpdate) {
      await curriculumPlanner(child);
    }
  }

  console.log("\n  ✅ Ingestion complete. Processed files moved to src/intake/processed/\n");
}

if (require.main === module) {
  runIngest().catch(console.error);
}
