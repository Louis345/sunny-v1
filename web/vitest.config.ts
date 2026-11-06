import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The wardrobe lab tests read local garment archives and certification captures that are kept out of
// git (about 1 GB). They run on a machine that has them and are skipped, with a log line, everywhere else.
const WARDROBE_LAB_ASSET_TESTS = [
  "src/tests/WardrobeCompatibilityLab.test.tsx",
  "src/tests/wardrobe-anatomical-fit.test.ts",
  "src/tests/wardrobe-portability.test.ts",
  "src/tests/wardrobe-prepared-garment.test.ts",
  "src/tests/wardrobe-review-readiness.test.ts",
];
const wardrobeLabAssetsPresent = [".sunny-sandbox/wardrobe", "artifacts/wardrobe-certification"]
  .every((dir) => fs.existsSync(path.resolve(__dirname, "..", dir)));
if (!wardrobeLabAssetsPresent) console.log(` 🎮 [web-tests] [wardrobe-lab-assets] [skipped] files=${WARDROBE_LAB_ASSET_TESTS.length} reason=local_assets_absent`);

/** Not part of `tsc -b` (see tsconfig.node); consumed by Vitest CLI only. */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: "./src/tests/setup.ts",
    include: ["src/tests/**/*.{ts,tsx}", "src/hooks/tests/**/*.{ts,tsx}"],
    exclude: ["src/tests/setup.ts", ...(wardrobeLabAssetsPresent ? [] : WARDROBE_LAB_ASSET_TESTS)],
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, ".."), path.resolve(__dirname, "../src")],
    },
  },
});
