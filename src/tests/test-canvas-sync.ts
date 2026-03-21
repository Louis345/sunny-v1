/**
 * Canvas / blackboard mutual exclusion — mirrors useSession + Canvas.tsx
 * Run: npx tsx src/tests/test-canvas-sync.ts
 */
import assert from "node:assert";
import {
  applyBlackboardMessage,
  clearedBlackboardState,
  type BlackboardSyncState,
} from "../shared/canvasBlackboardSync";

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✅ ${name}`);
  } catch (e) {
    console.error(`  ❌ ${name}`);
    throw e;
  }
}

console.log("\n  test-canvas-sync\n");

test("blackboard clear resets canvas state", () => {
  const prev: BlackboardSyncState = { gesture: null };
  const { canvasIdle, blackboard } = applyBlackboardMessage(prev, {
    gesture: "clear",
  });
  assert.strictEqual(canvasIdle.mode, "idle");
  assert.strictEqual(blackboard.gesture, "clear");
});

test("blackboard mask clears showCanvas (canvas → idle)", () => {
  const prev: BlackboardSyncState = { gesture: null };
  const { canvasIdle, blackboard } = applyBlackboardMessage(prev, {
    gesture: "mask",
    maskedWord: "h_n_yc_m_",
  });
  assert.strictEqual(canvasIdle.mode, "idle");
  assert.strictEqual(blackboard.gesture, "mask");
  assert.strictEqual(blackboard.maskedWord, "h_n_yc_m_");
});

test("showCanvas clears blackboard state", () => {
  const cleared = clearedBlackboardState();
  assert.strictEqual(cleared.gesture, null);
});

console.log("\n  All canvas sync tests passed\n");
