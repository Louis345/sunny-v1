import fs from "node:fs";
import path from "node:path";

let failures = 0;

function ok(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`  ✅ ${name}`);
  } else {
    console.log(`  ❌ ${name}`);
    if (detail) console.log(`     ${detail}`);
    failures++;
  }
}

const canvasSrc = fs.readFileSync(
  path.join(process.cwd(), "web", "src", "components", "Canvas.tsx"),
  "utf-8",
);
const assignmentPlayerSrc = fs.readFileSync(
  path.join(process.cwd(), "src", "server", "assignment-player.ts"),
  "utf-8",
);

console.log("\noverlay authoring contract\n");

ok(
  "Canvas exposes worksheet overlay debug toggle",
  /showOverlayDebug/.test(canvasSrc),
);
ok(
  "Canvas shows overlay field metadata for authoring",
  /field\.fieldId/.test(canvasSrc) && /overlay debug/i.test(canvasSrc),
);
ok(
  "Canvas supports overlay authoring callback",
  /onOverlayFieldChange/.test(canvasSrc),
);
ok(
  "assignment-player exports overlay normalization helper",
  /export function normalizeOverlayField/.test(assignmentPlayerSrc),
);

if (failures > 0) {
  console.log(`\n  ${failures} assertion(s) failed\n`);
  process.exit(1);
}

console.log("\n  All overlay authoring contract assertions passed\n");
