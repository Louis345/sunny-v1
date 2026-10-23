import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { runDirectBrowserSmokeCheck } from "./directMathExperience";

// A real paid synthetic first candidate failed the old literal-prose checker.
// Replay the same bytes through real browser controls; no mocked verification,
// provider request, child chart, scoring injection or repaired fixture.
it("plays the unchanged paid spelling practice candidate at both release sizes", async () => {
  const base = path.join(process.cwd(), "src/scripts/fixtures/generated-spelling-practice");
  const metadata = JSON.parse(fs.readFileSync(`${base}.json`, "utf8"));
  expect(createHash("sha256").update(fs.readFileSync(`${base}.html`)).digest("hex")).toBe(metadata.sha256);
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-paid-fixture-"));
  try {
    fs.mkdirSync(path.join(rootDir, "web"));
    fs.symlinkSync(path.join(process.cwd(), "web/public"), path.join(rootDir, "web/public"));
    const result = await runDirectBrowserSmokeCheck({ rootDir, artifacts: [{
      nodeId: metadata.nodeId, childId: metadata.child, homeworkId: metadata.homeworkId,
      title: metadata.title, htmlPath: `${base}.html`, artworkUrl: "", creatorPrompt: "recorded synthetic QA",
      promptHash: metadata.sha256, plannerModel: "recorded", creatorModel: "recorded",
      itemIds: metadata.itemBindings.map((item: {itemId:string}) => item.itemId), spellingItemBindings: metadata.itemBindings,
    }] });
    expect(result.failures).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.screenshots.some(file => file.includes("sunny-item-02"))).toBe(true);
    expect(result.screenshots.some(file => file.includes("generation-item-02"))).toBe(true);
  } finally { fs.rmSync(rootDir, { recursive: true, force: true }); }
}, 30000);
