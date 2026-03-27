/**
 * Contract: No server-scripted handleCompanionTurn strings that assert currency
 * or worksheet answers (numeric pedagogy). Short non-numeric lines are OK.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const CURRENCY_IN_SPEECH =
  /\$\s*\d+|\d+\s*¢|\d+\s*cents?\b|\d+\s+dollar/i;

function collectHandleCompanionTurnRawArgs(source: string): string[] {
  const needle = "handleCompanionTurn(";
  const out: string[] = [];
  let i = 0;
  while (i < source.length) {
    const start = source.indexOf(needle, i);
    if (start === -1) break;
    let j = start + needle.length;
    let depth = 1;
    let quote: string | null = null;
    while (j < source.length && depth > 0) {
      const c = source[j];
      if (quote) {
        if (c === "\\") {
          j += 2;
          continue;
        }
        if (c === quote) quote = null;
        j++;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        quote = c;
        j++;
        continue;
      }
      if (c === "(") depth++;
      else if (c === ")") depth--;
      j++;
    }
    out.push(source.slice(start + needle.length, j - 1).trim());
    i = j;
  }
  return out;
}

function shouldSkipArg(arg: string): boolean {
  const a = arg.replace(/\s+/g, " ").trim();
  if (/^(this\.|p\.|snapshot\.)/.test(a)) return true;
  if (a === "this.companion.openingLine") return true;
  if (/^snapshot\./.test(a)) return true;
  if (/^p\.question$/.test(a)) return true;
  if (/^this\.companion\.openingLine$/.test(a)) return true;
  return false;
}

describe("no server-authored currency speech in worksheet paths", () => {
  const lifecyclePath = path.resolve(
    process.cwd(),
    "src/server/worksheet-lifecycle.ts",
  );
  const sessionManagerPath = path.resolve(
    process.cwd(),
    "src/server/session-manager.ts",
  );

  const SPEECH_PATTERNS = [
    /`Let's slow down/,
    /`The bigger amount here is/,
    /`Take another look/,
  ];

  it("worksheet-lifecycle.ts exists and has no toxic reveal templates", () => {
    expect(fs.existsSync(lifecyclePath)).toBe(true);
    const content = fs.readFileSync(lifecyclePath, "utf-8");
    for (const pattern of SPEECH_PATTERNS) {
      expect(content).not.toMatch(pattern);
    }
  });

  it("session-manager.ts does not define buildWorksheetRevealPrompt", () => {
    expect(fs.existsSync(sessionManagerPath)).toBe(true);
    const content = fs.readFileSync(sessionManagerPath, "utf-8");
    expect(content).not.toContain("buildWorksheetRevealPrompt");
  });

  it("session-manager.ts does not define buildWorksheetLearningArcPrompts", () => {
    const content = fs.readFileSync(sessionManagerPath, "utf-8");
    expect(content).not.toContain("buildWorksheetLearningArcPrompts");
  });

  it("handleCompanionTurn string/template args do not contain currency assertions", () => {
    const content = fs.readFileSync(sessionManagerPath, "utf-8");
    const args = collectHandleCompanionTurnRawArgs(content);
    const offenders: string[] = [];
    for (const arg of args) {
      if (shouldSkipArg(arg)) continue;
      const deTemplate = arg.replace(/\$\{[^}]+\}/g, " ");
      if (CURRENCY_IN_SPEECH.test(deTemplate)) {
        offenders.push(arg.slice(0, 120));
      }
    }
    expect(offenders, offenders.join("\n---\n")).toEqual([]);
  });
});
