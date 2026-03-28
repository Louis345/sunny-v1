import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/tests/test-six-tools.ts", "src/tests/test-canvas-latency.ts"],
  },
});
