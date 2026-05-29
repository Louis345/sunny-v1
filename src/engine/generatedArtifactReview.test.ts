import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { reviewGeneratedExperienceArtifact } from "./generatedArtifactReview";

describe("generated artifact review", () => {
  function makeArtifact() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-artifact-review-"));
    const artifactPath = path.join(dir, "failed-generated-artifact.html");
    fs.writeFileSync(artifactPath, "<html><body>candidate</body></html>", "utf-8");
    return { dir, artifactPath };
  }

  it("records a discard decision without deleting the artifact evidence", () => {
    const { artifactPath } = makeArtifact();
    const record = reviewGeneratedExperienceArtifact({
      artifactPath,
      decision: "discard",
      reason: "Rendered its own companion bubble and leaked spelling targets.",
      reviewer: "codex",
      reviewedAt: "2026-05-29T01:00:00.000Z",
    });

    expect(record.decision).toBe("discard");
    expect(record.playableDisposition).toBe("discard_candidate");
    expect(fs.existsSync(artifactPath)).toBe(true);
    expect(fs.existsSync(record.reviewPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(record.reviewPath, "utf-8"))).toMatchObject({
      decision: "discard",
      reason: "Rendered its own companion bubble and leaked spelling targets.",
      artifactPath,
    });
  });

  it("preserves an approved artifact by writing a stable review copy", () => {
    const { artifactPath } = makeArtifact();
    const record = reviewGeneratedExperienceArtifact({
      artifactPath,
      decision: "preserve",
      reason: "Good candidate for replay review.",
      reviewer: "codex",
      reviewedAt: "2026-05-29T01:00:00.000Z",
    });

    expect(record.decision).toBe("preserve");
    expect(record.playableDisposition).toBe("preserve_candidate");
    expect(record.preservedCopyPath).toBeTruthy();
    expect(fs.readFileSync(record.preservedCopyPath ?? "", "utf-8")).toContain("candidate");
  });
});
