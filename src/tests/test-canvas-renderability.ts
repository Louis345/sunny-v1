import { canvasHasRenderableContent } from "../shared/canvasRenderability";

let failures = 0;

function assert(cond: boolean, name: string): void {
  if (cond) console.log(`  ✅ ${name}`);
  else {
    console.log(`  ❌ ${name}`);
    failures++;
  }
}

console.log("\ncanvasHasRenderableContent");
assert(
  canvasHasRenderableContent({
    mode: "teaching",
    svg: "<svg></svg>",
  }),
  "teaching + svg → true",
);
assert(
  canvasHasRenderableContent({
    mode: "teaching",
    content: "hello",
  }),
  "teaching + content → true",
);
assert(
  canvasHasRenderableContent({
    mode: "teaching",
  }) === false,
  "teaching + neither → false",
);
assert(
  canvasHasRenderableContent({
    mode: "reward",
    svg: "<svg></svg>",
  }),
  "reward + svg → true",
);
assert(
  canvasHasRenderableContent({
    mode: "idle",
    svg: "<svg></svg>",
  }) === false,
  "idle + svg → false",
);

if (failures > 0) {
  console.log(`\n  ${failures} failed\n`);
  process.exit(1);
}
console.log("\n  All canvas renderability tests passed\n");
