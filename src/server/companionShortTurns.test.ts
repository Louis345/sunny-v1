import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { buildShowroomTalkSystemPrompt } from "./companionShowroomTalk";

// Reina, 2026-11-22: "it talks too much and doesn't follow up." Why the human caught it: long turns that never
// answered what she had just said. Why logs missed it: reply length is logged nowhere as a problem. Why the lab missed
// it: the persona rewrite that morning removed the old "1-3 sentences" rule and no test kept a short-turn default.
// The default is a default, not a cap: a story she asked for may run longer.
const base = fs.readFileSync(path.join(process.cwd(), "src/souls/companion-base.md"), "utf8");
const DEFAULT = "Most turns are one or two sentences";
const FOLLOW_UP = "Answer what she just said before adding anything of your own.";

it("the shared base restores a short-turn default and answering her first, with no hard cap", () => {
  expect(base).toContain(DEFAULT);
  expect(base).toContain(FOLLOW_UP);
  expect(base).not.toMatch(/sentences max|at most (one|two|three|\d) sentences|never more than/i);
});

it("the default reaches every call prompt too", () => {
  const prompt = buildShowroomTalkSystemPrompt({ companionId: "matilda", companionName: "Matilda", showroomTheme: "garden", personality: "warm", mode: "video_call" });
  expect(prompt).toContain(DEFAULT);
  expect(prompt).toContain(FOLLOW_UP);
});
