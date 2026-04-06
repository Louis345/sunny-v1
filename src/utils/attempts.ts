import fs from "fs";
import path from "path";
import { shouldLoadPersistedHistory, shouldPersistSessionData } from "./runtimeMode";
import type { ChildName } from "./childContextPaths";

/** Append one worksheet attempt line after server-side validation (not in tool execute). */
export async function appendWorksheetAttemptLine(input: {
  childName: ChildName;
  problemId: string;
  correct: boolean;
}): Promise<void> {
  if (!shouldPersistSessionData()) return;
  const logsDir = path.resolve(process.cwd(), "src", "logs");
  await fs.promises.mkdir(logsDir, { recursive: true });
  const fileName =
    input.childName === "Ila"
      ? "ila_attempts.json"
      : input.childName === "Reina"
        ? "reina_attempts.json"
        : "creator_attempts.json";
  const filePath = path.join(logsDir, fileName);
  const timestamp = new Date().toISOString();
  const word = `worksheet-q${input.problemId}-${timestamp.slice(11, 23)}`;
  const entry =
    JSON.stringify({ timestamp, word, correct: input.correct }) + "\n";
  await fs.promises.appendFile(filePath, entry, "utf-8");
  console.log(
    `  🎮 [worksheet] logWorksheetAttempt persisted ${input.correct ? "correct" : "incorrect"} q${input.problemId}`,
  );
}

/** Append one spelling/reading-style attempt line under src/context/{child}/attempts/ (NDJSON per day). */
export function appendAttemptLine(
  childName: ChildName | string,
  entry: { word: string; correct: boolean },
): void {
  if (!shouldPersistSessionData()) return;
  const dir = path.resolve(
    process.cwd(),
    "src",
    "context",
    String(childName).toLowerCase(),
    "attempts",
  );
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const file = path.join(dir, `${today}.ndjson`);
  const line =
    JSON.stringify({
      ...entry,
      timestamp: new Date().toISOString(),
    }) + "\n";
  fs.appendFileSync(file, line, "utf-8");
}

export function loadAttemptHistory(childName: "Ila" | "Reina"): string {
  if (!shouldLoadPersistedHistory()) return "(stateless run — no persisted attempt history)";

  const fileName = childName === "Ila" ? "ila_attempts.json" : "reina_attempts.json";
  const attemptsPath = path.resolve(process.cwd(), "src", "logs", fileName);
  if (!fs.existsSync(attemptsPath)) return "(no attempt history yet)";

  const lines = fs.readFileSync(attemptsPath, "utf-8").trim().split("\n");
  if (lines.length === 0 || (lines.length === 1 && !lines[0])) return "(no attempt history yet)";

  const byWord: Record<string, { correct: number; incorrect: number }> = {};
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const { word, correct } = JSON.parse(line) as { word: string; correct: boolean };
      const key = word.toLowerCase().trim();
      if (!byWord[key]) byWord[key] = { correct: 0, incorrect: 0 };
      if (correct) byWord[key].correct++;
      else byWord[key].incorrect++;
    } catch {
      // skip malformed lines
    }
  }

  const entries = Object.entries(byWord)
    .sort((a, b) => {
      const totalA = a[1].correct + a[1].incorrect;
      const totalB = b[1].correct + b[1].incorrect;
      return totalB - totalA;
    })
    .map(([word, { correct, incorrect }]) => `- ${word}: ${correct} correct, ${incorrect} incorrect`);

  return entries.length ? entries.join("\n") : "(no attempt history yet)";
}
