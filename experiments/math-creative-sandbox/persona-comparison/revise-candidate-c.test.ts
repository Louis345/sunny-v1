import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCandidateCRevisionPrompt,
  renderCandidateCRevisionReport,
  validateCandidateCRevision,
} from "./revise-candidate-c";

describe("Candidate C evidence-driven revision", () => {
  const feedback = {
    score: 10,
    childFeedback: [
      "It had an example so she could see what to do.",
      "The colors were decent.",
    ],
    adultObservation:
      "The visible example and identity should be preserved; drag-and-drop was clunky and adult orientation was needed.",
  };

  it("freezes academic and design inputs while asking only for an implementation revision", () => {
    const prompt = buildCandidateCRevisionPrompt({
      curriculum: { packetId: "packet-1", items: [{ itemId: "item-1" }] },
      design: { artifactId: "artifact-1", coreInteraction: "Drag equal groups into bays." },
      originalHtml: "<!doctype html><html><body><button>Start</button></body></html>",
      curriculumHash: "curriculum-hash",
      designHash: "design-hash",
      htmlHash: "html-hash",
      feedback,
    });

    expect(prompt).toContain("curriculum-hash");
    expect(prompt).toContain("design-hash");
    expect(prompt).toContain("html-hash");
    expect(prompt).toContain("It had an example so she could see what to do.");
    expect(prompt).toContain("drag-and-drop was clunky");
    expect(prompt).toContain("Revise implementation only");
    expect(prompt).toContain("Do not change the academic packet");
    expect(prompt).toContain("Do not hardcode a universal replacement interaction");
  });

  it("accepts complete isolated HTML and rejects Sunny API or child-state access", () => {
    expect(() => validateCandidateCRevision(
      "<!doctype html><html><body><button>Play</button><script>document.querySelector('button').onclick=()=>{};</script></body></html>",
    )).not.toThrow();
    expect(() => validateCandidateCRevision(
      "<!doctype html><html><body><script>fetch('/api/learning/reina')</script></body></html>",
    )).toThrow("candidate_c_revision_isolation_violation");
  });

  it("renders before and after with factual feedback and a blank parent scorecard", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "candidate-c-revision-"));
    fs.mkdirSync(path.join(root, "before"), { recursive: true });
    fs.mkdirSync(path.join(root, "after"), { recursive: true });
    fs.writeFileSync(path.join(root, "before/experience.html"), "before");
    fs.writeFileSync(path.join(root, "after/experience.html"), "after");
    const report = renderCandidateCRevisionReport({
      feedback,
      originalHash: "original-hash",
      revisedHash: "revised-hash",
      designHash: "design-hash",
      curriculumHash: "curriculum-hash",
      costUsd: 1.23,
      inputTokens: 100,
      outputTokens: 200,
      elapsedMs: 3000,
    });

    expect(report).toContain('src="before/experience.html"');
    expect(report).toContain('src="after/experience.html"');
    expect(report).toContain(".grid{display:grid;grid-template-columns:1fr;");
    expect(report).toContain("Original child score: 10/10");
    expect(report).toContain("What Sunny observed");
    expect(report).toContain("What the revision preserved");
    expect(report).toContain("What the revision changed");
    expect(report).toContain("Your as-child verdict is still required");
    expect(report).toContain("This does not prove mastery");
    expect(report).toContain("First action understood without adult explanation");
    expect(report).toContain("$1.230");
  });
});
