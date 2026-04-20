import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/** Vitest runs with cwd = repo root. */
const PROJECT_ROOT = process.cwd();
const GAMES_DIR = path.join(PROJECT_ROOT, "web", "public", "games");

function collectHtmlFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) collectHtmlFiles(full, acc);
    else if (ent.isFile() && ent.name.endsWith(".html")) acc.push(full);
  }
  return acc;
}

const GAME_HTML_PATHS = collectHtmlFiles(GAMES_DIR).sort();

function relGamePath(abs: string): string {
  return path.relative(PROJECT_ROOT, abs).split(path.sep).join("/");
}

/** Reads ?words= from query (any common accessor). */
function readsWordsParam(html: string): boolean {
  return (
    /\.get\(\s*['"]words['"]\s*\)/.test(html) ||
    /GAME_PARAMS\.words/.test(html) ||
    (/URLSearchParams/.test(html) &&
      /words/.test(html) &&
      /split\s*\(\s*['"],['"]\s*\)/.test(html))
  );
}

function readsChildIdParam(html: string): boolean {
  return (
    /\.get\(\s*['"]childId['"]\s*\)/.test(html) ||
    /GAME_PARAMS\.childId/.test(html)
  );
}

function readsDifficultyParam(html: string): boolean {
  return (
    /\.get\(\s*['"]difficulty['"]\s*\)/.test(html) ||
    /GAME_PARAMS\.difficulty/.test(html)
  );
}

function readsNodeIdParam(html: string): boolean {
  return (
    /\.get\(\s*['"]nodeId['"]\s*\)/.test(html) ||
    /GAME_PARAMS\.nodeId/.test(html)
  );
}

function usesURLSearchParams(html: string): boolean {
  return /new\s+URLSearchParams|URLSearchParams\s*\(/.test(html);
}

function postsNodeComplete(html: string): boolean {
  return /['"]node_complete['"]/.test(html) && /postMessage\s*\(/.test(html);
}

function nodeCompletePayloadFields(html: string): {
  accuracy: boolean;
  flaggedWords: boolean;
  xpEarned: boolean;
  timeSpent_ms: boolean;
  nodeId: boolean;
  childId: boolean;
} {
  return {
    accuracy: /\baccuracy\b/.test(html),
    flaggedWords: /\bflaggedWords\b/.test(html),
    xpEarned: /\bxpEarned\b/.test(html),
    timeSpent_ms: /\btimeSpent_ms\b/.test(html),
    nodeId: /\bnodeId\s*:/.test(html) || /\bnodeId\s*,/.test(html),
    childId: /\bchildId\s*:/.test(html) || /\bchildId\s*,/.test(html),
  };
}

describe("game contract compliance (HTML under web/public/games)", () => {
  it("discovers at least one game HTML file", () => {
    expect(GAME_HTML_PATHS.length).toBeGreaterThan(0);
  });

  for (const absPath of GAME_HTML_PATHS) {
    const label = relGamePath(absPath);

    describe(label, () => {
      let html: string;

      beforeAll(() => {
        html = fs.readFileSync(absPath, "utf-8");
      });

      it("accepts ?words= param (URLSearchParams + words read)", () => {
        expect(usesURLSearchParams(html), "URLSearchParams").toBe(true);
        expect(readsWordsParam(html), "words param").toBe(true);
      });

      it("accepts ?childId= param", () => {
        expect(readsChildIdParam(html)).toBe(true);
      });

      it("accepts ?difficulty= param", () => {
        expect(readsDifficultyParam(html)).toBe(true);
      });

      it("accepts ?nodeId= param", () => {
        expect(readsNodeIdParam(html)).toBe(true);
      });

      it("posts node_complete on finish", () => {
        expect(postsNodeComplete(html)).toBe(true);
      });

      it("node_complete includes accuracy", () => {
        expect(nodeCompletePayloadFields(html).accuracy).toBe(true);
      });

      it("node_complete includes flaggedWords array", () => {
        expect(nodeCompletePayloadFields(html).flaggedWords).toBe(true);
      });

      it("node_complete includes xpEarned", () => {
        expect(nodeCompletePayloadFields(html).xpEarned).toBe(true);
      });

      it("node_complete includes timeSpent_ms", () => {
        expect(nodeCompletePayloadFields(html).timeSpent_ms).toBe(true);
      });

      it("node_complete includes nodeId from params", () => {
        expect(nodeCompletePayloadFields(html).nodeId).toBe(true);
      });

      it("node_complete includes childId from params", () => {
        expect(nodeCompletePayloadFields(html).childId).toBe(true);
      });
    });
  }
});
