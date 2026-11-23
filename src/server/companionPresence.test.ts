import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

// Human-caught 2026-11-16 (Ila: "Elli is annoying… she keeps saying the same over and over"). On a check word Elli's
// only fact was what she must hold back, so she explained the "no letters" rule 7 times; her replies ran long and Ila
// cut her off 12 times in 25 minutes. Why the logs did not catch it: each reply was a normal turn. Why the lab missed
// it: the lab checked that she withholds letters, never what she can offer instead or whether she repeats herself.
// Now: on a check word she gets the ways she can help, every turn shows her own recent lines as facts, and the
// shared persona says how long a reply to an 8-year-old runs.

afterEach(() => vi.unstubAllEnvs());

const snapshot = { childId: "presence-lab", sessionId: "s", nodeId: "check", itemId: "w1", activityId: "word-radar", targetIsSpeakable: false,
  answerVisibility: "hidden" as const, allowedActivities: [], updatedAt: "now" };
const assessment = { audioPlaybacks: 1, instrument: "recall_check" as const, nodeId: "check", homeworkId: "hw", itemId: "w1",
  word: "circus", artifactHash: "h", audioDelivered: true, supportIds: [], lettersVisible: false };
const turn = async () => {
  vi.stubEnv("SUNNY_CONTEXT_ROOT", fs.mkdtempSync(path.join(os.tmpdir(), "sunny-presence-")));
  const { buildActivityCompanionContext } = await import("./urgentLearningSupport");
  return buildActivityCompanionContext({ snapshot, childId: "presence-lab", companionId: "Elli", presence: "summoned", spellingAssessment: assessment });
};

it("on a check word, Elli is told the ways she can help, not only what she holds back", async () => {
  const context = await turn();
  expect(context).toContain("Ways to help on a check word");
  expect(context).toMatch(/in a short sentence/);
  expect(context).toMatch(/a guess is great/i);
  expect(context).not.toMatch(/\bcircus\b/i);
});

it("every turn shows Elli what she said to her in the last few minutes, as facts", async () => {
  const { noteCompanionReply } = await import("./urgentLearningSupport");
  const first = noteCompanionReply("presence-lab", "This one's a try-it-yourself word, I can't give you the letters, but I can say it again.");
  const again = noteCompanionReply("presence-lab", "This one's a try-it-yourself word EYE-lah, I can't give you letters or sounds, want me to say it again?");
  expect(first.repeat).toBeLessThan(0.5);
  expect(again.repeat).toBeGreaterThanOrEqual(0.5);
  expect(again.words).toBeGreaterThan(10);
  const context = await turn();
  const block = context.slice(context.indexOf("[What you said to her in the last few minutes")).split("\n\n")[0];
  expect(block).toContain("I can't give you letters or sounds");
  expect(block.split("\n").filter(line => /\b(do not|don't|never|must not)\b/i.test(line))).toEqual([]);
  expect(block).not.toMatch(/nagging|lands better/i); // facts only; what to make of them is hers
});

it("the shared persona says how long a reply to her runs", () => {
  const base = fs.readFileSync(path.join(process.cwd(), "src/souls/companion-base.md"), "utf8");
  // 11/22: no hardcoded age; her age comes from her chart facts.
  expect(base).toMatch(/Children talk in short bursts/);
  expect(base).not.toMatch(/She is eight|She is nine/);
  // No fixed sentence count (owner, 2026-10-22: the scripted "one or two short sentences" rule was removed on purpose).
  expect(base).not.toMatch(/one or two short sentences/);
  expect(base).toMatch(/cuts you off/);
});
