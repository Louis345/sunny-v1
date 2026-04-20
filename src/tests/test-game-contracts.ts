import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/** Vitest runs with cwd = repo root. */
const PROJECT_ROOT = process.cwd();
const GAMES_DIR = path.join(PROJECT_ROOT, "web", "public", "games");
const SKIP_PATHS = new Set([
  "web/public/games/pronunciation-game.html",
  "web/public/games/pronunciation/index.html",
]);
const WORD_DRIVEN = new Set([
  "web/public/games/word-builder.html",
  "web/public/games/spell-check.html",
  "web/public/games/bd-reversal-game.html",
]);

function collectHtmlFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) collectHtmlFiles(full, acc);
    else if (ent.isFile() && ent.name.endsWith(".html")) acc.push(full);
  }
  return acc;
}

const GAME_HTML_PATHS = collectHtmlFiles(GAMES_DIR)
  .filter((abs) => !SKIP_PATHS.has(relGamePath(abs)))
  .sort();

function relGamePath(abs: string): string {
  return path.relative(PROJECT_ROOT, abs).split(path.sep).join("/");
}

function hasContractScript(html: string): boolean {
  return /<script\s+src=["']_contract\.js["']\s*><\/script>/.test(html);
}

describe("game contract compliance (helper-based)", () => {
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

      it("loads the shared contract helper", () => {
        expect(hasContractScript(html)).toBe(true);
      });

      it("uses sendNodeComplete for completion", () => {
        expect(/sendNodeComplete\s*\(/.test(html)).toBe(true);
      });

      it("sends contract payload fields", () => {
        expect(/\baccuracy\b/.test(html)).toBe(true);
        expect(/\bflaggedWords\b/.test(html)).toBe(true);
        expect(/\bxpEarned\b/.test(html)).toBe(true);
        expect(/\btimeSpent_ms\b/.test(html)).toBe(true);
      });

      it("does not use legacy node_result", () => {
        expect(/['"]node_result['"]/.test(html)).toBe(false);
      });

      it("does not parse URL params directly", () => {
        expect(/URLSearchParams/.test(html)).toBe(false);
      });

      it("uses GAME_PARAMS words fallback when word-driven", () => {
        if (!WORD_DRIVEN.has(label)) return;
        expect(/GAME_PARAMS/.test(html)).toBe(true);
        expect(/GAME_PARAMS\.words/.test(html)).toBe(true);
      });
    });
  }
});
