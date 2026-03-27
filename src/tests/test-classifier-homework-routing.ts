import assert from "node:assert/strict";
import {
  stabilizeClassification,
  type ClassificationResult,
} from "../agents/classifier/classifier";

function testLikelyWorksheetPdfPromotesToHomework(): void {
  const classified: ClassificationResult = {
    type: "unknown",
    destination: "context",
    date: "unknown",
    summary: "Could not classify document.",
  };

  const stabilized = stabilizeClassification({
    filename: "3_24 Reina.pdf",
    extension: ".pdf",
    rawText:
      "I spent 35 cents. How many cookies did I buy? Which amount is greater, 36 cents or 41 cents? Write the answer in the box.",
    classification: classified,
  });

  assert.equal(stabilized.destination, "homework");
  assert.equal(stabilized.type, "math_homework");
}

function testTeacherReportStaysInContext(): void {
  const classified: ClassificationResult = {
    type: "unknown",
    destination: "context",
    date: "unknown",
    summary: "Could not classify document.",
  };

  const stabilized = stabilizeClassification({
    filename: "reina-school-report.pdf",
    extension: ".pdf",
    rawText:
      "Psychological evaluation report. Present levels of performance. Annual goals. Testing accommodations. Classification recommendation.",
    classification: classified,
  });

  assert.equal(stabilized.destination, "context");
  assert.equal(stabilized.type, "unknown");
}

function testFilenameHomeworkHintStillWins(): void {
  const classified: ClassificationResult = {
    type: "teacher_note",
    destination: "context",
    date: "unknown",
    summary: "Teacher note.",
  };

  const stabilized = stabilizeClassification({
    filename: "math-homework-week-3.pdf",
    extension: ".pdf",
    rawText: "Write the number sentence. Count the coins. 25 cents + 10 cents.",
    classification: classified,
  });

  assert.equal(stabilized.destination, "homework");
  assert.equal(stabilized.type, "math_homework");
}

function main(): void {
  console.log("\nclassifier homework routing\n");
  testLikelyWorksheetPdfPromotesToHomework();
  console.log("  ✅ likely worksheet pdf promotes to homework");
  testTeacherReportStaysInContext();
  console.log("  ✅ report-style context document stays in context");
  testFilenameHomeworkHintStillWins();
  console.log("  ✅ filename/content homework hints override weak context result");
  console.log("\n  All classifier routing assertions passed\n");
}

main();
