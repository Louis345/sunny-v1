import { defineConfig } from "vitest/config";

// The Planner harness runs on demand (npm run harness), never in CI: a paid run is the owner's choice.
export default defineConfig({ test: { environment: "node", fileParallelism: false, include: ["src/harness/*.harness.ts"] } });
