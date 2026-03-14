/**
 * Document Ingester Agent
 *
 * Drop files into src/intake/{ila|reina}/ and run:
 *   npm run ingest
 *
 * Supported document types:
 *   - Report cards (grades, teacher comments)
 *   - Human tutor session notes
 *   - IEP updates / evaluation reports
 *   - Progress monitoring data
 *
 * Output:
 *   - Report cards → appended to souls/ila.md or souls/reina.md
 *   - Session notes → appended to context/ila_context.md or reina_context.md
 *   - IEP updates → merged into soul file under ## Evaluation Updates
 */

import fs from "fs";
import path from "path";
import "dotenv/config";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { INTAKE_PROMPT } from "../prompts";

const INTAKE_DIR = path.resolve(process.cwd(), "src", "intake");
const SUPPORTED_EXTENSIONS = [".txt", ".md", ".json"];

interface IngestResult {
  file: string;
  child: "Ila" | "Reina";
  type: "report_card" | "tutor_notes" | "iep_update" | "progress_data" | "unknown";
  destination: "soul" | "context" | "curriculum";
  summary: string;
}

async function classifyAndExtract(
  content: string,
  filename: string,
  child: "Ila" | "Reina"
): Promise<{ type: IngestResult["type"]; destination: IngestResult["destination"]; formatted: string }> {
  const currentSoul = fs.readFileSync(
    path.resolve(process.cwd(), "src", "souls", child === "Ila" ? "ila.md" : "reina.md"),
    "utf-8"
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

async function processFile(filePath: string, child: "Ila" | "Reina"): Promise<IngestResult> {
  const filename = path.basename(filePath);
  const content = fs.readFileSync(filePath, "utf-8");

  console.log(`  📄 Processing: ${filename} for ${child}...`);

  const { type, destination, formatted } = await classifyAndExtract(content, filename, child);

  const targetFile =
    destination === "soul"
      ? path.resolve(process.cwd(), "src", "souls", child === "Ila" ? "ila.md" : "reina.md")
      : path.resolve(
          process.cwd(),
          "src",
          "context",
          child === "Ila" ? "ila_context.md" : "reina_context.md"
        );

  const separator = "\n\n---\n\n";
  fs.appendFileSync(targetFile, separator + formatted, "utf-8");

  console.log(`  ✅ Appended to ${path.basename(targetFile)}`);

  // Move processed file to src/intake/processed/
  const processedDir = path.resolve(INTAKE_DIR, "processed");
  fs.mkdirSync(processedDir, { recursive: true });
  fs.renameSync(filePath, path.resolve(processedDir, filename));

  return { file: filename, child, type, destination, summary: formatted.slice(0, 100) };
}

async function main(): Promise<void> {
  console.log("\n  📥 Document Ingester — scanning src/intake/\n");

  // Ensure intake directories exist
  ["ila", "reina"].forEach((name) => {
    fs.mkdirSync(path.resolve(INTAKE_DIR, name), { recursive: true });
  });

  const results: IngestResult[] = [];

  for (const child of ["Ila", "Reina"] as const) {
    const childDir = path.resolve(INTAKE_DIR, child.toLowerCase());
    if (!fs.existsSync(childDir)) continue;

    const files = fs
      .readdirSync(childDir)
      .filter(
        (f) =>
          SUPPORTED_EXTENSIONS.includes(path.extname(f).toLowerCase()) && !f.startsWith(".")
      );

    if (files.length === 0) {
      console.log(`  ℹ️  No files in src/intake/${child.toLowerCase()}/`);
      continue;
    }

    for (const file of files) {
      const result = await processFile(path.resolve(childDir, file), child);
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

  // Trigger curriculum planner if context was updated
  if (results.some((r) => r.destination === "context")) {
    console.log("\n  🔄 Context updated — re-running Curriculum Planner...");
    const { curriculumPlanner } = await import("../curriculum-planner/planner");
    await curriculumPlanner();
  }

  console.log("\n  ✅ Ingestion complete. Processed files moved to src/intake/processed/\n");
}

main().catch(console.error);
