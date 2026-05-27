import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { ActiveSessionPlan } from "../context/schemas/learningProfile";
import {
  buildPlannerDecisionAuditInput,
  renderPlannerDecisionAuditTable,
  runPlannerDecisionAudit,
} from "./auditPlannerDecisions";

const roots: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-planner-audit-cli-"));
  roots.push(root);
  return root;
}

function writeJson(root: string, rel: string, value: unknown): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function activePlan(): ActiveSessionPlan {
  return {
    planId: "plan-cli-demo",
    childId: "reina",
    createdAt: "2026-05-25T12:00:00.000Z",
    source: "ingest_human_loop",
    activeHomeworkId: "hw-cli-demo",
    domain: "spelling",
    testDate: "2026-05-26",
    nodePlan: [
      {
        id: "read-high-frequency",
        type: "word-radar",
        activityId: "word-radar",
        targets: ["among", "building"],
        difficulty: 1,
        source: "chart_planner",
        targetLane: "high_frequency_words",
        wordRadarConfig: {
          recallMode: "visible_read",
          inputMode: "whole-word",
          speakStyle: "option-a",
          showTimer: false,
          hideWordDuringResponse: false,
          requiresCapturedResponse: true,
        },
      },
      {
        id: "mystery-choice",
        type: "mystery",
        activityId: "mystery",
        targets: ["among", "building"],
        difficulty: 1,
        source: "chart_planner",
        choiceMode: "choice_lab",
        locked: false,
      },
    ],
    variationPolicy: {
      avoidExactPreviousNodeOrder: true,
      avoidExactPreviousWordOrder: true,
      seed: "cli",
      previousCompletedNodeCount: 0,
    },
    companionPolicy: {
      companionId: "matilda",
      displayName: "Matilda",
      openingLinePolicy: "context_start_short",
      verbosity: "low",
      maxMicroProbes: 1,
    },
    evidenceUsed: [{
      id: "assignment-source",
      type: "assignment_source",
      summary: "Planner used current homework source.",
    }],
    openQuestions: [],
    planTheory: {
      hypothesis: "High-frequency words need visible read evidence.",
      evidenceSummary: ["Homework source marks high-frequency words separately."],
      intervention: "Use visible read baseline and preference lab.",
      supportCriteria: ["Low-friction reading evidence."],
      reviseCriteria: ["Hesitation or frustration."],
      falsifyCriteria: ["Quest or graded work contradicts the plan."],
    },
    plannedMeasurements: [
      {
        id: "measure-read-high-frequency",
        activityId: "word-radar",
        target: "high_frequency_words",
        evidenceType: "practice:visible_read",
        supportCriteria: "Word Radar supports the theory.",
        reviseCriteria: "Word Radar is mixed.",
        falsifyCriteria: "Word Radar contradicts the theory.",
      },
      {
        id: "measure-mystery-choice",
        activityId: "mystery",
        target: "preference",
        evidenceType: "reward",
        supportCriteria: "Mystery captures preference.",
        reviseCriteria: "Mystery creates friction.",
        falsifyCriteria: "Mystery is incorrectly used as mastery.",
      },
    ],
  };
}

describe("auditPlannerDecisions CLI helpers", () => {
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it("loads child chart files and renders a planner decision audit table", () => {
    const root = makeRoot();
    writeJson(root, "src/context/reina/plans/active_session_plan.json", {
      version: 1,
      childId: "reina",
      selectedDomain: "spelling",
      current: activePlan(),
    });
    writeJson(root, "src/context/reina/homework/current.json", {
      version: 1,
      childId: "reina",
      current: {
        capturedContent: {
          wordGroups: [
            {
              id: "high_frequency_words",
              label: "High-Frequency Words",
              purpose: "read_fluently",
              words: ["among", "building"],
              evidence: ["Teacher heading separates high-frequency reading words."],
            },
          ],
        },
      },
    });

    const input = buildPlannerDecisionAuditInput({ childId: "reina", rootDir: root });
    const report = runPlannerDecisionAudit({ childId: "reina", rootDir: root });
    const table = renderPlannerDecisionAuditTable(report);

    expect(input.sourceGroups[0]).toMatchObject({
      id: "high_frequency_words",
      purpose: "read_fluently",
    });
    expect(report.summary).toMatchObject({
      nodeCount: 2,
      blockerCount: 0,
    });
    expect(table).toContain("read-high-frequency");
    expect(table).toContain("word-radar/visible_read");
    expect(table).toContain("ok");
    expect(table).toContain("mystery-choice");
  });
});
