import * as fs from "fs";
import * as path from "path";

export interface HomeworkProblem {
  type: "place_value" | "simple_math";
  operandA: number;
  operandB: number;
  operation?: "addition" | "subtraction";
  label?: string;
}

export interface HomeworkAssignment {
  id: string;
  child: string;
  subject: string;
  topic: string;
  due_date: string;
  urgency: "high" | "medium" | "low";
  source?: string;
  problems: HomeworkProblem[];
  notes?: string;
  status: "active" | "completed";
  sessions_practiced: number;
  completed: boolean;
  completed_by: string | null;
  completed_at: string | null;
}

const HOMEWORK_DIR = path.resolve(process.cwd(), "homework");

/**
 * Scans homework/<child>/ for JSON files and returns the newest active assignment.
 * Deterministic: newest file by mtime wins. Returns null if none found or all completed.
 */
export function loadHomework(childName: "Ila" | "Reina"): HomeworkAssignment | null {
  const dir = path.join(HOMEWORK_DIR, childName.toLowerCase());

  if (!fs.existsSync(dir)) return null;

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({
      filePath: path.join(dir, f),
      mtime: fs.statSync(path.join(dir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime); // newest first

  for (const { filePath } of files) {
    try {
      const hw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as HomeworkAssignment;
      if (!hw.completed && hw.status !== "completed") {
        console.log(`  📚 Homework loaded for ${childName}: ${hw.id} (due ${hw.due_date})`);
        return hw;
      }
    } catch {
      // skip malformed files
    }
  }

  return null;
}

/**
 * Converts a homework assignment into the "WHAT TO WORK ON TODAY" prompt section.
 * This replaces the standard curriculum when homework is present.
 */
export function homeworkToPrompt(hw: HomeworkAssignment): string {
  const problemList = hw.problems
    .map((p, i) => {
      const op = p.operation === "subtraction" ? "−" : "+";
      const tag = p.label ? ` (${p.label})` : "";
      if (p.type === "place_value") {
        return `  Problem ${i + 1}${tag}: ${p.operandA} ${op} ${p.operandB}  →  showCanvas(mode="place_value", placeValueData={ operandA: ${p.operandA}, operandB: ${p.operandB}, operation: "${p.operation ?? "addition"}", layout: "column", scaffoldLevel: "full", activeColumn: "hundreds", revealedColumns: [] })`;
      }
      // simple_math — single-digit or two-digit, show on teaching canvas
      const content = `${p.operandA} ${op === "−" ? "-" : "+"} ${p.operandB}`;
      return `  Problem ${i + 1}${tag}: ${p.operandA} ${op} ${p.operandB}  →  showCanvas(mode=teaching, content="${content}")`;
    })
    .join("\n");

  const hasWarmups = hw.problems.some((p) => p.label?.toLowerCase().includes("warm"));

  return `HOMEWORK OVERRIDE — ignore the standard curriculum today. This takes priority.

${hw.child} has ${hw.subject} homework due ${hw.due_date}. Urgency: ${hw.urgency}.
Topic: ${hw.topic.replace(/_/g, " ")}
${hw.source ? `Source: ${hw.source}` : ""}

Problems (work through in order):
${problemList}
${hasWarmups ? "\nStart with the warm-up problems (simple_math) to build confidence before the place_value worksheet problems.\n" : ""}
How to teach each place_value problem:
1. Call showCanvas with mode="place_value" and placeValueData={operandA, operandB, operation, layout: "column", scaffoldLevel: "full", activeColumn: "hundreds", revealedColumns: []}.
   IMPORTANT: operandA, operandB, operation, layout, scaffoldLevel, activeColumn, and revealedColumns MUST be inside the placeValueData object — they are NOT top-level parameters.
2. Ask "What goes in the hundreds place?" — set activeColumn: "hundreds" in placeValueData.
3. Wait for her answer. If correct, add "hundreds" to revealedColumns and set activeColumn: "tens".
4. Repeat for tens, then ones — always updating revealedColumns and activeColumn inside placeValueData.
5. When all three columns are revealed, celebrate and move to the next problem.
6. Use scaffoldLevel: "full" throughout — Ila needs labels and dividers.
7. If she struggles on a column, say the answer and move on. Never drill the same column more than twice.
${hw.notes ? `\nTeacher notes: ${hw.notes}` : ""}
Once all problems are complete, celebrate warmly and end the session.
Do NOT switch to Wilson Reading today. Math homework only.`.trim();
}
