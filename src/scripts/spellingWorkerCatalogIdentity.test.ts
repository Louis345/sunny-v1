import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runSpellingDiscoveryIntake } from "./ingestHomework";
import { runAdaptiveMathGeneration } from "./runAdaptiveMathGeneration";
import { recordedSpellingPlan, seedSpellingLab } from "./fixtures/spellingEvidenceFirst";
import { planAssignmentFromSourceWithTelemetry } from "../engine/assignmentPlanner";
import { completeDiscoveryEvaluation, getMathGenerationStatus } from "../engine/adaptiveMathDiscovery";
import { buildSpellingRecallItems } from "../engine/learningCycleIngest";
import { createLearningCycle, getLearningCycle } from "../engine/learningCycleRepository";
import { recordSpellingDiscoveryAttempt } from "../engine/learningCycleRuntime";
import { getChildChart } from "../profiles/childChart";
import { writeWaterfallContentCatalog, writeWaterfallHomework } from "../profiles/chartWaterfall";

vi.mock("../engine/assignmentPlanner", async original => ({
  ...await original<typeof import("../engine/assignmentPlanner")>(),
  planAssignmentFromSourceWithTelemetry: vi.fn(),
}));

let rootDir: string;
const childId = "lab-child";
beforeEach(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-spelling-catalog-identity-"));
  vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context"));
  vi.stubGlobal("fetch", () => { throw new Error("catalog_identity_network_forbidden"); });
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fs.rmSync(rootDir, { recursive: true, force: true });
});

