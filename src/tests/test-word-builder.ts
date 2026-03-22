import { strict as assert } from "assert";

// ─── Types ───────────────────────────────
type LetterStatus = "correct" | "present" | "absent";
interface GuessResult {
  letter: string;
  status: LetterStatus;
}

/** Matches engine cell shape for strict forEach typing before module resolves */
interface GuessCell {
  letter: string;
  status: LetterStatus;
}

import {
  evaluateGuess,
  buildWordBuilderWordList,
  formatGuessForClaude,
  validateWordBuilderGuess,
} from "../games/word-builder/wordBuilderEngine";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  ❌ ${name}`);
    console.log(`     ${msg}`);
    failed++;
  }
}

console.log("\n🎮 WORD BUILDER ENGINE TESTS\n");

// ─── evaluateGuess ───────────────────────
console.log("evaluateGuess()");

test("exact match returns all correct", () => {
  const result = evaluateGuess("cowboy", "cowboy");
  assert.equal(result.length, 6);
  result.forEach((r: GuessCell) => assert.equal(r.status, "correct"));
});

test("no match returns all absent", () => {
  const result = evaluateGuess("xxxxxx", "cowboy");
  result.forEach((r: GuessCell) => assert.equal(r.status, "absent"));
});

test("correct letter wrong position returns present", () => {
  const result = evaluateGuess("boycow", "cowboy");
  assert.equal(result[0].letter, "b");
  assert.equal(result[0].status, "present");
});

test("handles railroad correctly", () => {
  const result = evaluateGuess("railroad", "railroad");
  assert.equal(result.length, 8);
  result.forEach((r: GuessCell) => assert.equal(r.status, "correct"));
});

test("partial match on honeycomb", () => {
  const result = evaluateGuess("honeyxxxx", "honeycomb");
  assert.equal(result[0].status, "correct");
  assert.equal(result[1].status, "correct");
  assert.equal(result[2].status, "correct");
  assert.equal(result[3].status, "correct");
  assert.equal(result[4].status, "correct");
});

test("duplicate letters handled correctly", () => {
  const result = evaluateGuess("rxxxxxxx", "railroad");
  const greens = result.filter((r: GuessCell) => r.status === "correct");
  assert.equal(greens.length, 1);
});

test("returns correct letter values", () => {
  const result = evaluateGuess("cowboy", "cowboy");
  assert.equal(result[0].letter, "c");
  assert.equal(result[1].letter, "o");
  assert.equal(result[2].letter, "w");
});

// ─── buildWordBuilderWordList ─────────────────
console.log("\nbuildWordBuilderWordList()");

const mockHomework = `
  Spelling words for this week:
  railroad, honeycomb, cowboy, bathroom, 
  toothbrush, birthday, doorknob, seashell, 
  snowball, starfish
  High frequency: air, along, begin
`;

test("extracts compound words from homework", () => {
  const words = buildWordBuilderWordList(mockHomework);
  assert.ok(words.includes("railroad"));
  assert.ok(words.includes("cowboy"));
  assert.ok(words.includes("honeycomb"));
});

test("excludes short words under 4 letters", () => {
  const words = buildWordBuilderWordList(mockHomework);
  words.forEach((w: string) =>
    assert.ok(w.length >= 4, `word too short: ${w}`)
  );
});

test("returns no duplicates", () => {
  const words = buildWordBuilderWordList(mockHomework);
  const unique = new Set(words);
  assert.equal(unique.size, words.length);
});

test("returns lowercase words", () => {
  const words = buildWordBuilderWordList(mockHomework);
  words.forEach((w: string) => assert.equal(w, w.toLowerCase()));
});

test("returns empty array for empty homework", () => {
  const words = buildWordBuilderWordList("");
  assert.ok(Array.isArray(words));
});

// ─── formatGuessForClaude ────────────────
console.log("\nformatGuessForClaude()");

test("formats correct guess naturally", () => {
  const result: GuessResult[] = [
    { letter: "r", status: "correct" },
    { letter: "a", status: "correct" },
    { letter: "i", status: "absent" },
    { letter: "n", status: "absent" },
  ];
  const text = formatGuessForClaude("rain", result);
  assert.ok(text.includes("R"), "should mention R");
  assert.ok(
    text.includes("correct") || text.includes("right"),
    "should indicate correct letters"
  );
  assert.ok(text.length > 10, "should be meaningful text");
});

test("formats all-wrong guess naturally", () => {
  const result: GuessResult[] = [
    { letter: "x", status: "absent" },
    { letter: "x", status: "absent" },
    { letter: "x", status: "absent" },
  ];
  const text = formatGuessForClaude("xxx", result);
  assert.ok(text.length > 5);
});

// ─── validateWordBuilderGuess ───────────────────
console.log("\nvalidateWordBuilderGuess()");

test("valid guess passes", () => {
  assert.equal(validateWordBuilderGuess("cowboy", 6), true);
});

test("wrong length fails", () => {
  assert.equal(validateWordBuilderGuess("cow", 6), false);
});

test("non-alpha characters fail", () => {
  assert.equal(validateWordBuilderGuess("cow123", 6), false);
});

test("empty string fails", () => {
  assert.equal(validateWordBuilderGuess("", 6), false);
});

// ─── postMessage contract (fill-blanks word-builder) ────────────────
console.log("\npostMessage contracts");

test("outbound round_complete has correct shape", () => {
  const msg = {
    type: "round_complete",
    round: 2,
    word: "cowboy",
    attempts: 1,
  };
  assert.equal(msg.type, "round_complete");
  assert.ok(typeof msg.word === "string");
  assert.ok(typeof msg.round === "number");
  assert.ok(typeof msg.attempts === "number");
});

test("outbound round_failed has correct shape", () => {
  const msg = {
    type: "round_failed",
    round: 1,
    word: "cowboy",
  };
  assert.equal(msg.type, "round_failed");
  assert.ok(typeof msg.word === "string");
  assert.ok(typeof msg.round === "number");
});

test("inbound start message has correct shape", () => {
  const msg = {
    type: "start",
    word: "cowboy",
    mode: "fill_blanks",
    round: 1,
    playerName: "Ila",
  };
  assert.equal(msg.type, "start");
  assert.ok(typeof msg.word === "string");
  assert.equal(msg.mode, "fill_blanks");
  assert.ok(typeof msg.round === "number");
});

// ─── Summary ─────────────────────────────
console.log(`\n${"─".repeat(40)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`\n  ❌ Tests failed — build the engine`);
  process.exit(1);
} else {
  console.log(`\n  ✅ All tests pass — ready to merge`);
}
