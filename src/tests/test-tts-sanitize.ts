import { sanitizeForTTS } from "../server/session-state";

let failures = 0;

function test(name: string, actual: unknown, expected: unknown): void {
  const pass = actual === expected;
  if (pass) {
    console.log(`  ✅ ${name}`);
  } else {
    console.log(`  ❌ ${name}`);
    console.log(`     expected: ${JSON.stringify(expected)}`);
    console.log(`     received: ${JSON.stringify(actual)}`);
    failures++;
  }
}

test("strips bold markdown",
  sanitizeForTTS("**Railroad**"),
  "Railroad"
);

test("strips *asterisk* segments (actions)",
  sanitizeForTTS("Hi *laughs* there"),
  "Hi there"
);

test("strips headers",
  sanitizeForTTS("## Railroad"),
  "Railroad"
);

test("replaces newlines with space",
  sanitizeForTTS("word\n\nword"),
  "word word"
);

test("handles nested markdown",
  sanitizeForTTS("**The train** traveled"),
  "The train traveled"
);

test("strips bracket narration",
  sanitizeForTTS("Look [child sees canvas] here"),
  "Look here"
);

test("leaves clean text untouched",
  sanitizeForTTS("Hey Ila!"),
  "Hey Ila!"
);

if (failures > 0) {
  console.log(`\n  ${failures} test(s) failed\n`);
  process.exit(1);
} else {
  console.log(`\n  All sanitize tests passed\n`);
}
