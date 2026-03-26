/**
 * Contract: logWorksheetAttempt must be BLOCKED when:
 * 1. childSaid doesn't match the actual child transcript (stale data from previous problem)
 * 2. No child transcript exists for the current problem (question presentation turn)
 *
 * And hasContentOverlap correctly validates claimed vs actual speech.
 */
import { hasContentOverlap } from "../server/session-manager";

let failures = 0;

function assert(cond: boolean, name: string): void {
  if (cond) console.log(`  ✅ ${name}`);
  else {
    console.log(`  ❌ ${name}`);
    failures++;
  }
}

console.log("\nhasContentOverlap — stale answer detection\n");

// Exact match
assert(
  hasContentOverlap("fifteen cents", "fifteen cents"),
  "exact match is allowed"
);

// Substring match
assert(
  hasContentOverlap("25 cents", "25"),
  "claimed includes actual → allowed"
);
assert(
  hasContentOverlap("25", "I think it's 25 cents"),
  "actual includes claimed → allowed"
);

// Word overlap
assert(
  hasContentOverlap(
    "If I wanna buy both these cookies, it would be fifteen cents.",
    "it's fifteen cents for the cookies"
  ),
  "shared words (fifteen, cookies) → allowed"
);

assert(
  hasContentOverlap(
    "two dimes, one nickel, one penny",
    "two dimes one nickel and one penny"
  ),
  "same answer different punctuation → allowed"
);

// Stale data: no content overlap
assert(
  !hasContentOverlap(
    "If I wanna buy both these cookies, it would be fifteen cents.",
    "Yep. Give me the next problem."
  ),
  "old answer vs 'give me next' → BLOCKED"
);

assert(
  !hasContentOverlap(
    "two dimes, one nickel, one penny",
    "What three coins make thirty five cents?"
  ),
  "old answer vs repeated question → BLOCKED"
);

assert(
  !hasContentOverlap(
    "If I wanna buy both these cookies, it would be fifteen cents.",
    "Okay."
  ),
  "old answer vs filler 'okay' → BLOCKED"
);

// Empty inputs
assert(
  !hasContentOverlap("", "some transcript"),
  "empty claimed → BLOCKED"
);
assert(
  !hasContentOverlap("some claim", ""),
  "empty actual → BLOCKED"
);
assert(
  !hasContentOverlap("", ""),
  "both empty → BLOCKED"
);

// Short answers
assert(
  hasContentOverlap("quarter", "a quarter and a penny"),
  "single word 'quarter' matches → allowed"
);

assert(
  hasContentOverlap("No", "No"),
  "exact short match → allowed"
);

assert(
  hasContentOverlap("No", "No, I don't know"),
  "short answer contained in transcript → allowed"
);

// Case insensitive
assert(
  hasContentOverlap("FIFTEEN CENTS", "fifteen cents"),
  "case insensitive match → allowed"
);

// Claimed has no significant words (< 3 chars each)
assert(
  !hasContentOverlap("25", "no match here at all"),
  "claimed '25' has no 3+ char words and isn't substring → BLOCKED"
);

assert(
  hasContentOverlap("25", "it costs 25 dollars"),
  "claimed '25' is substring of actual → allowed"
);

if (failures > 0) {
  console.log(`\n  ${failures} failed\n`);
  process.exit(1);
}
console.log("\n  all passed ✅\n");
