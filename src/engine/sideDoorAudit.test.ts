import { describe, expect, it } from "vitest";
import { auditDecisionSideDoors } from "./sideDoorAudit";

describe("decision side-door audit", () => {
  it("separates real side doors from allowed debug and legacy worksheet paths", () => {
    const report = auditDecisionSideDoors({ rootDir: process.cwd(), write: false });

    expect(report.summary.totalFindings).toBeGreaterThan(0);
    expect(report.summary.blockedDecisionReaders).toBe(0);
    expect(report.summary.legacyAssignmentInterpreters).toBe(0);
    expect(report.summary.allowedLegacyWorksheetReaders).toBeGreaterThan(0);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "allowed_legacy_worksheet_reader" }),
        expect.objectContaining({ category: "allowed_debug_reader" }),
      ]),
    );
  });
});
