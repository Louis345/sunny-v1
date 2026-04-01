import fs from "fs";
import path from "path";

/**
 * Patterns that signal the model stalled or got confused.
 * Any output containing these should never be persisted into a child's context file.
 */
const CONFUSED_OUTPUT_PATTERNS = [
  /which child am i (analyzing|planning for)/i,
  /i cannot proceed without confirmation/i,
  /you've given me conflicting information/i,
  /do not ask me to guess/i,
  /tell me explicitly/i,
];

/** Terms that belong to the OTHER child — cross-contamination guard. */
const WRONG_CHILD_PATTERNS: Record<"Ila" | "Reina", RegExp[]> = {
  // Reina's file must never contain Ila-specific clinical markers
  Reina: [
    /querySessions\(["']Ila["']/i,
    /wilson reading/i,
    /dyslexia.*ADHD|ADHD.*dyslexia/i,
    /following directions 2nd percentile/i,
    /word reading 12th percentile/i,
  ],
  // Ila's file must never contain Reina-specific markers
  Ila: [
    /querySessions\(["']Reina["']/i,
    /wrestling championship/i,
    /multiplication.*division readiness/i,
  ],
};

function isConfusedOutput(content: string): boolean {
  return CONFUSED_OUTPUT_PATTERNS.some((p) => p.test(content));
}

function hasWrongChildContent(
  childName: "Ila" | "Reina",
  content: string,
): boolean {
  return WRONG_CHILD_PATTERNS[childName].some((p) => p.test(content));
}

export async function appendToContext(
  childName: "Ila" | "Reina",
  heading: string,
  content: string,
): Promise<void> {
  if (isConfusedOutput(content)) {
    console.error(
      `  🔴 [appendToContext] REJECTED — model output appears stalled/confused. Not writing to ${childName}'s context.`,
    );
    console.error(`  🔴 [appendToContext] Heading: "${heading}"`);
    console.error(`  🔴 [appendToContext] Snippet: "${content.slice(0, 200)}"`);
    return;
  }

  if (hasWrongChildContent(childName, content)) {
    console.error(
      `  🔴 [appendToContext] REJECTED — output contains content for the wrong child. Not writing to ${childName}'s context.`,
    );
    console.error(`  🔴 [appendToContext] Heading: "${heading}"`);
    console.error(`  🔴 [appendToContext] Snippet: "${content.slice(0, 200)}"`);
    return;
  }

  const timestamp = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
  });
  const fileName = childName === "Ila" ? "ila_context.md" : "reina_context.md";
  const filePath = path.resolve(process.cwd(), "src", "context", fileName);
  const entry = `\n\n## ${heading} — ${timestamp}\n${content}`;
  await fs.promises.appendFile(filePath, entry, "utf-8");
  console.log(`  ✅ Appended to ${fileName}`);
}
