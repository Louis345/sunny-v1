import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["experiments/math-creative-sandbox/**/*.test.ts"],
    environment: "node",
  },
});
