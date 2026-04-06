import { tool } from "ai";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { selectNextProblemType } from "../../../algorithms/interleaving";
import type { AttemptInput, MathProblemType } from "../../../algorithms/types";
import { recordAttempt, childIdFromName } from "../../../engine/learningEngine";
import { readLearningProfile } from "../../../utils/learningProfileIO";

const probeCalledThisSession = new Set<string>();

export function resetMathProbeSession(
  childName: "Ila" | "Reina" | "creator",
): void {
  probeCalledThisSession.delete(`${childName}-probe`);
}

export const mathProblem = tool({
  description:
    "Call this after every math attempt to log the result and get the next problem suggestion. The tool auto-computes whether the answer is correct from the operands — you do NOT need to judge correctness. Pass the EXACT operandA, operandB, and operation from the problem on screen. Also call at session start with childAnswer: null to get the opening problem.",
  inputSchema: z.object({
    childName: z.enum(["Ila", "Reina", "creator"]),
    operation: z.enum(["addition", "subtraction"]),
    operandA: z.number(),
    operandB: z.number(),
    childAnswer: z
      .number()
      .nullable()
      .describe("null if this is the opening call to get first problem"),
  }),
  execute: async ({
    childName,
    operation,
    operandA,
    operandB,
    childAnswer,
  }) => {
    const correctAnswer =
      operation === "addition" ? operandA + operandB : operandA - operandB;
    const correct =
      childAnswer !== null ? childAnswer === correctAnswer : null;

    if (childAnswer === null && correct === null) {
      const key = `${childName}-probe`;
      if (probeCalledThisSession.has(key)) {
        return JSON.stringify({
          logged: "probe already called this session — skipped",
          weakSpot: "6-10",
          accuracyByBucket: {},
          suggestion: "Continue with current problem range",
        });
      }
      probeCalledThisSession.add(key);
    }

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

      try {
        const childId = childIdFromName(childName);
        const mathAttempt: AttemptInput = {
          word: `${operandA}${operation === "addition" ? "+" : "-"}${operandB}`,
          domain: "math",
          correct,
          quality: correct ? 5 : 0,
          scaffoldLevel: 0,
        };
        recordAttempt(childId, mathAttempt);
      } catch (e) {
        console.error("  🎮 [mathProblem] engine error (non-fatal):", e);
      }
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
    const hasHistory = Object.values(buckets).some((b) => b.total > 0);
    let weakSpot = "6-10"; // default to harder range, not beginner
    if (hasHistory) {
      let lowestAccuracy = 1;
      for (const [bucket, { correct: c, total }] of Object.entries(buckets)) {
        if (total >= 2) {
          const acc = c / total;
          if (acc < lowestAccuracy) {
            lowestAccuracy = acc;
            weakSpot = bucket;
          }
        }
      }
    } else {
      weakSpot = "6-10"; // default floor — never start below this without data
    }

    const suggestion = hasHistory
      ? `Focus next problems on the ${weakSpot} range. Accuracy there: ${Math.round((buckets[weakSpot as keyof typeof buckets].correct / Math.max(buckets[weakSpot as keyof typeof buckets].total, 1)) * 100)}%`
      : "No history — start at 6-10 range as default floor.";

    let nextRecommendation: MathProblemType = "addition";
    try {
      const profile = readLearningProfile(childIdFromName(childName));
      const perfByType: Record<string, { correct: number; total: number }> = {
        addition: { correct: 0, total: 0 },
        subtraction: { correct: 0, total: 0 },
      };
      for (const h of history) {
        const k = h.operation === "subtraction" ? "subtraction" : "addition";
        perfByType[k].total++;
        if (h.correct) perfByType[k].correct++;
      }
      const recentHistoryFromLog = [...history]
        .reverse()
        .map((h) => ({
          type: (h.operation === "subtraction"
            ? "subtraction"
            : "addition") as MathProblemType,
          correct: h.correct,
        }));
      const interleavingResult = selectNextProblemType({
        availableTypes: ["addition", "subtraction"],
        recentHistory: recentHistoryFromLog,
        performanceByType: perfByType,
        params:
          profile?.algorithmParams?.interleaving ?? {
            weakestWeight: 0.5,
            secondWeight: 0.3,
            randomWeight: 0.2,
            minTypeExposure: 0.15,
          },
      });
      nextRecommendation = interleavingResult.nextType;
    } catch {
      // Silent fallback
    }

    return JSON.stringify({
      logged:
        correct !== null
          ? `${operandA} ${operation === "addition" ? "+" : "-"} ${operandB} = ${childAnswer} (${correct ? "✅" : "❌"}) [answer: ${correctAnswer}]`
          : "session start",
      correct,
      correctAnswer: childAnswer !== null ? correctAnswer : undefined,
      weakSpot,
      accuracyByBucket: buckets,
      suggestion,
      nextRecommendation,
    });
  },
});
