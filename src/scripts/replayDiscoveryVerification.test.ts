import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { hashDiscoveryContract } from "../engine/adaptiveMathDiscovery";
import { discoveryCeremonyHtml, discoveryFixtureAcademic } from "../engine/discoveryCeremonyFixture.test-helper";
import { DISCOVERY_VERIFIER_VERSION, type JourneyCapture } from "../engine/discoveryVisualReview";
import { replaySavedDiscovery } from "./replayDiscoveryVerification";
import { hashDirectory } from "./sunnyCertification";

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true }));
});

function json(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function savedIncident() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-replay-"));
  roots.push(root);
  const draftDir = path.join(root, "workspace/src/context/reina/homework/direct-drafts/hw-math-fixture");
  const canonicalChild = path.join(root, "source/src/context/reina");
  json(path.join(canonicalChild, "learning_profile.json"), { childId: "reina" });
  const academic = discoveryFixtureAcademic();
  const contractHash = hashDiscoveryContract(academic);
  const builderHtml = discoveryCeremonyHtml({ runtimeContract: true });
  const repairedHtml = builderHtml.replace("Opening the market", "Opening the fruit market");
  json(path.join(draftDir, "discovery-academic.json"), academic);
  json(path.join(draftDir, "discovery-builder.json"), { contractHash, designHash: "d".repeat(64), html: builderHtml });
  json(path.join(draftDir, "visual-review/visual-review-checkpoint.json"), {
    version: DISCOVERY_VERIFIER_VERSION - 1,
    initialHtmlHash: "i".repeat(64),
    html: repairedHtml,
    iterations: [],
    repairsConsumed: 2,
  });
  const productionProof = path.join(draftDir, "runtime-verification/acceptance.json");
  json(productionProof, { passed: false, verifierVersion: DISCOVERY_VERIFIER_VERSION - 1 });
  return { draftDir, canonicalChild, builderHtml, repairedHtml, productionProof };
}

it("replays saved Discovery bytes through the current verifier with zero provider calls and no family changes", async () => {
  const incident = savedIncident();
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const productionProofBefore = fs.readFileSync(incident.productionProof, "utf8");
  const canonicalBefore = hashDirectory(incident.canonicalChild);

  const report = await replaySavedDiscovery({ draftDir: incident.draftDir, protectedDirs: [incident.canonicalChild] });

  expect(fetchSpy).not.toHaveBeenCalled();
  expect(report).toMatchObject({
    passed: true,
    providerCalls: 0,
    verifierVersion: DISCOVERY_VERIFIER_VERSION,
    academicHash: hashDiscoveryContract(discoveryFixtureAcademic().items),
    protectedDirsUnchanged: true,
  });
  expect(report.elapsedMs).toBeGreaterThan(0);
  expect(report.candidates.map(candidate => candidate.source)).toEqual(["builder", "reviewed"]);
  expect(report.candidates.map(candidate => candidate.htmlHash)).toEqual([
    hashDiscoveryContract(incident.builderHtml),
    hashDiscoveryContract(incident.repairedHtml),
  ]);
  for (const candidate of report.candidates) {
    expect(candidate.passed).toBe(true);
    expect(candidate.outputDir.startsWith(path.join(incident.draftDir, "replay"))).toBe(true);
    const acceptance = JSON.parse(fs.readFileSync(path.join(candidate.outputDir, "acceptance.json"), "utf8"));
    expect(acceptance).toMatchObject({ passed: true, verifierVersion: DISCOVERY_VERIFIER_VERSION, htmlHash: candidate.htmlHash });
    const sunny = (candidate.captures as JourneyCapture[]).filter(capture => capture.viewport === "sunny");
    expect(sunny.map(capture => capture.kind)).toEqual(["transition", "academic_item", "transition", "academic_item", "completion"]);
  }
  expect(fs.readFileSync(incident.productionProof, "utf8")).toBe(productionProofBefore);
  expect(hashDirectory(incident.canonicalChild)).toBe(canonicalBefore);
}, 60000);

it("reports a failing saved artifact truthfully instead of repairing it", async () => {
  const incident = savedIncident();
  const draftBuilder = path.join(incident.draftDir, "discovery-builder.json");
  const saved = JSON.parse(fs.readFileSync(draftBuilder, "utf8"));
  json(draftBuilder, { ...saved, html: saved.html.replace("id=\"next\"", "id=\"next\" style=\"visibility:hidden\"") });
  fs.rmSync(path.join(incident.draftDir, "visual-review"), { recursive: true });
  const fetchSpy = vi.spyOn(globalThis, "fetch");

  const report = await replaySavedDiscovery({ draftDir: incident.draftDir });

  expect(fetchSpy).not.toHaveBeenCalled();
  expect(report.passed).toBe(false);
  expect(report.providerCalls).toBe(0);
  expect(report.candidates).toHaveLength(1);
  expect(report.candidates[0]!.failures.join("|")).toContain("math_journey");
}, 60000);
