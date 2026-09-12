import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

it("provisions Chromium and its OS dependencies before CI runs real-browser tests", () => {
  const workflow = fs.readFileSync(path.join(process.cwd(), ".github/workflows/ci.yml"), "utf8");
  const commands = [...workflow.matchAll(/^\s*run:\s*(.+)$/gm)].map(match => match[1]!.trim());
  const install = commands.findIndex(command => /^npx playwright install --with-deps chromium$/.test(command));
  const tests = commands.indexOf("npm run test");

  expect(install, "A fresh CI runner has npm packages, but no Playwright browser binary.").toBeGreaterThan(-1);
  expect(install).toBeGreaterThan(commands.indexOf("npm ci"));
  expect(tests).toBeGreaterThan(install);
});
