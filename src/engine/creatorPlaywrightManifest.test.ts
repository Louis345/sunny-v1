import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseGeneratedActivityPackage,
  runDirectBrowserSmokeCheck,
  type DirectArtifact,
} from "./directMathExperience";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const manifest = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  nodeId: "node-one",
  journey: [{
    itemId: "item-one",
    steps: [{ action: "click", selector: "#answer" }],
    assertions: [
      { type: "visible", selector: "#done" },
      { type: "event", eventType: "attempt_event", itemId: "item-one" },
    ],
  }],
  completionAssertions: [{ type: "event", eventType: "node_complete" }],
  ...overrides,
});

function generatedPackage(value = manifest()): string {
  return `<!doctype html><html><body><h1>Choose four.</h1><button id="answer">4</button><p id="done" hidden>Complete</p>
  <script id="sunny-playwright-test" type="application/json">${JSON.stringify(value)}</script>
  <script>
  parent.postMessage({type:'game_state_update',payload:{currentChallenge:{id:'item-one',prompt:'Choose four.',mode:'selection',measurementRole:'fresh_checkpoint',readAloudRequested:false,readAloudCount:0}}},'*');
  document.querySelector('#answer').onclick=()=>{
    document.querySelector('#done').hidden=false;
    parent.postMessage({type:'attempt_event',payload:{domain:'math',target:'item-one',attemptedValue:'four',correct:true}},'*');
    parent.postMessage({type:'node_complete',payload:{nodeId:'node-one',completed:true,accuracy:1,targetResults:[{target:'item-one',attemptedValue:'four',correct:true}]}},'*');
  };
  </script></body></html>`;
}

function artifactFixture(raw = generatedPackage()): { rootDir: string; artifact: DirectArtifact } {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-creator-playwright-"));
  roots.push(rootDir);
  fs.mkdirSync(path.join(rootDir, "web", "public"), { recursive: true });
  const parsed = parseGeneratedActivityPackage(raw, { nodeId: "node-one", itemIds: ["item-one"] });
  const htmlPath = path.join(rootDir, "node-one.html");
  const creatorTestPath = path.join(rootDir, "node-one.playwright.json");
  fs.writeFileSync(htmlPath, parsed.html);
  fs.writeFileSync(creatorTestPath, `${JSON.stringify(parsed.manifest, null, 2)}\n`);
  return {
    rootDir,
    artifact: {
      childId: "lab-child",
      homeworkId: "hw-one",
      nodeId: "node-one",
      title: "One",
      htmlPath,
      artworkUrl: "/art.png",
      creatorPrompt: "fixture",
      promptHash: "fixture",
      plannerModel: "recorded",
      creatorModel: "recorded",
      creatorContractVersion: 19,
      creatorTestPath,
      creatorTestHash: parsed.manifestHash,
      htmlHash: parsed.htmlHash,
      itemIds: ["item-one"],
    },
  };
}

describe("Creator-authored Playwright manifest", () => {
  it("extracts the private manifest and removes it from child-facing HTML", () => {
    const parsed = parseGeneratedActivityPackage(generatedPackage(), {
      nodeId: "node-one",
      itemIds: ["item-one"],
    });

    expect(parsed.html).not.toContain("sunny-playwright-test");
    expect(parsed.manifest.nodeId).toBe("node-one");
    expect(parsed.manifest.journey.map((item) => item.itemId)).toEqual(["item-one"]);
    expect(parsed.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.htmlHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    ["missing manifest", "<!doctype html><html><body>Missing</body></html>", "creator_playwright_manifest_missing"],
    ["wrong node", generatedPackage(manifest({ nodeId: "other" })), "creator_playwright_manifest_node_mismatch"],
    ["unknown item", generatedPackage(manifest({ journey: [{ itemId: "other", steps: [{ action: "click", selector: "#answer" }], assertions: [{ type: "visible", selector: "#done" }] }] })), "creator_playwright_manifest_item_coverage"],
    ["missing item assertion", generatedPackage(manifest({ journey: [{ itemId: "item-one", steps: [{ action: "click", selector: "#answer" }], assertions: [] }] })), "creator_playwright_manifest_assertion_missing"],
    ["missing completion", generatedPackage(manifest({ completionAssertions: [] })), "creator_playwright_manifest_completion_missing"],
    ["executable code", generatedPackage(manifest({ journey: [{ itemId: "item-one", steps: [{ action: "evaluate", selector: "body", value: "process.env" }], assertions: [{ type: "visible", selector: "#done" }] }] })), "creator_playwright_manifest_action_invalid"],
  ])("rejects %s", (_label, raw, error) => {
    expect(() => parseGeneratedActivityPackage(raw, { nodeId: "node-one", itemIds: ["item-one"] }))
      .toThrow(error);
  });

  it("runs the Creator proof and Sunny's canonical journey at both release viewports", async () => {
    const fixture = artifactFixture();
    const report = await runDirectBrowserSmokeCheck({
      rootDir: fixture.rootDir,
      artifacts: [fixture.artifact],
      itemContractsByNodeId: {
        "node-one": [{
          id: "item-one",
          prompt: "Choose four.",
          lineage: { sourceEvidenceIds: ["assignment:item-one"], exposure: "unseen", measurementRole: "fresh_checkpoint" },
          response: { mode: "selection", options: [{ id: "four", label: "4", correct: true }] },
        }],
      },
    });

    expect(report.failures).toEqual([]);
    expect(report.creatorTests).toEqual({
      passed: true,
      manifestHash: fixture.artifact.creatorTestHash,
      viewports: ["generation", "sunny"],
      failures: [],
    });
    expect(report.verification).toEqual({ runtime: true, scoring: true, contracts: true });
  }, 30_000);

  it("does not let a trivial Creator assertion bypass Sunny's missing evidence check", async () => {
    const raw = generatedPackage(manifest({
      journey: [{
        itemId: "item-one",
        steps: [{ action: "click", selector: "#answer" }],
        assertions: [{ type: "visible", selector: "body" }],
      }],
    })).replace("parent.postMessage({type:'attempt_event',payload:{domain:'math',target:'item-one',attemptedValue:'four',correct:true}},'*');", "");
    const fixture = artifactFixture(raw);
    const report = await runDirectBrowserSmokeCheck({ rootDir: fixture.rootDir, artifacts: [fixture.artifact] });

    expect(report.creatorTests?.passed).toBe(true);
    expect(report.passed).toBe(false);
    expect(report.failures.join("|")).toContain("math_journey_item_commit_missing");
  }, 30_000);

  it("blocks a new Creator artifact when its sidecar is missing or its hash changed", async () => {
    const missing = artifactFixture();
    fs.rmSync(missing.artifact.creatorTestPath!);
    const missingReport = await runDirectBrowserSmokeCheck({ rootDir: missing.rootDir, artifacts: [missing.artifact] });
    expect(missingReport.failures.join("|")).toContain("creator_playwright_manifest_file_missing");

    const changed = artifactFixture();
    fs.appendFileSync(changed.artifact.creatorTestPath!, " ");
    const changedReport = await runDirectBrowserSmokeCheck({ rootDir: changed.rootDir, artifacts: [changed.artifact] });
    expect(changedReport.failures.join("|")).toContain("creator_playwright_manifest_hash_mismatch");
  }, 30_000);
});
