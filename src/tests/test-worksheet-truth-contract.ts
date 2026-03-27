import assert from "node:assert";
import {
  gradeWorksheetTranscript,
  normalizeWorksheetProblem,
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

console.log("\nworksheet truth contract\n");

const cookieProblem = {
  id: 1,
  question: "I spent 35 cents. How many cookies did I buy?",
  instructions: [],
  answer: "6 cookies",
  hint: "Each cookie costs 10 cents.",
  canvas_display: "Someone spent 35 cents total on cookies.",
};
const normalizedCookie = normalizeWorksheetProblem(cookieProblem);

ok(
  "server normalizes worksheet row into canonical problem",
  normalizedCookie.ok === true,
  JSON.stringify(normalizedCookie),
);
ok(
  "server derives canonical answer from worksheet facts",
  normalizedCookie.ok === true && normalizedCookie.problem.canonicalAnswer === "3",
  JSON.stringify(normalizedCookie),
);
ok(
  "three cookies is graded correct against canonical worksheet facts",
  normalizedCookie.ok === true &&
    gradeWorksheetTranscript(
      normalizedCookie.problem,
      "I can buy three cookies",
    ) === true,
  JSON.stringify(normalizedCookie),
);
ok(
  "six cookies is graded incorrect against canonical worksheet facts",
  normalizedCookie.ok === true &&
    gradeWorksheetTranscript(normalizedCookie.problem, "six cookies") === false,
  JSON.stringify(normalizedCookie),
);
ok(
  "unsupported worksheet rows are rejected instead of guessed",
  normalizeWorksheetProblem({
    id: 2,
    question: "What is 3 times 4?",
    instructions: [],
    answer: "12",
    hint: "Use multiplication.",
    canvas_display: "Three groups of four stars.",
  }).ok === false,
);

const dollarCompareProblem = normalizeWorksheetProblem({
  id: 3,
  question: "Who has more money, the first child or the second child?",
  instructions: [],
  answer: "$1.55",
  hint: "Compare the two dollar amounts.",
  canvas_display:
    "The first child has $1.18. The second child has $1.55. Circle the child with the most money.",
});
ok(
  "server preserves dollar amounts as full cents in compare problems",
  dollarCompareProblem.ok === true &&
    dollarCompareProblem.problem.kind === "compare_amounts" &&
    dollarCompareProblem.problem.leftAmountCents === 118 &&
    dollarCompareProblem.problem.rightAmountCents === 155 &&
    dollarCompareProblem.problem.canonicalAnswer === "155",
  JSON.stringify(dollarCompareProblem),
);
ok(
  "spoken dollar amount is graded correctly against compare worksheet facts",
  dollarCompareProblem.ok === true &&
    gradeWorksheetTranscript(
      dollarCompareProblem.problem,
      "The one dollar fifty five cents.",
    ) === true,
  JSON.stringify(dollarCompareProblem),
);

if (failures > 0) {
  console.log(`\n  ${failures} assertion(s) failed\n`);
  process.exit(1);
}

assert.ok(true);
console.log("\n  All worksheet truth assertions passed\n");
