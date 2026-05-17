import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { runPronunciationScienceAudit } from "./pronunciationScienceAudit";

const ROOTS: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-pronunciation-audit-"));
  ROOTS.push(root);
  return root;
}

afterEach(() => {
  for (const root of ROOTS.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("pronunciation science audit", () => {
  it("writes demo pronunciation science evidence only under the sandbox and reports provider comparison", () => {
    const root = makeRoot();

    const report = runPronunciationScienceAudit({
      childId: "demo_adaptive",
      rootDir: root,
      now: new Date("2026-05-15T12:00:00.000Z"),
    });

    expect(report.childId).toBe("demo_adaptive");
    expect(report.contextRoot).toContain(".sunny-sandbox/context");
    expect(report.evidenceFile).toContain(".sunny-sandbox/context/demo_adaptive/pronunciation_science");
    expect(fs.existsSync(report.evidenceFile)).toBe(true);
    expect(fs.existsSync(path.join(root, "src/context/demo_adaptive/pronunciation_science"))).toBe(false);
    expect(report.providerAgreement.join("\n")).toMatch(/ahead/);
    expect(report.clearestExplanations.join("\n")).toMatch(/azure|speechace|both/);
    expect(report.wilsonSignalSummary).toContain("segmentation");
    expect(report.flowStateSummary.join("\n")).toMatch(/missToHitRecoveries/);
    expect(report.recommendation).toMatch(/azure|speechace|both|neither/);
  });

  it("rejects real child ids in the audit lane", () => {
    const root = makeRoot();

    expect(() => runPronunciationScienceAudit({
      childId: "ila",
      rootDir: root,
      now: new Date("2026-05-15T12:00:00.000Z"),
    })).toThrow(/pronunciation_science_audit_requires_demo_sandbox:ila/);
  });
});
