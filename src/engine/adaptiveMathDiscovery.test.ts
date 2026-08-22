import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getLearningCycle } from "./learningCycleRepository";
import {
  buildTargetedNodesResumably,
  buildDiscoveryActiveSessionPlan,
  runAdaptiveTargetedGeneration,
  completeDiscoveryEvaluation,
  createDiscoveryLearningCycle,
  getMathGenerationStatus,
  recordDiscoveryAttempt,
  publishDiscoveryExperience,
  publishTargetedBoardProjection,
  generateMathDiscoveryExperience,
  revealTargetedBoard,
  updateMathGenerationNode,
  writeMathGenerationJob,
  type MathDiscoveryEvaluationContract,
} from "./adaptiveMathDiscovery";

function root(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-discovery-"));
}

const contract: MathDiscoveryEvaluationContract = {
  evaluationId: "evaluation:equal-groups",
  title: "What Do You Notice?",
  assignmentEvidenceIds: ["assignment:equal-groups"],
  constructs: [{ constructId: "math.multiplication.equal_groups", prerequisiteIds: [] }],
  items: [{
    itemId: "probe-1",
    constructId: "math.multiplication.equal_groups",
    prompt: "Show how many equal groups you see.",
    responseContract: "select_group_count",
    correctAnswerContract: { acceptedValues: ["4"] },
    difficultyBoundary: "four groups within Grade 3 scope",
    exposureId: "evaluation:equal-groups:probe-1",
    possibleConfounds: ["pointer_precision"],
    falsifyingEvidence: ["Independent selection does not identify four groups."],
    measurementKeys: ["independent_correct", "response_mode"],
  }],
  artifact: {
    artifactId: "evaluation-artifact:equal-groups",
    htmlPath: "/games/hw-equal-groups/discovery.html",
    artworkPath: "/generated/discovery-equal-groups.jpeg",
    contractHash: "contract-hash",
    artifactHash: "artifact-hash",
  },
};

