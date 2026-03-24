/**
 * DEMO_MODE_PROMPT — exported prompt for parent/developer kiosk runs.
 * Run: npx tsx src/tests/test-demo-mode-prompt.ts
 */
import { strict as assert } from "assert";
import { DEMO_MODE_PROMPT } from "../agents/prompts";

const p = DEMO_MODE_PROMPT("Ila", "Elli");

assert.ok(p.includes("DEMO MODE"), "mentions DEMO MODE");
assert.ok(p.includes("Elli"), "includes companion name");
assert.ok(p.includes("Ila"), "includes child name");
assert.ok(p.includes("parent or developer"), "audience");
assert.ok(
  p.includes("Name it. Explain the correct behavior"),
  "bug-reporting rule"
);

console.log("\n  ✅ test-demo-mode-prompt passed\n");
