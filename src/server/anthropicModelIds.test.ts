import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards against dead/retired Anthropic model ids sneaking back into server
 * runtime code, which surface at runtime as 404 model_not_found errors
 * (e.g. the companion video-call talk route failing every turn).
 */
const KNOWN_DEAD_ANTHROPIC_MODEL_IDS = [
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
  "claude-3-5-sonnet-20240620",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
  "claude-3-7-sonnet-20250219",
  "claude-3-opus-20240229",
];

const SRC_ROOT = join(__dirname, "..");
const SERVER_ROOT = __dirname;

function listTypeScriptSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listTypeScriptSources(full));
      continue;
    }
    if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) continue;
    out.push(full);
  }
  return out;
}

function findDeadModelIdHits(files: string[]): Array<{ file: string; modelId: string }> {
  const hits: Array<{ file: string; modelId: string }> = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const modelId of KNOWN_DEAD_ANTHROPIC_MODEL_IDS) {
      if (source.includes(modelId)) {
        hits.push({ file: relative(SRC_ROOT, file), modelId });
      }
    }
  }
  return hits;
}

describe("anthropic model id hygiene", () => {
  it("keeps dead model ids out of src/server runtime code", () => {
    const hits = findDeadModelIdHits(listTypeScriptSources(SERVER_ROOT));
    expect(hits).toEqual([]);
  });

  it("reports (without failing) dead model ids elsewhere under src/", () => {
    const files = listTypeScriptSources(SRC_ROOT).filter(
      (file) => !file.startsWith(SERVER_ROOT + "/"),
    );
    const hits = findDeadModelIdHits(files);
    if (hits.length > 0) {
      console.warn(
        " ⚠️ [anthropic-model-ids] dead model ids outside src/server (clean up separately):",
        hits,
      );
    }
    expect(Array.isArray(hits)).toBe(true);
  });
});