// Review caught an assignment-identity mismatch, not a scoring failure. Worker
// logs named the requested homework but omitted the catalog's source cycle;
// the lab previously resumed only while that same assignment remained selected.
describe("spelling worker catalog identity on resume", () => {
  it.each(["math", "spelling"] as const)("catalogs only requested spelling artifacts with another %s assignment selected", async domain => {
    const sourceFile = seedSpellingLab(rootDir);
    const { homeworkId } = await runSpellingDiscoveryIntake({ childId, rootDir, sourceFile }, {
      callPlannerModel: async packet => ({ draft: {
        diagnostic: recordedSpellingDiagnostic(packet), title: "School words", words: ["night", "light"].map(word => ({ word, pageNumber: 1 })), uncertainty: [],
      } }),
    });
    const opening = getLearningCycle(childId, homeworkId, { rootDir })!;
    Object.values(opening.nodes[0].evidenceContract.spellingItems!).forEach((item, index) => {
      recordSpellingDiscoveryAttempt({ childId, homeworkId, attempt: {
        attemptId: `requested-evidence-${index}`, itemId: item.id,
        attemptedValue: index === 0 ? item.word : "lite", observedAt: "2026-09-08T10:00:00Z",
      }, support: { status: "unassisted", scaffolds: [] } }, { rootDir });
    });
    completeDiscoveryEvaluation({ childId, homeworkId, rootDir, completedAt: "2026-09-08T10:01:00Z" });
    vi.mocked(planAssignmentFromSourceWithTelemetry).mockImplementationOnce(async packet => ({
      output: recordedSpellingPlan(packet, rootDir), telemetry: { model: "recorded-planner", latencyMs: 1 },
    }));
    await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
    const requested = getLearningCycle(childId, homeworkId, { rootDir })!;
    const requestedNodes = requested.nodes.filter(node => node.role !== "evaluation" && node.artifactBinding);
    expect(requestedNodes).toHaveLength(2);
    const chart = getChildChart(childId, { rootDir });

    const otherHomeworkId = `hw-other-${domain}`;
    const otherTitle = `Other ${domain} instrument`;
    const otherTargets = domain === "math" ? ["5x2"] : ["storm"];
    const otherItems = buildSpellingRecallItems({
      homeworkId: otherHomeworkId, words: otherTargets, evidenceIds: ["other-assignment-evidence"],
      measurementRole: "practice", exposure: "practiced", occasionId: "other-practice",
    });
    const other = createLearningCycle({
      childId, homeworkId: otherHomeworkId, domain,
      assignment: { title: otherTitle, targets: otherTargets, contentFingerprint: "other-fingerprint", capturedEvidenceIds: ["other-source"] },
      academicTheory: { ...requested.academicTheory, theoryId: "other-theory" }, engagementTheory: null,
      nodes: [{
        ...requestedNodes[0], nodeId: "other-node", title: otherTitle, theoryId: "other-theory",
        openingScreen: { title: otherTitle, purpose: "A different assignment" },
        academicTarget: { domain, skill: domain === "math" ? "multiplication" : "spelling-recall", targets: otherTargets },
        evidenceContract: { academic: true, engagement: true, companionObservations: true,
          ...(domain === "spelling" ? { spellingItems: Object.fromEntries(otherItems.map(item => [item.id, item])) } : {}),
        },
        artifactBinding: { ...requestedNodes[0].artifactBinding!, contentId: "other-uncataloged-artifact", artifactId: "other-artifact", localArtifactPath: "/other/instrument.json" },
      }],
    }, { rootDir });
    const preserved = { ...chart.contentCatalog.items[0], contentId: "existing-other-catalog-entry", homeworkId: otherHomeworkId, domain,
      targetWords: domain === "spelling" ? otherTargets : [], inputEvidence: { contentFingerprint: "other-fingerprint", activityEvidenceIds: ["other-assignment-evidence"] },
    };
    // Reproduce an interrupted catalog projection after artifacts and the paid
    // stage receipt survived, then switch selection through the real chart IO.
    writeWaterfallContentCatalog(childId, { ...chart.learningProfile, aiContentCatalog: [preserved] }, { rootDir });
    writeWaterfallHomework(childId, { ...chart.learningProfile, selectedHomeworkDomain: domain,
      pendingHomework: { weekOf: "2026-09-09", testDate: null, homeworkId: otherHomeworkId, wordList: domain === "spelling" ? otherTargets : [],
        generatedAt: "2026-09-09T00:00:00Z", nodes: [],
        contentProfile: { practiceDomain: domain, contentDomain: domain, topic: otherTitle, primarySkill: "recall",
          assignmentFormat: "worksheet", concepts: otherTargets, sourceEvidence: ["other-source"] },
      },
    }, { rootDir });
    expect(getChildChart(childId, { rootDir }).learningCycle?.homeworkId).toBe(otherHomeworkId);
    expect(getChildChart(childId, { rootDir }).contentCatalog.items).toEqual([preserved]);
    vi.mocked(planAssignmentFromSourceWithTelemetry).mockClear();
    vi.mocked(planAssignmentFromSourceWithTelemetry).mockRejectedValue(new Error("resume_must_reuse_planner_receipt"));

    await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
    const catalog = getChildChart(childId, { rootDir }).contentCatalog.items;
    expect(catalog.find(item => item.contentId === preserved.contentId)).toEqual(preserved);
    const added = catalog.filter(item => item.contentId !== preserved.contentId);
    expect(added.map(item => item.contentId).sort()).toEqual(requestedNodes.map(node => node.artifactBinding!.contentId).sort());
    for (const node of requestedNodes) {
      const item = added.find(item => item.contentId === node.artifactBinding!.contentId)!;
      expect(item).toMatchObject({ childId, homeworkId, domain: "spelling", title: node.title,
        theoryDecisionId: node.theoryId, gameHtmlPath: node.artifactBinding!.localArtifactPath,
        targetSkills: [node.academicTarget.skill], targetWords: node.academicTarget.targets,
        inputEvidence: { contentFingerprint: requested.assignment.contentFingerprint,
          activityEvidenceIds: [...new Set(Object.values(node.evidenceContract.spellingItems!).flatMap(word => word.lineage.sourceEvidenceIds))],
        }, reuseStatus: "candidate",
      });
      expect(item.inputEvidence.activityEvidenceIds).toEqual(expect.arrayContaining(["requested-evidence-0", "requested-evidence-1"]));
    }
    expect(planAssignmentFromSourceWithTelemetry).not.toHaveBeenCalled();
    expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.nodes.filter(node => node.status === "ready")).toHaveLength(2);
    expect(getLearningCycle(childId, homeworkId, { rootDir })).toEqual(requested);
    expect(getLearningCycle(childId, otherHomeworkId, { rootDir })).toEqual(other);

    await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
    expect(getChildChart(childId, { rootDir }).contentCatalog.items).toEqual(catalog);
    expect(planAssignmentFromSourceWithTelemetry).not.toHaveBeenCalled();
  });
});
import { recordedSpellingDiagnostic } from "./fixtures/spellingEvidenceFirst";
