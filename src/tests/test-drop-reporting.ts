import assert from "node:assert/strict";
import {
  buildIngestPlan,
  renderIngestReport,
  type IngestFileReport,
} from "../agents/classifier/classifier";

function testPdfPlanIncludesPreservationSteps(): void {
  const plan = buildIngestPlan("worksheet.pdf", ".pdf");
  assert.equal(plan.includes("Read file"), true);
  assert.equal(plan.includes("OCR/text extraction"), true);
  assert.equal(plan.includes("Preserve original asset"), true);
  assert.equal(plan.includes("Move to processed"), true);
}

function testContextReportShowsUpdatedFile(): void {
  const report: IngestFileReport = {
    filename: "tutor-session.vtt",
    sourcePath: "drop/tutor-session.vtt",
    childName: "Reina",
    status: "routed",
    plannedSteps: buildIngestPlan("tutor-session.vtt", ".vtt"),
    detectedBy: "model",
    initialClassification: {
      type: "tutoring_session",
      destination: "context",
      summary: "Tutor session transcript.",
    },
    finalClassification: {
      type: "tutoring_session",
      destination: "context",
      summary: "Tutor session transcript.",
    },
    guardrailPromoted: false,
    extractedText: true,
    preservedAsset: false,
    outputPaths: [],
    updatedFiles: ["src/context/reina_context.md"],
    processedPath: "drop/processed/tutor-session.vtt",
    warnings: [],
    notes: ["Appended session summary to context."],
  };

  const rendered = renderIngestReport(report);
  assert.match(rendered, /final destination: context\/tutoring_session/i);
  assert.match(rendered, /updated files: src\/context\/reina_context\.md/i);
  assert.match(rendered, /Appended session summary to context/i);
}

function testHomeworkReportShowsGuardrailAndPreservedAsset(): void {
  const report: IngestFileReport = {
    filename: "3_24 Reina.pdf",
    sourcePath: "drop/3_24 Reina.pdf",
    childName: "Reina",
    status: "routed",
    plannedSteps: buildIngestPlan("3_24 Reina.pdf", ".pdf"),
    detectedBy: "model",
    initialClassification: {
      type: "unknown",
      destination: "context",
      summary: "Could not classify document.",
    },
    finalClassification: {
      type: "math_homework",
      destination: "homework",
      summary: "Likely homework/worksheet content detected by server guardrail.",
    },
    guardrailPromoted: true,
    extractedText: true,
    preservedAsset: true,
    outputPaths: [
      "homework/reina/2026-03-26/3_24 Reina.pdf",
      "homework/reina/2026-03-26/spelling-words.txt",
    ],
    updatedFiles: [],
    processedPath: "drop/processed/3_24 Reina.pdf",
    warnings: [],
    notes: ["Server guardrail promoted likely worksheet into homework."],
  };

  const rendered = renderIngestReport(report);
  assert.match(rendered, /server guardrail: promoted/i);
  assert.match(rendered, /preserved asset: yes/i);
  assert.match(rendered, /final destination: homework\/math_homework/i);
}

function main(): void {
  console.log("\ndrop reporting\n");
  testPdfPlanIncludesPreservationSteps();
  console.log("  ✅ pdf plan includes preservation steps");
  testContextReportShowsUpdatedFile();
  console.log("  ✅ context report shows updated file");
  testHomeworkReportShowsGuardrailAndPreservedAsset();
  console.log("  ✅ homework report shows guardrail and preserved asset");
  console.log("\n  All drop reporting assertions passed\n");
}

main();
