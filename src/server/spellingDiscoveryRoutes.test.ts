import express from "express";
import type { AddressInfo } from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSpellingRecallItems, createSpellingDiscoveryCycle, buildSpellingDiscoveryPlan } from "../engine/learningCycleIngest";
import { hashDiscoveryContract, publishDiscoveryExperience } from "../engine/adaptiveMathDiscovery";
import { getLearningCycle } from "../engine/learningCycleRepository";
import { setupRoutes } from "./routes";
import { registerActiveVoiceSessionManager, __resetVoiceSessionRegistryForTests } from "./voice-session-registry";
vi.mock("../shared/childRegistry", async (original) => ({ ...await original<typeof import("../shared/childRegistry")>(), listChildProfileIds: () => ["lab-child"] }));
const roots: string[] = [];
const servers: ReturnType<ReturnType<typeof express>["listen"]>[] = [];
afterEach(() => { servers.splice(0).forEach(server => server.close()); roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })); vi.unstubAllEnvs(); __resetVoiceSessionRegistryForTests(); });
async function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "spelling-routes-")); roots.push(rootDir);
  vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context")); vi.stubEnv("SUNNY_MODE", "real");
  const items = buildSpellingRecallItems({ homeworkId: "hw-words", words: ["night", "light"], evidenceIds: ["school:one"], measurementRole: "fresh_checkpoint" });
  const cycle = createSpellingDiscoveryCycle({ childId: "lab-child", homeworkId: "hw-words", title: "Words", contentFingerprint: "source", items }, { rootDir });
  publishDiscoveryExperience({ rootDir, childId: "lab-child", homeworkId: "hw-words", spellingItems: items, assignment: cycle.assignment, activeSessionPlan: buildSpellingDiscoveryPlan({ cycle, companion: { id: "elli", name: "Elli" } }) });
  const app = express(); app.use(express.json()); setupRoutes(app); const server = app.listen(0); servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/learning/lab-child/assignments/hw-words/discovery`;
  const post = (suffix: string, body: unknown) => fetch(`${base}/${suffix}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { rootDir, items, post, origin: new URL(base).origin };
}
describe("spelling through the production Discovery routes", () => {
  it("serves a native spelling config from the isolated context root", async () => {
    const { rootDir, origin } = await fixture();
    const dir = path.join(rootDir, "src/context/lab-child/homework/games/hw-words"); fs.mkdirSync(dir, { recursive: true });
    const config = { schemaVersion: 1, activityId: "letter-rush", mode: "read-and-race", topic: "Words", domain: "spelling", learningGoal: "Practice", gradeBand: "early_elementary", scaffolds: { showWord: true, letterBank: true, allowRetryBeforeScore: true, companionHints: false }, words: [{ id: "frozen-night", text: "night" }], evidencePolicy: { writesPracticeEvidence: true, writesMasteryEvidence: false, requiresPerTargetResult: true, allowedEvidence: ["practice"] } };
    fs.writeFileSync(path.join(dir, "practice.json"), JSON.stringify(config));
    const response = await fetch(`${origin}/api/activity-config/lab-child/hw-words/practice.json`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ words: [{ id: "frozen-night", text: "night" }], evidencePolicy: { writesMasteryEvidence: false } });
  });
  it("uses live support provenance, grades frozen answers, and ignores forged correctness", async () => {
    const { rootDir, items, post } = await fixture();
    registerActiveVoiceSessionManager("lab-child", { noteExternalEvent() {}, getDiscoveryAttemptContext: () => ({ support: { status: "unassisted", scaffolds: [] }, instrumentSignals: [], artifactHash: hashDiscoveryContract(items), sessionId: "s1" }) });
    const body = { attemptId: "a1", itemId: items[0].id, attemptedValue: "nite", observedAt: "2026-09-08T12:00:00Z", supportEventIds: [], instrumentSignals: [], correct: true, constructId: "invented", assistance: "unassisted" };
    expect((await post("attempt", body)).status).toBe(200);
    expect((await post("attempt", body)).status).toBe(200);
    const cycle = getLearningCycle("lab-child", "hw-words", { rootDir })!;
    expect(cycle.observations).toHaveLength(1);
    expect(cycle.observations[0]).toMatchObject({ result: { correct: false }, constructLinks: [{ constructId: items[0].constructId }], assistance: { status: "unassisted" } });
  });
  it("does not infer independence without a live server context and keeps Not sure unknown", async () => {
    const { rootDir, items, post } = await fixture();
    const body = { attemptId: "a1", itemId: items[0].id, attemptedValue: "", skipped: true, observedAt: "2026-09-08T12:00:00Z", supportEventIds: [], instrumentSignals: [] };
    expect((await post("attempt", body)).status).toBe(200);
    expect((await post("attempt", body)).status).toBe(200);
    const observed = getLearningCycle("lab-child", "hw-words", { rootDir })!.observations[0];
    expect(observed.result.correct).toBeUndefined(); expect(observed.assistance.status).toBe("unknown");
    expect((await post("complete", {})).status).toBe(409);
  });
});
