import { shouldRenderTeachingContent } from "../../web/src/utils/canvasLayout";

let failures = 0;

function assert(cond: boolean, name: string, detail?: string): void {
  if (cond) {
    console.log(`  ✅ ${name}`);
  } else {
    console.log(`  ❌ ${name}`);
    if (detail) console.log(`     ${detail}`);
    failures++;
  }
}

console.log("\nSuite 1 — SVG alone is enough to render");
assert(
  shouldRenderTeachingContent({
    mode: "teaching",
    svg: "<svg>...</svg>",
  }) === true,
  "svg only",
);

console.log("\nSuite 2 — Content alone is enough");
assert(
  shouldRenderTeachingContent({
    mode: "teaching",
    content: "cat",
  }) === true,
  "content only",
);

console.log("\nSuite 3 — PhonemeBoxes alone is enough");
assert(
  shouldRenderTeachingContent({
    mode: "teaching",
    phonemeBoxes: [{ position: "first", value: "c" }],
  }) === true,
  "phonemeBoxes only",
);

console.log("\nSuite 4 — Empty teaching mode does NOT render");
assert(
  shouldRenderTeachingContent({
    mode: "teaching",
  }) === false,
  "empty teaching",
);

console.log("\nSuite 5 — Wrong mode never renders");
assert(
  shouldRenderTeachingContent({
    mode: "idle",
    svg: "<svg>...</svg>",
  }) === false,
  "idle + svg",
);

console.log("\nSuite 6 — svg set, content empty (Reina bug case)");
assert(
  shouldRenderTeachingContent({
    mode: "teaching",
    svg: "<svg width='300'><circle/></svg>",
    content: "",
  }) === true,
  "svg + empty content",
);

if (failures > 0) {
  console.log(`\n  ${failures} assertion(s) failed\n`);
  process.exit(1);
}
console.log("\n  All canvas SVG render condition tests passed\n");
