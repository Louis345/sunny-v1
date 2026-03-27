import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/tests/test-tool-filtering.ts",
      "src/tests/test-canvas-ownership.ts",
      "src/tests/test-context-injection.ts",
      "src/tests/test-session-type-resolution.ts",
      "src/tests/test-assignment-manifest.ts",
      "src/tests/test-svg-strip.ts",
      "src/tests/test-extraction-sanity.ts",
      "src/tests/test-worksheet-truth.ts",
      "src/tests/test-worksheet-turn-guards.ts",
      "src/tests/test-log-integrity.ts",
      "src/tests/test-store-pool-sanity.ts",
      "src/tests/test-no-server-authored-speech.ts",
      "src/tests/test-wt-session-status.ts",
      "src/tests/test-wt-get-next-problem.ts",
      "src/tests/test-wt-submit-answer.ts",
      "src/tests/test-wt-canvas-mutex.ts",
      "src/tests/test-wt-reward-persistence.ts",
      "src/tests/test-wt-extraction-sanity.ts",
    ],
  },
});
