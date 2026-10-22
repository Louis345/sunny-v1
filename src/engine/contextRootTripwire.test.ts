import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

// 2026-10-21 human catch (demo copy of Ila): session-end memory read the child's profile from the
// checkout's own src/context instead of the configured data folder, the file was missing, and the
// kiosk showed "Sunny lost the connection". Logs said "Post-session processing failed"; no lab ran the
// session-end path against a separate data folder, so every hard-coded path looked fine.
it("builds every runtime child-data path through the configured data folder, never the checkout's own src/context", () => {
  const roots = ["src/agents", "src/engine", "src/server", "src/profiles", "src/utils"];
  const files = roots.flatMap((root) => (fs.readdirSync(root, { recursive: true }) as string[])
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.includes("tests/"))
    .map((name) => path.join(root, name)))
    .filter((file) => !file.endsWith(path.join("utils", "contextRoot.ts")));
  const offenders = files.filter((file) => /(?:SRC_DIR\s*,\s*["']context["']|(process\.cwd\(\)|__dirname)\s*,\s*["']src["']\s*,\s*["']context["'])/.test(fs.readFileSync(file, "utf8")));
  expect(offenders).toEqual([]);
});
