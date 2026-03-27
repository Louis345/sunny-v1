import assert from "node:assert";
import type { HomeworkProblemItem } from "../agents/psychologist/psychologist";
import {
  gradeWorksheetTranscript,
  normalizeWorksheetProblem,
  toWorksheetCanvasSource,
  toWorksheetPromptProblem,
} from "../server/worksheet-problem";

let failures = 0;

function ok(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`  ✅ ${name}`);
  } else {
    console.log(`  ❌ ${name}`);
    if (detail) console.log(`     ${detail}`);
    failures++;
  }
}

console.log("\nworksheet problem normalization\n");

const cookieProblem: HomeworkProblemItem = {
  id: 1,
  question: "I spent 35 cents. How many cookies did I buy?",
  instructions: ["Write the number of cookies."],
  answer: "6 cookies",
  hint: "Each cookie costs 10 cents.",
  canvas_display: "Someone spent 35 cents total on cookies.",
};

const normalizedCookie = normalizeWorksheetProblem(cookieProblem);
ok(
  "money count problem is normalized",
  normalizedCookie.ok === true && normalizedCookie.problem.kind === "money_count",
  JSON.stringify(normalizedCookie),
);
ok(
  "contradictory extracted answer is replaced by canonical server answer",
  normalizedCookie.ok === true && normalizedCookie.problem.canonicalAnswer === "3",
  JSON.stringify(normalizedCookie),
);
ok(
  "prompt problem uses canonical answer",
  normalizedCookie.ok === true &&
    toWorksheetPromptProblem(normalizedCookie.problem).answer === "3",
  JSON.stringify(
    normalizedCookie.ok === true
      ? toWorksheetPromptProblem(normalizedCookie.problem)
      : normalizedCookie,
  ),
);
ok(
  "canvas source uses canonical facts",
  normalizedCookie.ok === true &&
    toWorksheetCanvasSource(normalizedCookie.problem).canvas_display.includes(
      "Cookie 10¢",
    ) &&
    toWorksheetCanvasSource(normalizedCookie.problem).canvas_display.includes(
      "Total spent 35¢",
    ),
  JSON.stringify(
    normalizedCookie.ok === true
      ? toWorksheetCanvasSource(normalizedCookie.problem)
      : normalizedCookie,
  ),
);
ok(
  "server grades transcript from canonical worksheet facts",
  normalizedCookie.ok === true &&
    gradeWorksheetTranscript(normalizedCookie.problem, "three cookies") === true,
);
ok(
  "server rejects contradictory extracted answer during grading",
  normalizedCookie.ok === true &&
    gradeWorksheetTranscript(normalizedCookie.problem, "six cookies") === false,
);

const compareProblem: HomeworkProblemItem = {
  id: 2,
  question: "Which amount is greater, 36 cents or 41 cents?",
  instructions: [],
  answer: "41 cents",
  hint: "Look for the larger amount.",
  canvas_display: "Two piles of coins. One pile shows 36¢. The other pile shows 41¢.",
};

const normalizedCompare = normalizeWorksheetProblem(compareProblem);
ok(
  "comparison problem is normalized",
  normalizedCompare.ok === true &&
    normalizedCompare.problem.kind === "compare_amounts" &&
    normalizedCompare.problem.canonicalAnswer === "41",
  JSON.stringify(normalizedCompare),
);

const structuredCompareProblem: HomeworkProblemItem = {
  id: 4,
  question: "legacy fallback question",
  instructions: [],
  answer: "155",
  hint: "Compare the amounts.",
  canvas_display: "Legacy fallback scene.",
  structured: {
    page: 2,
    promptVisible:
      "Which student has more money, the one with $1.18 or the one with $1.55?",
    promptSpoken:
      "Which student has more money, the one with $1.18 or the one with $1.55?",
    problemType: "compare_amounts",
    answerKind: "numeric",
    canonicalAnswer: "155",
    visibleFacts: {
      kind: "compare_amounts",
      leftAmountCents: 118,
      rightAmountCents: 155,
      askVisual: "greater",
    },
    evidence: ["left amount is $1.18", "right amount is $1.55"],
    confidence: 0.99,
    linkedGames: ["store-game"],
    overlayTargets: [],
  },
};

const normalizedStructuredCompare = normalizeWorksheetProblem(structuredCompareProblem);
ok(
  "structured compare problem bypasses prose parser and normalizes directly",
  normalizedStructuredCompare.ok === true &&
    normalizedStructuredCompare.problem.kind === "compare_amounts" &&
    normalizedStructuredCompare.problem.leftAmountCents === 118 &&
    normalizedStructuredCompare.problem.rightAmountCents === 155 &&
    normalizedStructuredCompare.problem.question.includes("$1.55") &&
    normalizedStructuredCompare.problem.page === 2,
  JSON.stringify(normalizedStructuredCompare),
);
ok(
  "structured compare problem keeps linked games on canonical problem",
  normalizedStructuredCompare.ok === true &&
    normalizedStructuredCompare.problem.linkedGames?.includes("store-game") === true,
  JSON.stringify(normalizedStructuredCompare),
);

const unsupportedProblem: HomeworkProblemItem = {
  id: 3,
  question: "What is 3 times 4?",
  instructions: [],
  answer: "12",
  hint: "Use multiplication.",
  canvas_display: "Three groups of four stars.",
};

const unsupported = normalizeWorksheetProblem(unsupportedProblem);
ok(
  "unsupported worksheet rows fail closed",
  unsupported.ok === false && unsupported.reason === "unsupported_problem_type",
  JSON.stringify(unsupported),
);

if (failures > 0) {
  console.log(`\n  ${failures} assertion(s) failed\n`);
  process.exit(1);
}

assert.ok(true);
console.log("\n  All worksheet problem assertions passed\n");
