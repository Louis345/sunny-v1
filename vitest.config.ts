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
    ],
  },
});
