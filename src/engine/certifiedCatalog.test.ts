import { describe, expect, it } from "vitest";
import type { ChildChart } from "../profiles/childChart";
import { buildAssignmentPlanningPacket, type AssignmentSourceExtraction } from "./assignmentPlanner";

// 2026-10-24 live demo: the Teaching Planner chose Wordle, which the spelling certification blocks for
// real children; its grid rendered as one column and it plays one word. The demo profile skipped the
// certified list, so demo runs tested a different menu than Ila's. Every child gets the same menu.
function packetFor(childId: string) {
  const text = "Spelling\nsign\nknow";
  const extraction: AssignmentSourceExtraction = { sourceKind: "scanned_assignment_image", sourcePath: "/tmp/demo.png", filename: "demo.png", mediaType: "image/png", fileHash: "a".repeat(64), extractionMethod: "tesseract", pages: [{ pageNumber: 1, text }], fullText: text, warnings: [] };
  const chart = { childId, rootDir: process.cwd(), identity: { childId }, learningProfile: { childId }, homework: { recent: [] }, artifacts: { contentCatalog: [] }, activityResults: { recent: [] }, decisionTrace: [], learningHistory: { constructs: {} } } as unknown as ChildChart;
  return buildAssignmentPlanningPacket({ childId, extraction, childChart: chart });
}
const launchable = (childId: string) => packetFor(childId).activityCatalog.filter(card => card.launchable).map(card => card.activityId).sort();

describe("certified spelling activities", () => {
  it("never offers an uncertified game such as Wordle, to the demo child either", () => {
    expect(launchable("demo-pashley")).not.toContain("wordle");
  });
  it("gives the demo child the same menu as a real child", () => {
    expect(launchable("demo-pashley")).toEqual(launchable("ila"));
  });
});
