import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/tests/test-six-tools.ts",
      "src/tests/test-canvas-latency.ts",
      "src/tests/test-role-separation.ts",
      "src/tests/test-canvas-barge-in-preserve.ts",
      "src/tests/test-load-homework-folder.ts",
      "src/tests/test-worksheet-session-submit.ts",
      "src/tests/test-pending-transcript.ts",
      "src/tests/test-word-builder-feedback.ts",
      "src/tests/test-word-builder-tool-slot.ts",
      "src/tests/test-spelling-homework-gate.ts",
      "src/tests/test-psychologist-context.ts",
      "src/tests/test-audit-log.ts",
    ],
  },
});
