import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  DISCOVERY_VERIFIER_VERSION,
  verifyMathJourneyAtReleaseViewports,
  type JourneyCapture,
} from "./discoveryVisualReview";
import { discoveryCeremonyHtml } from "./discoveryCeremonyFixture.test-helper";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

function outputDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-capture-truth-"));
  roots.push(dir);
  return dir;
}

function readCaptures(dir: string): JourneyCapture[] {
  return JSON.parse(fs.readFileSync(path.join(dir, "journey-captures.json"), "utf8")).captures as JourneyCapture[];
}

it("records the opening ceremony as a transition, then captures the confirmed first item", async () => {
  const dir = outputDir();
  await verifyMathJourneyAtReleaseViewports({
    html: discoveryCeremonyHtml(),
    outputDir: dir,
    completionType: "evaluation_complete",
    itemIds: ["one", "two"],
  });

  for (const viewport of ["generation", "sunny"]) {
    const captures = readCaptures(dir).filter(capture => capture.viewport === viewport);
    expect(captures[0]).toMatchObject({ kind: "transition", expectedItemId: "one", observedItemId: null, promptVisible: false });
    expect(captures[1]).toMatchObject({ kind: "academic_item", expectedItemId: "one", observedItemId: "one", promptVisible: true });
    expect(captures.every(capture => capture.verifierVersion === DISCOVERY_VERIFIER_VERSION)).toBe(true);
  }
}, 30000);

it("records a later Continue screen as a transition and never labels it as the following item", async () => {
  const dir = outputDir();
  const screenshots = await verifyMathJourneyAtReleaseViewports({
    html: discoveryCeremonyHtml(),
    outputDir: dir,
    completionType: "evaluation_complete",
    itemIds: ["one", "two"],
  });

  for (const viewport of ["generation", "sunny"]) {
    const captures = readCaptures(dir).filter(capture => capture.viewport === viewport);
    expect(captures.map(capture => capture.kind)).toEqual([
      "transition", "academic_item", "transition", "academic_item", "completion",
    ]);
    expect(captures[2]).toMatchObject({ kind: "transition", expectedItemId: "two", observedItemId: "one" });
    expect(captures[3]).toMatchObject({ kind: "academic_item", expectedItemId: "two", observedItemId: "two", promptVisible: true });
    expect(path.basename(captures[2]!.path)).not.toMatch(/-item-02-/);
    expect(path.basename(captures[3]!.path)).toBe(`journey-${viewport}-item-02-two.png`);
  }
  expect(screenshots.filter(file => /-item-\d\d-/.test(path.basename(file)))).toHaveLength(4);
}, 30000);

it("does not label a screen as an academic item without the matching observed item and visible prompt", async () => {
  const dir = outputDir();
  const html = `<!doctype html><html><body>
    <h2 id="prompt">A prompt the activity never reported</h2><button id="answer">Answer</button>
    <script>
    window.SUNNY_VALIDATION_HOOKS={journey:[{itemId:'one',steps:[{action:'click',selector:'#answer'}]}]};
    document.getElementById('answer').onclick=()=>{
      parent.postMessage({type:'evaluation_attempt',payload:{attemptId:'attempt-1',itemId:'one',attemptedValue:'12',supportEventIds:[],instrumentSignals:[],observedAt:new Date().toISOString()}},'*');
      parent.postMessage({type:'evaluation_complete',payload:{}},'*');
    };
    </script></body></html>`;

  await verifyMathJourneyAtReleaseViewports({ html, outputDir: dir, completionType: "evaluation_complete", itemIds: ["one"] });

  const captures = readCaptures(dir);
  expect(captures.filter(capture => capture.kind === "academic_item")).toEqual([]);
  const unconfirmed = captures.filter(capture => capture.kind === "unconfirmed");
  expect(unconfirmed).toHaveLength(2);
  for (const capture of unconfirmed) {
    expect(capture).toMatchObject({ expectedItemId: "one", observedItemId: null, promptVisible: false });
    expect(path.basename(capture.path)).not.toMatch(/-item-01-/);
  }
}, 30000);

it("does not accept a reported item whose announced prompt is not actually visible", async () => {
  const dir = outputDir();
  const html = `<!doctype html><html><body>
    <h2 id="prompt">What is shown on screen</h2><button id="answer">Answer</button>
    <script>
    window.SUNNY_VALIDATION_HOOKS={journey:[{itemId:'one',steps:[{action:'click',selector:'#answer'}]}]};
    parent.postMessage({type:'game_state_update',payload:{currentChallenge:{id:'one',prompt:'A different prompt that is not rendered'}}},'*');
    document.getElementById('answer').onclick=()=>{
      parent.postMessage({type:'evaluation_attempt',payload:{attemptId:'attempt-1',itemId:'one',attemptedValue:'12',supportEventIds:[],instrumentSignals:[],observedAt:new Date().toISOString()}},'*');
      parent.postMessage({type:'evaluation_complete',payload:{}},'*');
    };
    </script></body></html>`;

  await verifyMathJourneyAtReleaseViewports({ html, outputDir: dir, completionType: "evaluation_complete", itemIds: ["one"] });

  const captures = readCaptures(dir);
  expect(captures.filter(capture => capture.kind === "academic_item")).toEqual([]);
  expect(captures.filter(capture => capture.kind === "unconfirmed")).toEqual([
    expect.objectContaining({ expectedItemId: "one", observedItemId: "one", promptVisible: false }),
    expect.objectContaining({ expectedItemId: "one", observedItemId: "one", promptVisible: false }),
  ]);
}, 30000);
