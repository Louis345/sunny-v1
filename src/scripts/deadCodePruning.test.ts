import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../..");

const trackedStaleSourceCandidates = [
  "scripts/renderVisualBriefQa.ts",
  "src/elli-victory.ts",
  "src/reina-matilda-audition.ts",
  "src/scripts/convert-pdfs-to-txt.ts",
  "src/scripts/goLivePreview.ts",
  "src/scripts/migrateLogsToWordBank.ts",
  "src/scripts/previewHomework.ts",
  "src/scripts/test-canvas.ts",
  "src/scripts/test-latency.ts",
  "src/scripts/test-pipeline.ts",
  "src/scripts/test-psychologist.ts",
  "src/speak.ts",
  "src/test-barge-in-reina.ts",
  "src/test-barge-in.ts",
  "src/server/worksheet-canvas-model.ts",
  "src/server/worksheet-turn-guards.ts",
  "src/games/word-builder/wordBuilderEngine.ts",
  "web/src/components/SunnyActivityShell.tsx",
] as const;

describe("dead-code pruning invariant", () => {
  it("keeps high-confidence tracked stale candidates out of the codebase", () => {
    const stillPresent = trackedStaleSourceCandidates.filter((candidate) =>
      existsSync(path.join(repoRoot, candidate)),
    );

    expect(stillPresent).toEqual([]);
  });
});
