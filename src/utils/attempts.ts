import fs from "fs";
import path from "path";

export function loadAttemptHistory(childName: "Ila" | "Reina"): string {
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
