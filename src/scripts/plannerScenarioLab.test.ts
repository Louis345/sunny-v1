import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { AssignmentPlannerOutput } from "../engine/assignmentPlanner";
import type { PlannerScenarioRun } from "../engine/plannerScenarioLab";
import { runPlannerScenarioLabCli } from "./plannerScenarioLab";

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-planner-lab-"));
}

function writeJson(root: string, rel: string, value: unknown): string {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return file;
}

function output(childId: string, nodes: Array<{
  id: string;
  type: string;
  activityId: string;
  locked?: boolean;
  recallMode?: string;
}>): AssignmentPlannerOutput {
  return {
    capturedContent: {
      title: "Spelling",
      type: "spelling_test",
      rawText: "sign know",
      words: ["sign", "know"],
      questions: [],
      wordGroups: [],
      sourceDocuments: [],
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "language_arts",
        topic: "silent letters",
        primarySkill: "spelling",
        assignmentFormat: "list",
        concepts: [],
        sourceEvidence: [],
      },
    },
    assignmentInterpretation: {
      schemaVersion: 1,
      status: "ready",
      wordGroups: [],
      assertions: [],
      selectedTargets: [],
      heldTargets: [],
      clarificationQuestions: [],
      humanAnswers: [],
      memoryMatches: [],
    },
    homeworkWords: [],
    activeSessionPlan: {
      planId: `plan-${childId}`,
      childId,
      createdAt: "2026-05-27T12:00:00.000Z",
      source: "planner_scenario_lab",
      domain: "spelling",
      activeHomeworkId: "hw",
      nodePlan: nodes.map((node) => ({
        id: node.id,
        type: node.type,
        activityId: node.activityId,
        targets: ["sign"],
        difficulty: 1,
        source: "chart_planner",
        locked: node.locked,
        wordRadarConfig: node.recallMode
          ? {
              recallMode: node.recallMode,
              inputMode: "whole-word",
              speakStyle: "option-a",
              showTimer: false,
              hideWordDuringResponse: true,
              requiresCapturedResponse: true,
            }
          : undefined,
      })),
      adventureBoard: {
        boardId: `board-${childId}`,
        planId: `plan-${childId}`,
        childId,
        title: "Board",
        domain: "spelling",
        theme: {
          backgroundImage: "/x.png",
          palette: {
            path: "#fff",
            completed: "#0f0",
            available: "#00f",
            locked: "#999",
            current: "#ff0",
            preview: "#0ff",
            text: "#fff",
            panel: "#000",
          },
        },
        nodes: [
          { id: "mystery", kind: "mystery", label: "Mystery", state: "available" },
          { id: "quest", kind: "quest", label: "Quest", state: "locked" },
          { id: "boss", kind: "boss", label: "Boss", state: "locked" },
        ],
        edges: [],
        choiceSets: [{
          id: "route",
          kind: "baseline-route",
          options: [
            { id: "a", label: "A", nodeId: "spell" },
            { id: "b", label: "B", nodeId: "radar" },
          ],
        }],
      },
      variationPolicy: {
        avoidExactPreviousNodeOrder: true,
        avoidExactPreviousWordOrder: true,
        seed: childId,
        previousCompletedNodeCount: 0,
      },
      companionPolicy: {
        companionId: "elli",
        displayName: "Elli",
        openingLinePolicy: "context_start_short",
        verbosity: "low",
        maxMicroProbes: 1,
      },
      evidenceUsed: [{ id: "e", type: "chart", summary: "no prior spelling baseline" }],
      openQuestions: [],
      approvalStatus: "pending",
    },
    plannedMeasurements: [],
    reviewQuestions: [],
  } as unknown as AssignmentPlannerOutput;
}

