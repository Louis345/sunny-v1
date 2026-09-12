import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildIngestSummary, runSpellingDiscoveryIntake } from "./ingestHomework";
import { seedSpellingLab } from "./fixtures/spellingEvidenceFirst";
import { getLearningCycle } from "../engine/learningCycleRepository";
import { recordSpellingDiscoveryAttempt } from "../engine/learningCycleRuntime";

const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })); });

async function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "spelling-summary-")); roots.push(rootDir);
  vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context"));
  const sourceFile = seedSpellingLab(rootDir);
  const childId = "lab-child";
  const callPlannerModel = vi.fn(async (packet: Parameters<typeof recordedSpellingDiagnostic>[0]) => ({ draft: { diagnostic: recordedSpellingDiagnostic(packet), title: "School spelling", words: ["night", "light"].map(word => ({ word, pageNumber: 1 })), sourceNotes: [], uncertainty: [] } }));
  const input = { rootDir, childId, sourceFile };
  const { homeworkId } = await runSpellingDiscoveryIntake(input, { callPlannerModel });
  const child = path.join(rootDir, "src/context", childId);
  const planFile = path.join(child, "plans/active_session_plan.json");
  const cycleFile = path.join(child, "homework/cycles", `${homeworkId}.json`);
  const mutate = (file: string, change: (value: any) => void) => { const value = JSON.parse(fs.readFileSync(file, "utf8")); change(value); fs.writeFileSync(file, JSON.stringify(value)); };
  const summary = () => buildIngestSummary(childId, "2026-09-09", { rootDir });
  return { ...input, child, homeworkId, planFile, cycleFile, callPlannerModel, mutate, summary };
}

describe("spelling ingestion summary is a read-only lifecycle report", () => {
  it("reports one published native Discovery, without requiring generated arms or artwork", async () => {
    const f = await fixture();
    const before = fs.readFileSync(f.cycleFile, "utf8");
    expect(f.summary()).toMatchObject({ status: "DISCOVERY_READY", lifecycle: "evaluation_ready", homeworkId: f.homeworkId, plannedActivities: 1, launchableActivities: 1, uniqueShells: 1, fallbackActivities: 0, readinessFailures: [] });
    expect(f.summary()).toMatchObject({ status: "DISCOVERY_READY" });
    expect(fs.readFileSync(f.cycleFile, "utf8")).toBe(before);
    expect(f.callPlannerModel).toHaveBeenCalledOnce();
  });

  it("reports resumable Discovery without resetting captured answers or recapturing", async () => {
    const f = await fixture();
    const cycle = getLearningCycle(f.childId, f.homeworkId, f)!;
    const item = Object.values(cycle.nodes[0].evidenceContract.spellingItems!)[0];
    recordSpellingDiscoveryAttempt({ childId: f.childId, homeworkId: f.homeworkId, attempt: { attemptId: "actual-recall", itemId: item.id, attemptedValue: "nite", observedAt: new Date().toISOString() }, support: { status: "unassisted", scaffolds: [] } }, f);
    const before = fs.readFileSync(f.cycleFile, "utf8");
    expect(f.summary()).toMatchObject({ status: "DISCOVERY_READY", lifecycle: "evaluation_active", launchableActivities: 1 });
    expect(fs.readFileSync(f.cycleFile, "utf8")).toBe(before);
    expect(f.callPlannerModel).toHaveBeenCalledOnce();
  });

  it.each([
    "missing cycle", "missing published plan", "wrong assignment", "wrong child", "wrong node",
    "visible answers", "missing native config", "changed native contract", "missing native launch", "pending publication",
  ])("keeps %s blocked", async scenario => {
    const f = await fixture();
    const node = getLearningCycle(f.childId, f.homeworkId, f)!.nodes[0];
    if (scenario === "missing cycle") fs.rmSync(f.cycleFile);
    if (scenario === "missing published plan") fs.rmSync(f.planFile);
    if (scenario === "wrong assignment") f.mutate(f.planFile, plan => { plan.current.activeHomeworkId = "other-assignment"; });
    if (scenario === "wrong child") f.mutate(f.planFile, plan => { plan.current.childId = "other-child"; });
    if (scenario === "wrong node") f.mutate(f.planFile, plan => { plan.current.nodePlan[0].id = "other-node"; });
    if (scenario === "visible answers") f.mutate(f.planFile, plan => { plan.current.nodePlan[0].wordRadarConfig.hideWordDuringResponse = false; });
    if (scenario === "missing native config") fs.rmSync(node.artifactBinding!.activityConfigPath!);
    if (scenario === "changed native contract") f.mutate(node.artifactBinding!.activityConfigPath!, config => { config.items[0].word = "other"; });
    if (scenario === "missing native launch") f.mutate(f.planFile, plan => { plan.current.adventureBoard.nodes = []; });
    if (scenario === "pending publication") fs.writeFileSync(path.join(f.child, "homework/discovery-publication.json"), "{}");
    const before = fs.existsSync(f.cycleFile) ? fs.readFileSync(f.cycleFile, "utf8") : null;
    const summary = f.summary();
    expect(summary).toMatchObject({ status: "BLOCKED", launchableActivities: 0 });
    expect(summary!.readinessFailures.length).toBeGreaterThan(0);
    expect(fs.existsSync(f.cycleFile) ? fs.readFileSync(f.cycleFile, "utf8") : null).toBe(before);
    expect(f.callPlannerModel).toHaveBeenCalledOnce();
  });

  it("does not treat a targeted spelling board as ready just because it is spelling", async () => {
    const f = await fixture();
    f.mutate(f.cycleFile, cycle => { cycle.lifecycle = "board_generating"; });
    f.mutate(f.planFile, plan => { plan.current.planId = `targeted:${f.homeworkId}`; });
    const summary = f.summary();
    expect(summary!.status).toBe("BLOCKED");
    expect(summary!.readinessFailures).toContain("baseline_experiment_requires_exactly_two_arms");
  });
});
import { recordedSpellingDiagnostic } from "./fixtures/spellingEvidenceFirst";
