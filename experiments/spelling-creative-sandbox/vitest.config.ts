import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["experiments/spelling-creative-sandbox/**/*.test.ts"],
    environment: "node",
  },
});
