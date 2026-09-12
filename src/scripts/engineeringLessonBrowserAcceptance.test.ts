import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { applyDiscoveryHtmlPatch, hashDiscoveryContract, runMathProviderStage, verifyDiscoveryRuntimeScoring } from "../engine/adaptiveMathDiscovery";
import { DISCOVERY_VERIFIER_VERSION, engineeringLessonContext, freezeEngineeringLessonSnapshot, recordEngineeringRepairEvidence, verifyEngineeringRepairEvidence } from "../engine/discoveryVisualReview";

// Recorded provider fixtures, not edits to a published/generated child artifact.
function fixture(id: string, answer: string) {
  const academic = { items: [{ itemId: id, constructId: "math.counting", correctAnswerContract: { acceptedValues: [answer] } }] };
  const contract = { items: [{ itemId: id, constructId: "math.counting", acceptedValues: [answer] }] };
  const html = `<!doctype html><html><body><button id="response-${id}" style="position:absolute;top:1500px">${answer}</button><script id="sunny-discovery-contract" type="application/json">${JSON.stringify(contract)}</script><script>
  window.__SUNNY_DISCOVERY_TEST__={evaluate:(itemId,value)=>({itemId,constructId:'math.counting',correct:value==='${answer}'})};
  window.SUNNY_VALIDATION_HOOKS={journey:[{itemId:'${id}',steps:[{action:'click',selector:'#response-${id}'}]}]};
  parent.postMessage({type:'evaluation_ready'},'*');
  document.querySelector('#response-${id}').onclick=()=>{parent.postMessage({type:'evaluation_attempt',payload:{attemptId:'a-${id}',observedAt:new Date().toISOString(),itemId:'${id}',attemptedValue:'${answer}',supportEventIds:[],instrumentSignals:[]}},'*');parent.postMessage({type:'evaluation_complete'},'*')};
  </script></body></html>`;
  return { academic, html, patch: JSON.stringify({ replacements: [{ oldText: 'top:1500px', newText: 'top:60px', reason: "Place the existing response control inside the supported frames." }], engineeringLesson: { features: ["flex_layout"], cause: "overflow_geometry", change: "correct_layout_budget" } }) };
}

it("uses a verified engineering lesson on a different recorded repair while keeping the complete browser gate", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-engineering-transfer-"));
  const output = path.join(process.cwd(), "outputs/evidence-first-proof/engineering-transfer"); fs.mkdirSync(output, { recursive: true });
  const cases: Record<string, unknown>[] = [];
  let calls = 0;
  try {
    for (const [id, answer] of [["first-control", "4"], ["different-control", "7"]]) {
      const current = fixture(id, answer), academicHash = hashDiscoveryContract(current.academic), designHash = hashDiscoveryContract({ id, feature: "flex_layout" });
      const before = path.join(output, id, "before");
      let failure: any;
      try { await verifyDiscoveryRuntimeScoring({ html: current.html, academic: current.academic as never, outputDir: before }); } catch (error) { failure = error; }
      expect(failure).toBeDefined();
      expect(String(failure)).toContain(`response-${id}`);
      expect(failure.screenshotPaths).toHaveLength(2);
      const snapshot = freezeEngineeringLessonSnapshot({ snapshotFile: path.join(root, `${id}.snapshot.json`), auditRoot: root, features: ["flex_layout"], verifierVersion: DISCOVERY_VERIFIER_VERSION });
      expect(snapshot.lessons).toHaveLength(id === "first-control" ? 0 : 1);
      const startedAt = Date.now();
      const request = { html: current.html, academicHash, designHash, issues: failure.issues, screenshots: failure.screenshotPaths, engineering: engineeringLessonContext(snapshot), selectedLessonIds: snapshot.selectedLessonIds, snapshotHash: snapshot.hash };
      const invoke = () => runMathProviderStage({ draftDir: path.join(root, id), stage: "repair", model: "recorded-provider-no-network", request, execute: async () => { calls++; return current.patch; } });
      const repaired = applyDiscoveryHtmlPatch(current.html, await invoke());
      await invoke(); // Received provider result survives restart without a call.
      const file = path.join(root, `${id}.engineering-repair.json`);
      recordEngineeringRepairEvidence({ file, originalHash: hashDiscoveryContract(current.html), repairedHash: hashDiscoveryContract(repaired.html), academicHash, designHash, issues: failure.issues, proposal: repaired.engineeringLesson, verifierVersion: DISCOVERY_VERIFIER_VERSION, inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - startedAt, costUsd: 0 });
      const after = path.join(output, id, "after");
      await verifyDiscoveryRuntimeScoring({ html: repaired.html, academic: current.academic as never, outputDir: after });
      verifyEngineeringRepairEvidence(file, { artifactHash: hashDiscoveryContract(repaired.html), academicHash, designHash, runtime: true, scoring: true, contracts: true, verifierVersion: DISCOVERY_VERIFIER_VERSION, viewports: ["1365x768", "1280x720"] });
      expect(JSON.parse(fs.readFileSync(file, "utf8")).verified).toBe(true);
      fs.writeFileSync(path.join(output, id, "before.html"), current.html); fs.writeFileSync(path.join(output, id, "after.html"), repaired.html);
      cases.push({ id, originalHash: hashDiscoveryContract(current.html), repairedHash: hashDiscoveryContract(repaired.html), academicHash, designHash, defects: failure.issues, selectedLessonIds: snapshot.selectedLessonIds, snapshotHash: snapshot.hash, completeVerificationPassed: true, elapsedMs: Date.now() - startedAt, costUsd: 0, provider: "recorded" });
    }
    expect(calls).toBe(2);
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify({ status: "passed", providerCalls: calls, newPaidCalls: 0, cases, limitation: "Recorded repair outputs prove retrieval, provenance, resume and verification—not live repair quality or reduced defect recurrence." }, null, 2));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}, 90000);
