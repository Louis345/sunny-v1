import {
  CANVAS_FONT_BOUNDS,
  computeTeachingFontSize,
} from "../../web/src/utils/canvasLayout";

let failures = 0;

function pass(name: string): void {
  console.log(`  ✅ ${name}`);
}

function fail(name: string, detail?: string): void {
  console.log(`  ❌ ${name}`);
  if (detail) console.log(`     ${detail}`);
  failures++;
}

function assert(cond: boolean, name: string, detail?: string): void {
  if (cond) pass(name);
  else fail(name, detail);
}

console.log("\nSuite 1 — Bounds sanity");
assert(
  CANVAS_FONT_BOUNDS.min >= 0.5,
  "CANVAS_FONT_BOUNDS.min >= 0.5",
  `min=${CANVAS_FONT_BOUNDS.min}`,
);
assert(
  CANVAS_FONT_BOUNDS.max <= 7,
  "CANVAS_FONT_BOUNDS.max <= 7",
  `max=${CANVAS_FONT_BOUNDS.max}`,
);

console.log("\nSuite 2 — Short content (≤5 chars) returns large font");
for (const s of ["a", "cat", "sit", "dog"]) {
  const size = computeTeachingFontSize(s.length);
  assert(
    size >= 5,
    `"${s}" (len ${s.length}) → ${size} >= 5`,
    `got ${size}`,
  );
}

console.log("\nSuite 3 — Medium content scales down");
assert(
  computeTeachingFontSize(11) <= 4,
  "computeTeachingFontSize(11) <= 4",
  `got ${computeTeachingFontSize(11)}`,
);
assert(
  computeTeachingFontSize(15) <= 3,
  "computeTeachingFontSize(15) <= 3",
  `got ${computeTeachingFontSize(15)}`,
);

console.log("\nSuite 4 — Long content (20+ chars) stays small");
assert(
  computeTeachingFontSize(37) <= 2,
  "computeTeachingFontSize(37) <= 2",
  `got ${computeTeachingFontSize(37)}`,
);
assert(
  computeTeachingFontSize(50) <= 2,
  "computeTeachingFontSize(50) <= 2",
  `got ${computeTeachingFontSize(50)}`,
);

console.log("\nSuite 5 — Monotonicity: font never grows as content grows");
for (const n of [1, 3, 5, 8, 12, 18, 25, 35]) {
  const a = computeTeachingFontSize(n);
  const b = computeTeachingFontSize(n + 3);
  assert(
    a >= b,
    `n=${n}: f(${n})=${a} >= f(${n + 3})=${b}`,
    `violation: ${a} < ${b}`,
  );
}

console.log("\nSuite 6 — Special chars return valid finite numbers in bounds");
for (const s of ["$0.75", "35¢", "Who has more???"]) {
  const len = s.length;
  const r = computeTeachingFontSize(len);
  const ok =
    Number.isFinite(r) &&
    r >= CANVAS_FONT_BOUNDS.min &&
    r <= CANVAS_FONT_BOUNDS.max;
  assert(
    ok,
    `"${s}" length ${len} → ${r} within [${CANVAS_FONT_BOUNDS.min}, ${CANVAS_FONT_BOUNDS.max}]`,
    `got ${r}, finite=${Number.isFinite(r)}`,
  );
}

console.log("\nSuite 7 — Edge: charCount=0 returns CANVAS_FONT_BOUNDS.max");
{
  const r = computeTeachingFontSize(0);
  assert(
    r === CANVAS_FONT_BOUNDS.max,
    `computeTeachingFontSize(0) === ${CANVAS_FONT_BOUNDS.max}`,
    `got ${r}`,
  );
}

if (failures > 0) {
  console.log(`\n  ${failures} assertion(s) failed\n`);
  process.exit(1);
}
console.log("\n  All canvas overflow tests passed\n");