function run(childId: string, createdAt: string, nodes: Parameters<typeof output>[1]): PlannerScenarioRun {
  return {
    scenarioId: "spelling-ability-bands",
    childId,
    model: "claude-sonnet-4-5",
    createdAt,
    latencyMs: 100,
    tokenEstimate: {
      inputTokens: 10_000,
      outputTokens: 2_000,
    },
    expectedEvidenceTerms: ["no prior spelling baseline"],
    scenarioExpectations: {
      requiredEvidenceRoles: ["spelling_production"],
    },
    preflight: { status: "pass", issues: [] },
    output: output(childId, nodes),
  };
}

describe("plannerScenarioLab CLI", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes batch metadata for fixture runs", async () => {
    const root = makeRoot();
    roots.push(root);
    const runsDir = path.join(root, "runs");
    const resultsDir = path.join(root, "logs");
    writeJson(runsDir, "fixture.json", [
      run("typical_speller", "2026-05-27T22:00:00.000Z", [
        { id: "spell", type: "spell-check", activityId: "spell-check" },
        { id: "mystery", type: "mystery", activityId: "mystery", locked: false },
        { id: "quest", type: "quest", activityId: "quest", locked: true },
        { id: "boss", type: "boss", activityId: "boss", locked: true },
      ]),
    ]);
    const lines: string[] = [];

    await runPlannerScenarioLabCli([
      "--scenario=spelling-ability-bands",
      `--runs-dir=${runsDir}`,
      `--results-dir=${resultsDir}`,
      "--batch-id=fixture-test",
    ], { stdout: (line) => lines.push(line) });

    const metadata = JSON.parse(fs.readFileSync(path.join(resultsDir, "batches", "fixture-test.json"), "utf8")) as {
      batchId: string;
      runCount: number;
      pass: boolean;
    };
    expect(metadata).toMatchObject({ batchId: "fixture-test", runCount: 1, pass: true });
    expect(lines.join("\n")).toContain("status: pass");
  });

  it("writes comparison markdown and JSON for first-full vs latest-full run sets", async () => {
    const root = makeRoot();
    roots.push(root);
    const resultsDir = path.join(root, "logs");
    writeJson(resultsDir, "runs/spelling-ability-bands/typical/claude-sonnet-4-5/first.json", run(
      "typical_speller",
      "2026-05-27T22:00:00.000Z",
      [
        { id: "radar", type: "word-radar", activityId: "word-radar", recallMode: "visible_read" },
        { id: "mystery", type: "mystery", activityId: "mystery", locked: false },
        { id: "quest", type: "quest", activityId: "quest", locked: true },
        { id: "boss", type: "boss", activityId: "boss", locked: true },
      ],
    ));
    writeJson(resultsDir, "runs/spelling-ability-bands/typical/claude-sonnet-4-5/latest.json", run(
      "typical_speller",
      "2026-05-27T23:00:00.000Z",
      [
        { id: "spell", type: "spell-check", activityId: "spell-check" },
        { id: "mystery", type: "mystery", activityId: "mystery", locked: false },
        { id: "quest", type: "quest", activityId: "quest", locked: true },
        { id: "boss", type: "boss", activityId: "boss", locked: true },
      ],
    ));
    const lines: string[] = [];

    await runPlannerScenarioLabCli([
      "--compare",
      "--scenario=spelling-ability-bands",
      "--baseline=first-full:claude-sonnet-4-5",
      "--candidate=latest-full:claude-sonnet-4-5",
      `--results-dir=${resultsDir}`,
    ], { stdout: (line) => lines.push(line) });

    const out = lines.join("\n");
    expect(out).toContain("status: improved");
    expect(fs.existsSync(path.join(resultsDir, "comparisons", "spelling-ability-bands", "first-full-claude-sonnet-4-5__vs__latest-full-claude-sonnet-4-5.json"))).toBe(true);
    expect(fs.existsSync(path.join(resultsDir, "comparisons", "spelling-ability-bands", "first-full-claude-sonnet-4-5__vs__latest-full-claude-sonnet-4-5.md"))).toBe(true);
  });
});
