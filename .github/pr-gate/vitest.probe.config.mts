// Throwaway reviewer probes: the root vitest.config.ts uses an explicit include
// list, so ad-hoc probe files need their own config.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: process.cwd(),
    environment: "node",
    include: [".ai-review-probes/**/*.test.ts", "**/*.ai-probe.test.ts"],
    exclude: ["**/node_modules/**", "web/**"],
  },
});