describe("adaptive math discovery", () => {
  it("publishes Discovery atomically while preserving another domain", () => {
    const rootDir = root();
    const context = path.join(rootDir, "src/context/lab-child");
    fs.mkdirSync(path.join(context, "plans"), { recursive: true });
    fs.mkdirSync(path.join(context, "homework"), { recursive: true });
    fs.writeFileSync(path.join(context, "plans/active_session_plan.json"), JSON.stringify({ version: 1, childId: "lab-child", selectedDomain: "spelling", current: { planId: "spell" }, activeByDomain: { spelling: { planId: "spell" } } }));
    fs.writeFileSync(path.join(context, "homework/current.json"), JSON.stringify({ version: 1, childId: "lab-child", selectedDomain: "spelling", current: { homeworkId: "spell-hw" }, activeByDomain: { spelling: { homeworkId: "spell-hw" } } }));
    fs.writeFileSync(path.join(context, "learning_profile.json"), JSON.stringify({ childId: "lab-child", activeSessionPlanByDomain: { spelling: { planId: "spell" } }, activeHomeworkByDomain: { spelling: { homeworkId: "spell-hw" } } }));
    const plan = buildDiscoveryActiveSessionPlan({ childId: "lab-child", homeworkId: "hw-equal-groups", evaluation: contract, companion: { id: "elli", name: "Elli" } });

    publishDiscoveryExperience({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", evaluation: contract, activeSessionPlan: plan, assignment: { title: "Equal groups", contentFingerprint: "fingerprint", capturedEvidenceIds: ["assignment:equal-groups"], targets: ["math.multiplication.equal_groups"] } });

    const savedPlan = JSON.parse(fs.readFileSync(path.join(context, "plans/active_session_plan.json"), "utf8"));
    const savedHomework = JSON.parse(fs.readFileSync(path.join(context, "homework/current.json"), "utf8"));
    expect(savedPlan.activeByDomain.spelling.planId).toBe("spell");
    expect(savedPlan.activeByDomain.math.planId).toBe("discovery:hw-equal-groups");
    expect(savedHomework.activeByDomain.spelling.homeworkId).toBe("spell-hw");
    expect(savedHomework.activeByDomain.math.homeworkId).toBe("hw-equal-groups");
    expect(getLearningCycle("lab-child", "hw-equal-groups", { rootDir })?.lifecycle).toBe("evaluation_ready");
  });

  it("generates one frozen Discovery through Planner and Creator phases", async () => {
    const rootDir = root();
    const calls: Array<{ model: string; prompt: string }> = [];
    const responses = [
      { content: [{ type: "tool_use", name: "create_math_discovery_contract", input: { evaluationId: "eval-1", title: "Show What You Know", assignmentEvidenceIds: ["assignment:1"], constructs: [{ constructId: "math.equal_groups", prerequisiteIds: [] }], items: [{ itemId: "i1", constructId: "math.equal_groups", prompt: "How many groups?", responseContract: "tap one number", correctAnswerContract: { acceptedValues: ["4"] }, difficultyBoundary: "grade 3", exposureId: "eval-1:i1", possibleConfounds: ["interface_friction"], falsifyingEvidence: ["response is not independent"], measurementKeys: ["independent_correct"] }] } }], usage: { input_tokens: 10, output_tokens: 20 } },
      { content: [{ type: "text", text: "<!doctype html><html><body><button>Start</button><script>parent.postMessage({type:'evaluation_ready'},'*');parent.postMessage({type:'evaluation_attempt'},'*');parent.postMessage({type:'evaluation_complete'},'*');</script></body></html>" }], usage: { input_tokens: 10, output_tokens: 20 } },
    ];
    const client = { messages: { create: async (request: { model: string; messages: Array<{ content: string }> }) => {
      calls.push({ model: request.model, prompt: request.messages[0]!.content });
      if (calls.length === 2) {
        const contractHash = request.messages[0]!.content.match(/CONTRACT HASH: ([a-f0-9]+)/)?.[1];
        return { content: [{ type: "tool_use", name: "create_math_discovery_design", input: { contractHash, design: { firstAction: "Tap what you notice", interaction: "Touch groups", recovery: "Continue honestly" }, backgroundSvg: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1365\" height=\"768\"><rect width=\"100%\" height=\"100%\" fill=\"navy\"/></svg>" } }], usage: { input_tokens: 10, output_tokens: 20 } };
      }
      return responses.shift()!;
    } } };

    const generated = await generateMathDiscoveryExperience({ rootDir, childId: "lab-child", homeworkId: "hw-1", assignmentText: "Four equal groups.", assignmentEvidenceIds: ["assignment:1"], factualChildContext: { age: 9 }, client: client as never });

    expect(calls).toHaveLength(3);
    expect(calls[0]?.prompt).not.toContain("world");
    expect(calls[1]?.prompt).toContain(generated.contract.artifact.contractHash);
    expect(fs.existsSync(path.join(rootDir, "public", generated.contract.artifact.htmlPath.replace(/^\/games\//, "games/")))).toBe(true);
    expect(generated.contract.items).toHaveLength(1);
  });

  it("projects preparing and ready nodes without erasing another domain", () => {
    const rootDir = root();
    const context = path.join(rootDir, "src/context/lab-child");
    fs.mkdirSync(path.join(context, "plans"), { recursive: true });
    fs.writeFileSync(path.join(context, "plans/active_session_plan.json"), JSON.stringify({ activeByDomain: { spelling: { planId: "spell" } } }));
    fs.writeFileSync(path.join(context, "learning_profile.json"), JSON.stringify({ childId: "lab-child" }));
    const plan = buildDiscoveryActiveSessionPlan({ childId: "lab-child", homeworkId: "hw-1", evaluation: contract, companion: { id: "elli", name: "Elli" } });
    plan.nodePlan = [{ ...plan.nodePlan[0]!, id: "N1" }, { ...plan.nodePlan[0]!, id: "N2" }];
    plan.adventureBoard!.nodes = [
      { id: "start", kind: "start", label: "Start", state: "completed" },
      { id: "N1", kind: "activity", label: "One", state: "locked", action: { type: "launch-activity", payloadId: "N1" } },
      { id: "N2", kind: "activity", label: "Two", state: "locked", action: { type: "launch-activity", payloadId: "N2" } },
    ];
    publishTargetedBoardProjection({ rootDir, childId: "lab-child", activeSessionPlan: plan, nodeStatuses: { N1: "ready", N2: "preparing" } });
    const saved = JSON.parse(fs.readFileSync(path.join(context, "plans/active_session_plan.json"), "utf8"));
    expect(saved.activeByDomain.spelling.planId).toBe("spell");
    expect(saved.activeByDomain.math.adventureBoard.nodes.find((node: { id: string }) => node.id === "N1").state).toBe("current");
    expect(saved.activeByDomain.math.adventureBoard.nodes.find((node: { id: string }) => node.id === "N2")).toMatchObject({ state: "preview", action: { type: "show-preparing-status" } });
  });
  it("publishes only one independent Discovery node before evidence exists", () => {
    const rootDir = root();
    const cycle = createDiscoveryLearningCycle({
      rootDir,
      childId: "lab-child",
      homeworkId: "hw-equal-groups",
      assignment: {
        title: "Equal groups",
        contentFingerprint: "fingerprint",
        capturedEvidenceIds: ["assignment:equal-groups"],
        targets: ["math.multiplication.equal_groups"],
      },
      evaluation: contract,
    });

    expect(cycle.lifecycle).toBe("evaluation_ready");
    expect(cycle.nodes).toHaveLength(1);
    expect(cycle.nodes[0]).toMatchObject({ role: "evaluation", state: "ready" });
    expect(cycle.nodes.some((node) => node.role === "quest" || node.role === "boss")).toBe(false);
  });

  it("projects Discovery without inventing targeted nodes, routes, Quest, or Boss", () => {
    const plan = buildDiscoveryActiveSessionPlan({ childId: "lab-child", homeworkId: "hw-equal-groups", evaluation: contract, companion: { id: "elli", name: "Elli" } });
    expect(plan.nodePlan).toHaveLength(1);
    expect(plan.adventureBoard?.nodes.map((node) => node.id)).toEqual(["start", contract.evaluationId]);
    expect(plan.adventureBoard?.choiceSets).toBeUndefined();
    expect(plan.learningRoutes).toEqual([]);
    expect(plan.adventureBoard?.nodes.some((node) => node.kind === "quest" || node.kind === "boss" || node.kind === "choice-gate")).toBe(false);
  });

  it("keeps conceptual, assisted, ambiguity, and interface evidence distinct", () => {
    const rootDir = root();
    createDiscoveryLearningCycle({
      rootDir,
      childId: "lab-child",
      homeworkId: "hw-equal-groups",
      assignment: { title: "Equal groups", contentFingerprint: "fingerprint", capturedEvidenceIds: ["assignment:equal-groups"], targets: ["math.multiplication.equal_groups"] },
      evaluation: contract,
    });

    recordDiscoveryAttempt({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", attempt: {
      attemptId: "attempt-1", itemId: "probe-1", constructId: "math.multiplication.equal_groups",
      result: "incorrect", assistance: "unassisted", exposure: "unseen", responseMode: "tap",
      attemptedValue: "3", possibleConfounds: [], observedAt: "2026-08-22T12:00:00.000Z",
    } });
    const cycle = recordDiscoveryAttempt({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", attempt: {
      attemptId: "attempt-2", itemId: "probe-1", constructId: "math.multiplication.equal_groups",
      result: "instrument_ambiguous", assistance: "assisted", exposure: "previously_practiced", responseMode: "tap",
      attemptedValue: "4", possibleConfounds: ["interface_friction"], observedAt: "2026-08-22T12:01:00.000Z",
    } });

    expect(cycle.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ observationId: "attempt-1", result: expect.objectContaining({ correct: false }), assistance: { status: "unassisted", scaffolds: [] }, provenance: "independent_probe" }),
      expect.objectContaining({ observationId: "attempt-2", result: expect.objectContaining({ observedErrorType: "instrument_ambiguous" }), assistance: { status: "assisted", scaffolds: ["discovery_support"] }, confounds: expect.arrayContaining(["interface_friction", "instrument_ambiguous"]) }),
    ]));
  });

  it("reveals arbitrary targeted programs as preparing and binds siblings independently", () => {
    const rootDir = root();
    createDiscoveryLearningCycle({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", assignment: { title: "Equal groups", contentFingerprint: "fingerprint", capturedEvidenceIds: ["assignment:equal-groups"], targets: ["math.multiplication.equal_groups"] }, evaluation: contract });
    recordDiscoveryAttempt({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", attempt: {
      attemptId: "attempt-before-board", itemId: "probe-1", constructId: "math.multiplication.equal_groups",
      result: "correct", assistance: "unassisted", exposure: "unseen", responseMode: "tap",
      attemptedValue: "4", possibleConfounds: [], observedAt: "2026-08-22T12:01:00.000Z",
    } });
    completeDiscoveryEvaluation({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", completedAt: "2026-08-22T12:02:00.000Z" });
    const revealed = revealTargetedBoard({
      rootDir,
      childId: "lab-child",
      homeworkId: "hw-equal-groups",
      programHash: "program-hash",
      designHash: "design-hash",
      nodes: Array.from({ length: 7 }, (_, index) => ({
        nodeId: `N${index + 1}`,
        title: `Node ${index + 1}`,
        academicTarget: `target-${index + 1}`,
        algorithmOwner: "planner",
        theoryId: "theory-targeted",
        experimentId: `experiment-${index + 1}`,
        mechanic: `mechanic-${index + 1}`,
        theme: `theme-${index + 1}`,
      })),
    });

    expect(revealed.lifecycle).toBe("board_generating");
    expect(revealed.nodes.filter((node) => node.role === "baseline")).toHaveLength(7);
    expect(revealed.nodes.filter((node) => node.role === "baseline").every((node) => node.state === "generating")).toBe(true);
  });

  it("persists per-node generation status and resumes without changing ready hashes", () => {
    const rootDir = root();
    writeMathGenerationJob({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", programHash: "program", designHash: "design", nodeIds: ["N1", "N2"] });
    updateMathGenerationNode({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", nodeId: "N1", status: "ready", artifactHash: "html-hash-1" });
    updateMathGenerationNode({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", nodeId: "N2", status: "failed_resumable", error: "provider timeout" });

    const first = getMathGenerationStatus("lab-child", "hw-equal-groups", { rootDir });
    const resumed = writeMathGenerationJob({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", programHash: "program", designHash: "design", nodeIds: ["N1", "N2"] });

    expect(first?.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: "N1", status: "ready", artifactHash: "html-hash-1" }),
      expect.objectContaining({ nodeId: "N2", status: "failed_resumable" }),
    ]));
    expect(resumed.nodes.find((node) => node.nodeId === "N1")?.artifactHash).toBe("html-hash-1");
    expect(resumed.nodes.find((node) => node.nodeId === "N2")?.status).toBe("preparing");
  });

  it("builds the first intervention first and preserves ready siblings when another fails", async () => {
    const rootDir = root();
    writeMathGenerationJob({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", programHash: "program", designHash: "design", nodeIds: ["N1", "N2", "N3"] });
    updateMathGenerationNode({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", nodeId: "N2", status: "ready", artifactHash: "saved-N2" });
    const calls: string[] = [];

    await buildTargetedNodesResumably({
      rootDir,
      childId: "lab-child",
      homeworkId: "hw-equal-groups",
      firstNodeId: "N1",
      concurrency: 2,
      buildNode: async (nodeId) => {
        calls.push(nodeId);
        if (nodeId === "N3") throw new Error("provider_timeout");
        return { artifactHash: `built-${nodeId}` };
      },
    });

    expect(calls).toEqual(["N1", "N3"]);
    expect(getMathGenerationStatus("lab-child", "hw-equal-groups", { rootDir })?.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: "N1", status: "ready", artifactHash: "built-N1" }),
      expect.objectContaining({ nodeId: "N2", status: "ready", artifactHash: "saved-N2" }),
      expect.objectContaining({ nodeId: "N3", status: "failed_resumable", error: "provider_timeout" }),
    ]));
  });

  it("hands committed Discovery evidence to planning before design and map publication", async () => {
    const rootDir = root();
    createDiscoveryLearningCycle({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", assignment: { title: "Equal groups", contentFingerprint: "fingerprint", capturedEvidenceIds: ["assignment:equal-groups"], targets: ["math.multiplication.equal_groups"] }, evaluation: contract });
    recordDiscoveryAttempt({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", attempt: { attemptId: "gap", itemId: "probe-1", constructId: "math.multiplication.equal_groups", result: "incorrect", assistance: "unassisted", exposure: "unseen", responseMode: "tap", possibleConfounds: [], observedAt: "2026-08-22T12:00:00.000Z" } });
    completeDiscoveryEvaluation({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", completedAt: "2026-08-22T12:01:00.000Z" });
    const order: string[] = [];

    const result = await runAdaptiveTargetedGeneration({
      rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", concurrency: 2,
      plan: async (cycle) => {
        order.push("plan");
        expect(cycle.observations).toEqual([expect.objectContaining({ observationId: "gap" })]);
        return { programHash: "program", nodes: [{ nodeId: "support", title: "Build Equal Groups", academicTarget: "equal_groups", algorithmOwner: "planner", theoryId: "t", experimentId: "e", mechanic: "model", theme: "world" }] };
      },
      design: async (program) => { order.push("design"); expect(program.programHash).toBe("program"); return { designHash: "design" }; },
      publishPreparingBoard: async () => { order.push("publish"); },
      buildNode: async (nodeId) => { order.push(`build:${nodeId}`); return { artifactHash: `hash:${nodeId}` }; },
      publishReadyNode: async (nodeId) => { order.push(`ready:${nodeId}`); },
    });

    expect(order).toEqual(["plan", "design", "publish", "build:support", "ready:support"]);
    expect(result.phase).toBe("board_ready");
  });
});
