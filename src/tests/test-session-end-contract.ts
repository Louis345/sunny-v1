import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { checkUserGoodbye } from "../server/session-triggers";

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), "src", rel), "utf-8");
}

function testGoodbyePhraseVariants(): void {
  assert.equal(
    checkUserGoodbye("Can you end the session?"),
    true,
    'explicit request "Can you end the session?" should end immediately',
  );
  assert.equal(
    checkUserGoodbye("Please end session."),
    true,
    'explicit request "Please end session." should end immediately',
  );
  assert.equal(
    checkUserGoodbye("Alright. And session."),
    true,
    'common STT miss "And session" should still end the session',
  );
}

function testRewardGameLogWording(): void {
  const src = readSrc("server/session-manager.ts");
  assert.ok(
    !src.includes("Voice restored"),
    'reward-game completion log should not say "Voice restored"',
  );
  assert.ok(
    /transcript capture normal|reward game ended/i.test(src),
    "reward-game completion log should clearly describe returning to normal transcript capture",
  );
}

function main(): void {
  console.log("\nsession end contract\n");
  testGoodbyePhraseVariants();
  console.log("  ✅ goodbye phrase variants");
  testRewardGameLogWording();
  console.log("  ✅ reward-game log wording");
  console.log("\n  All session end assertions passed\n");
}

main();
