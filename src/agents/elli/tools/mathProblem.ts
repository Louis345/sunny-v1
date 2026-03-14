import { tool } from "ai";
import fs from "fs";
import path from "path";
import { z } from "zod";

export const mathProblem = tool({
  description:
    "Call this after every math attempt to log the result and get context for the next problem. Also call at session start to get the opening problem.",
  inputSchema: z.object({
    childName: z.enum(["Ila", "Reina"]),
    operation: z.enum(["addition", "subtraction"]),
    operandA: z.number(),
    operandB: z.number(),
    childAnswer: z
      .number()
      .nullable()
      .describe("null if this is the opening call to get first problem"),
    correct: z.boolean().nullable().describe("null if this is the opening call"),
  }),
  execute: async ({
    childName,
    operation,
    operandA,
    operandB,
    childAnswer,
    correct,
  }) => {
    const timestamp = new Date().toISOString();
    const logsDir = path.resolve(process.cwd(), "src", "logs");
    await fs.promises.mkdir(logsDir, { recursive: true });

    const fileName = `${childName.toLowerCase()}_math.json`;
    const filePath = path.resolve(logsDir, fileName);

    if (correct !== null) {
      const entry =
        JSON.stringify({
          timestamp,
          operation,
          operandA,
          operandB,
          childAnswer,
          correct,
        }) + "\n";
      await fs.promises.appendFile(filePath, entry, "utf-8");
    }

    // Load history to find weak spots
    let history: Array<{
      operation: string;
      operandA: number;
      operandB: number;
      correct: boolean;
    }> = [];
    try {
      const lines = fs
        .readFileSync(filePath, "utf-8")
        .trim()
        .split("\n")
        .filter(Boolean);
      history = lines.map((l) => JSON.parse(l));
    } catch {}

    // Find weak ranges: group by operand size bucket (0-5, 6-10, 11-20)
    const buckets = {
      "0-5": { correct: 0, total: 0 },
      "6-10": { correct: 0, total: 0 },
      "11-20": { correct: 0, total: 0 },
    };
    for (const h of history) {
      const max = Math.max(h.operandA, h.operandB);
      const bucket =
        max <= 5 ? "0-5" : max <= 10 ? "6-10" : "11-20";
      buckets[bucket].total++;
      if (h.correct) buckets[bucket].correct++;
    }

    // Find weakest bucket (lowest accuracy with at least 2 attempts)
    let weakestBucket = "0-5";
    let lowestAccuracy = 1;
    for (const [bucket, { correct: c, total }] of Object.entries(buckets)) {
      if (total >= 2) {
        const acc = c / total;
        if (acc < lowestAccuracy) {
          lowestAccuracy = acc;
          weakestBucket = bucket;
        }
      }
    }

    return JSON.stringify({
      logged:
        correct !== null
          ? `${operandA} ${operation === "addition" ? "+" : "-"} ${operandB} = ${childAnswer} (${correct ? "✅" : "❌"})`
          : "session start",
      weakSpot: weakestBucket,
      accuracyByBucket: buckets,
      suggestion: `Focus next problems on the ${weakestBucket} range. Accuracy there: ${Math.round((buckets[weakestBucket as keyof typeof buckets].correct / Math.max(buckets[weakestBucket as keyof typeof buckets].total, 1)) * 100)}%`,
    });
  },
});
