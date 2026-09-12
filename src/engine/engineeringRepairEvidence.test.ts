import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { ensureDiscoveryArtifactsAreServed, hashDiscoveryContract, hasReceivedMathProviderStage, runMathProviderStage } from "./adaptiveMathDiscovery";
import { DISCOVERY_VERIFIER_VERSION, recordEngineeringRepairEvidence, freezeEngineeringLessonSnapshot, verifyEngineeringRepairEvidence } from "./discoveryVisualReview";
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "engineering-evidence-")); roots.push(root);
  const file = path.join(root, "one.engineering-repair.json");
  const input = { file, verifierVersion: DISCOVERY_VERIFIER_VERSION, originalHash: "a".repeat(64), repairedHash: "b".repeat(64), academicHash: "c".repeat(64), designHash: "d".repeat(64), issues: ["math_journey_control_not_actionable:item-private:#private missing=role"], proposal: { features: ["svg_interaction"], cause: "missing_interaction_semantics", change: "add_interaction_semantics" }, inputTokens: 12, outputTokens: 20, latencyMs: 200, costUsd: 0.02 };
  const verify = { artifactHash: input.repairedHash, academicHash: input.academicHash, designHash: input.designHash, verifierVersion: DISCOVERY_VERIFIER_VERSION, runtime: true, scoring: true, contracts: true, viewports: ["1365x768", "1280x720"] };
  return { root, file, input, verify };
}
it("does not silently repeat a completed paid stage when its prompt changes", async () => {
  const { root } = fixture();
  let calls = 0;
  const input = { draftDir: root, stage: "builder", model: "recorded", request: { prompt: "frozen" }, execute: async () => ({ calls: ++calls }) };
  await runMathProviderStage(input);
  await expect(runMathProviderStage({ ...input, request: { prompt: "changed" } })).rejects.toThrow("provider_stage_request_changed");
  expect(calls).toBe(1);
});
it("revokes a previously trusted lesson when the actual publication revalidation fails", async () => {
  const { root, input, verify } = fixture();
  const homeworkId = "hw-regression", childId = "lab-child";
  const storage = path.join(root, "src/context", childId, "homework/games", homeworkId);
  const draft = path.join(root, "src/context", childId, "homework/direct-drafts", homeworkId);
  const html = "<!doctype html><html><body>No usable response control</body></html>";
  fs.mkdirSync(storage, { recursive: true });
  fs.writeFileSync(path.join(storage, "discovery.html"), html);
  fs.writeFileSync(path.join(storage, "discovery-background.svg"), "<svg/>");
  const file = path.join(draft, "provider-diagnostics/discovery.engineering-repair.json");
  const artifactHash = hashDiscoveryContract(html);
  recordEngineeringRepairEvidence({ ...input, file, repairedHash: artifactHash });
  verifyEngineeringRepairEvidence(file, { ...verify, artifactHash });
  const args = { auditRoot: root, features: ["svg_interaction"], verifierVersion: DISCOVERY_VERIFIER_VERSION };
  const snapshotFile = path.join(root, "completed.snapshot.json");
  const prior = freezeEngineeringLessonSnapshot({ ...args, snapshotFile });
  expect(prior.lessons).toHaveLength(1);
  await expect(ensureDiscoveryArtifactsAreServed({ rootDir: root, childId, homeworkId, contract: {
    items: [{ itemId: "probe", constructId: "math.count", correctAnswerContract: { acceptedValues: ["4"] } }],
    artifact: { artifactHash },
  } as never })).rejects.toThrow();
  expect(freezeEngineeringLessonSnapshot({ ...args, snapshotFile: path.join(root, "next.snapshot.json") }).lessons).toHaveLength(0);
  expect(freezeEngineeringLessonSnapshot({ ...args, snapshotFile, preserveCompleted: true })).toEqual(prior);
});
it("does not forward malformed audit metrics as engineering context", () => {
  const { root, file, input, verify } = fixture();
  recordEngineeringRepairEvidence(input); verifyEngineeringRepairEvidence(file, verify);
  const row = JSON.parse(fs.readFileSync(file, "utf8")); row.costUsd = "private response";
  fs.writeFileSync(file, JSON.stringify(row));
  expect(freezeEngineeringLessonSnapshot({ snapshotFile: path.join(root, "snapshot.json"), auditRoot: root, features: ["svg_interaction"], verifierVersion: DISCOVERY_VERIFIER_VERSION }).lessons).toHaveLength(0);
});
it("preserves historical lessons only for a received provider response, not a started request", async () => {
  const { root } = fixture();
  expect(hasReceivedMathProviderStage(root, "builder")).toBe(false);
  await runMathProviderStage({ draftDir: root, stage: "builder", model: "recorded", request: {}, execute: async () => {
    expect(hasReceivedMathProviderStage(root, "builder")).toBe(false);
    return { html: "recorded" };
  } });
  expect(hasReceivedMathProviderStage(root, "builder")).toBe(true);
});
it("keeps a repair untrusted until complete independent verification and excludes incompatible or regressed lessons", () => {
  const { root, file, input, verify } = fixture();
  recordEngineeringRepairEvidence(input);
  const snapshot = (suffix: string, features = ["svg_interaction"], verifierVersion = DISCOVERY_VERIFIER_VERSION) => freezeEngineeringLessonSnapshot({ snapshotFile: path.join(root, `${suffix}.snapshot.json`), auditRoot: root, features, verifierVersion });
  expect(snapshot("before").lessons).toHaveLength(0);
  verifyEngineeringRepairEvidence(file, { ...verify, viewports: ["1280x720"] });
  expect(snapshot("partial").lessons).toHaveLength(0);
  verifyEngineeringRepairEvidence(file, verify);
  const accepted = snapshot("accepted");
  expect(accepted.lessons).toHaveLength(1);
  expect(JSON.stringify(accepted)).not.toMatch(/item-private|#private|childResponse|transcript/);
  expect(snapshot("irrelevant", ["audio"]).lessons).toHaveLength(0);
  expect(snapshot("incompatible", ["svg_interaction"], DISCOVERY_VERIFIER_VERSION + 1).lessons).toHaveLength(0);
  verifyEngineeringRepairEvidence(file, { ...verify, scoring: false });
  expect(snapshot("regressed").lessons).toHaveLength(0);
  expect(() => snapshot("accepted")).toThrow("engineering_snapshot_ineligible");
  expect(freezeEngineeringLessonSnapshot({ snapshotFile: path.join(root, "accepted.snapshot.json"), auditRoot: root, features: ["svg_interaction"], verifierVersion: DISCOVERY_VERIFIER_VERSION, preserveCompleted: true })).toEqual(accepted);
});
it("rejects checksum-valid snapshot injection and incompatible lessons before a new request", () => {
  const { root, file, input, verify } = fixture();
  recordEngineeringRepairEvidence(input); verifyEngineeringRepairEvidence(file, verify);
  const args = { snapshotFile: path.join(root, "saved.snapshot.json"), auditRoot: root, features: ["svg_interaction"], verifierVersion: DISCOVERY_VERIFIER_VERSION };
  const original = freezeEngineeringLessonSnapshot(args);
  for (const mutate of [
    (lessons: any[]) => lessons.push(...Array(3).fill(lessons[0])),
    (lessons: any[]) => { lessons[0].transcript = "private child response"; },
    (lessons: any[]) => { lessons[0].verified = false; },
  ]) {
    const altered = structuredClone(original); mutate(altered.lessons);
    altered.selectedLessonIds = altered.lessons.map(row => row.lessonId);
    altered.hash = createHash("sha256").update(JSON.stringify(altered.lessons)).digest("hex");
    fs.writeFileSync(args.snapshotFile, JSON.stringify(altered));
    expect(() => freezeEngineeringLessonSnapshot(args)).toThrow("engineering_snapshot");
  }
  fs.writeFileSync(args.snapshotFile, JSON.stringify(original));
  expect(() => freezeEngineeringLessonSnapshot({ ...args, verifierVersion: DISCOVERY_VERIFIER_VERSION + 1 })).toThrow("engineering_snapshot_ineligible");
});
it("freezes at most three relevant lessons and rejects arbitrary child text or changed contracts", () => {
  const { root, input, verify } = fixture();
  for (let i = 0; i < 5; i++) {
    const file = path.join(root, `${i}.engineering-repair.json`);
    recordEngineeringRepairEvidence({ ...input, file, originalHash: String(i).repeat(64) });
    verifyEngineeringRepairEvidence(file, verify);
  }
  const snapshotFile = path.join(root, "request.snapshot.json");
  const snapshot = freezeEngineeringLessonSnapshot({ snapshotFile, auditRoot: root, features: ["svg_interaction"], verifierVersion: DISCOVERY_VERIFIER_VERSION });
  expect(snapshot.lessons).toHaveLength(3);
  expect(snapshot.selectedLessonIds).toHaveLength(3);
  expect(snapshot.hash).toMatch(/^[a-f0-9]{64}$/);
  expect(() => recordEngineeringRepairEvidence({ ...input, proposal: { ...input.proposal, cause: "Reina typed her homework answer" } })).toThrow("engineering_lesson_proposal_invalid");
  recordEngineeringRepairEvidence(input);
  verifyEngineeringRepairEvidence(input.file, { ...verify, academicHash: "e".repeat(64) });
  expect(JSON.parse(fs.readFileSync(input.file, "utf8")).verified).toBe(false);
});
