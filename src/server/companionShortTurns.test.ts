import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

// Reina, 2026-11-22: "it talks too much and doesn't follow up." A shared short-turn default was added for that.
// 2026-11-23 (owner): personas, no rules. How much a companion says is her persona's; the shared base states the
// situation and how Sunny works, nothing about length. If replies run long, the persona is where that is fixed.
const base = fs.readFileSync(path.join(process.cwd(), "src/souls/companion-base.md"), "utf8");

it("the shared base sets no length default or cap", () => {
  expect(base).not.toMatch(/Most turns are|sentences max|at most (one|two|three|\d) sentences|never more than/i);
});
