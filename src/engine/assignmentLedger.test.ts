import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import type { AssignmentConcept } from "./directMathExperience";
import {
  readPriorConceptIds,
  renderAssignmentLedgerEntry,
  writeAssignmentLedgerEntry,
} from "./assignmentLedger";

function root(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-ledger-"));
}

const concept: AssignmentConcept = {
  conceptId: "division_as_equal_sharing",
  name: "Division as equal sharing",
  statement: "Division asks how many each one gets when a total is shared out fairly.",
  instanceScope: "divisors of two, five and ten within fifty",
  prerequisites: ["equal groups", "skip counting"],
  assumptions: ["The child can share objects physically but may not connect it to the ÷ symbol."],
};

describe("assignment ledger", () => {
  it("records the concept and beliefs rather than the assignment text", () => {
    const markdown = renderAssignmentLedgerEntry({
      childId: "reina",
      homeworkId: "hw-math-division01",
      sourceFilename: "division.pdf",
      concept,
      ingestedAt: "2026-07-26T12:00:00.000Z",
    });

    expect(markdown).toContain("**id:** division_as_equal_sharing");
    expect(markdown).toContain("shared out fairly");
    expect(markdown).toContain("divisors of two, five and ten within fifty");
    expect(markdown).toContain("may not connect it to the ÷ symbol");
    // The previous ledger dumped the whole worksheet under `words:`, name and
    // date lines included. A ledger entry is memory, not a copy of the source.
    expect(markdown).not.toContain("**words:**");
  });

  it("states its beliefs are pending a check", () => {
    const markdown = renderAssignmentLedgerEntry({
      childId: "reina",
      homeworkId: "hw",
      sourceFilename: "x.pdf",
      concept,
    });
    expect(markdown).toContain("Still to be checked");
  });

  it("writes an assignment-specific pre entry and reads its concept id back", () => {
    const rootDir = root();
    const file = writeAssignmentLedgerEntry({
      childId: "reina",
      homeworkId: "hw-math-division01",
      sourceFilename: "division.pdf",
      concept,
      ingestedAt: "2026-07-26T12:00:00.000Z",
    }, { rootDir });

    expect(path.basename(file)).toBe("2026-07-26-hw-math-division01-pre.md");
    expect(readPriorConceptIds("reina", { rootDir })).toEqual(["division_as_equal_sharing"]);
  });

  it("preserves two assignments ingested on the same day", () => {
    const rootDir = root();
    const first = writeAssignmentLedgerEntry({
      childId: "reina",
      homeworkId: "hw-math-first",
      sourceFilename: "first.pdf",
      concept,
      ingestedAt: "2026-07-26T09:00:00.000Z",
    }, { rootDir });
    const second = writeAssignmentLedgerEntry({
      childId: "reina",
      homeworkId: "hw-math-second",
      sourceFilename: "second.pdf",
      concept: { ...concept, conceptId: "math.fractions.unit_fraction" },
      ingestedAt: "2026-07-26T15:00:00.000Z",
    }, { rootDir });

    expect(first).not.toBe(second);
    expect(fs.existsSync(first)).toBe(true);
    expect(fs.existsSync(second)).toBe(true);
  });

  it("returns prior ids newest first and without duplicates", () => {
    const rootDir = root();
    for (const [day, id] of [
      ["2026-07-01T00:00:00.000Z", "multiplication_as_equal_groups"],
      ["2026-07-10T00:00:00.000Z", "division_as_equal_sharing"],
      ["2026-07-20T00:00:00.000Z", "division_as_equal_sharing"],
    ] as const) {
      writeAssignmentLedgerEntry({
        childId: "reina",
        homeworkId: `hw-${day}`,
        sourceFilename: "x.pdf",
        concept: { ...concept, conceptId: id },
        ingestedAt: day,
      }, { rootDir });
    }

    expect(readPriorConceptIds("reina", { rootDir }))
      .toEqual(["division_as_equal_sharing", "multiplication_as_equal_groups"]);
  });

  it("returns nothing for a child with no ledger yet", () => {
    expect(readPriorConceptIds("reina", { rootDir: root() })).toEqual([]);
  });
});
