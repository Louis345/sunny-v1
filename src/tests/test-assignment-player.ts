import assert from "node:assert/strict";
import {
  buildWorksheetPlayerState,
  detectWorksheetInteractionMode,
  gradeAssignmentAnswer,
  normalizeAssignmentManifest,
  normalizeOverlayField,
  resumeAssignmentProblem,
  type AssignmentManifestInput,
} from "../server/assignment-player";

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

console.log("\nassignment player\n");

const manifestInput: AssignmentManifestInput = {
  assignmentId: "reina-money-2026-03-25",
  childName: "Reina",
  title: "Money worksheet",
  source: "worksheet_pdf",
  createdAt: "2026-03-26T00:00:00.000Z",
  pdfAssetUrl: "/api/homework/reina/2026-03-25/worksheet.pdf",
  pages: [{ page: 1, width: 1000, height: 1400 }],
  problems: [
    {
      problemId: "p1",
      page: 1,
      prompt: "I spent 35 cents. How many cookies did I buy?",
      canonicalAnswer: "3",
      gradingMode: "numeric",
      linkedGames: ["store-game", "coin-counter"],
      overlayFields: [
        {
          fieldId: "p1-answer",
          kind: "number",
          x: 620,
          y: 380,
          width: 120,
          height: 60,
          placeholder: "?",
        },
      ],
    },
  ],
};

const manifest = normalizeAssignmentManifest(manifestInput);
ok("manifest with explicit overlays is accepted", manifest.ok === true, JSON.stringify(manifest));
ok(
  "worksheet player state starts on first problem",
  manifest.ok === true &&
    buildWorksheetPlayerState(manifest.manifest).activeProblemId === "p1",
  JSON.stringify(manifest),
);
ok(
  "grading uses assignment truth by problem id",
  manifest.ok === true &&
    gradeAssignmentAnswer(manifest.manifest, {
      problemId: "p1",
      fieldId: "p1-answer",
      value: "3",
    }).correct === true,
  JSON.stringify(manifest),
);
ok(
  "grading accepts spoken money amounts for numeric worksheet answers",
  manifest.ok === true &&
    gradeAssignmentAnswer(
      {
        ...manifest.manifest,
        problems: [
          {
            ...manifest.manifest.problems[0],
            canonicalAnswer: "155",
            prompt: "Who has more money, $1.18 or $1.55?",
          },
        ],
      },
      {
        problemId: "p1",
        fieldId: "p1-answer",
        value: "The one dollar fifty five cents.",
      },
    ).correct === true,
  JSON.stringify(manifest),
);
ok(
  "resume restores same problem id after game",
  manifest.ok === true &&
    resumeAssignmentProblem(manifest.manifest, {
      activeProblemId: "p1",
      currentPage: 1,
      activeFieldId: "p1-answer",
    }).activeProblemId === "p1",
  JSON.stringify(manifest),
);

const missingOverlay = normalizeAssignmentManifest({
  ...manifestInput,
  problems: [
    {
      ...manifestInput.problems[0],
      overlayFields: [],
    },
  ],
});
ok(
  "missing overlays fail closed",
  missingOverlay.ok === false,
  JSON.stringify(missingOverlay),
);

const rewardAsLearningGame = normalizeAssignmentManifest({
  ...manifestInput,
  problems: [
    {
      ...manifestInput.problems[0],
      linkedGames: ["space-invaders"],
    },
  ],
});
ok(
  "reward game cannot be configured as instructional intervention",
  rewardAsLearningGame.ok === false,
  JSON.stringify(rewardAsLearningGame),
);

const missingPdf = normalizeAssignmentManifest({
  ...manifestInput,
  pdfAssetUrl: "",
});
ok(
  "trusted worksheet requires a pdf asset url",
  missingPdf.ok === false,
  JSON.stringify(missingPdf),
);

const normalizedField = normalizeOverlayField({
  field: {
    fieldId: "p1-answer",
    kind: "number",
    x: 980,
    y: -20,
    width: 90,
    height: 20,
    placeholder: "?",
  },
  pageWidth: 1000,
  pageHeight: 1400,
});
ok(
  "overlay normalization clamps authored boxes into the page",
  normalizedField.x >= 0 &&
    normalizedField.y >= 0 &&
    normalizedField.x + normalizedField.width <= 1000 &&
    normalizedField.height >= 24,
  JSON.stringify(normalizedField),
);

ok(
  "filled compare worksheet defaults to review mode",
  detectWorksheetInteractionMode({
    rawContent:
      "Who has more? $0.51 $0.75 $0.62 $0.52 Count the money and write the amount in the box.",
    problems: [
      {
        id: 1,
        kind: "compare_amounts",
        question: "Who has more money, 51 cents or 75 cents?",
        instructions: [],
        hint: "Compare the amounts.",
        canonicalAnswer: "75",
        leftAmountCents: 51,
        rightAmountCents: 75,
        askVisual: "greater",
        sourceAnswer: "75",
        sourceCanvasDisplay: "Two students with 51 cents and 75 cents.",
      },
    ],
  }) === "review",
);

ok(
  "fresh worksheet defaults to answer entry mode",
  detectWorksheetInteractionMode({
    rawContent:
      "Count the money and write the amount each student has in the box. Circle the student with the most money.",
    problems: [
      {
        id: 1,
        kind: "compare_amounts",
        question: "Who has more money, 51 cents or 75 cents?",
        instructions: [],
        hint: "Compare the amounts.",
        canonicalAnswer: "75",
        leftAmountCents: 51,
        rightAmountCents: 75,
        askVisual: "greater",
        sourceAnswer: "75",
        sourceCanvasDisplay: "Two students with 51 cents and 75 cents.",
      },
    ],
  }) === "answer_entry",
);

if (failures > 0) {
  console.log(`\n  ${failures} assertion(s) failed\n`);
  process.exit(1);
}

assert.ok(true);
console.log("\n  All assignment player assertions passed\n");
