import { shouldFlush } from "../server/session-state";

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

test("does not flush on 10 chars",
  shouldFlush("Hey there!"),
  false
);

test("flushes on period",
  shouldFlush("Hey there."),
  true
);

test("flushes on exclamation",
  shouldFlush("You got it!"),
  true
);

test("flushes on question mark",
  shouldFlush("Can you spell it?"),
  true
);

test("flushes on comma",
  shouldFlush("Railroad, honeycomb,"),
  true
);

test("does not flush mid-word",
  shouldFlush("Rail"),
  false
);

test("safety valve flushes at 200 chars",
  shouldFlush("a".repeat(200)),
  true
);

if (failures > 0) {
  console.log(`\n  ${failures} test(s) failed\n`);
  process.exit(1);
} else {
  console.log(`\n  All flush tests passed\n`);
}
