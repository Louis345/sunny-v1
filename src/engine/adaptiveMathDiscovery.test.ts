import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getLearningCycle, projectLearningCycle, transitionLearningCycle } from "./learningCycleRepository";
import {
  buildTargetedNodesResumably,
  buildDiscoveryRepairMessageContent,
  buildDiscoveryRepairDiagnostic,
  acquireMathGenerationLease,
  buildDiscoveryActiveSessionPlan,
  runAdaptiveTargetedGeneration,
  completeDiscoveryEvaluation,
  createDiscoveryLearningCycle,
  ensureDiscoveryArtifactsAreServed,
  getMathGenerationStatus,
  recordDiscoveryAttempt,
  releaseMathGenerationLease,
  publishDiscoveryExperience,
  publishTargetedBoardProjection,
  generateMathDiscoveryExperience,
  validateDiscoveryAcademicBinding,
  verifyDiscoveryRuntimeScoring,
  revealTargetedBoard,
  updateMathGenerationNode,
  writeMathGenerationJob,
  type MathDiscoveryAttempt,
  type MathDiscoveryEvaluationContract,
} from "./adaptiveMathDiscovery";

function root(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-discovery-"));
}

function generatedDiscoveryHtml(): string {
  const runtimeContract = JSON.stringify({
    items: [{ itemId: "i1", constructId: "math.equal_groups", acceptedValues: ["4"] }],
  });
  return `<!doctype html><html><body><button>Start</button>
    <script id="sunny-discovery-contract" type="application/json">${runtimeContract}</script>
    <script>
      window.__SUNNY_DISCOVERY_TEST__ = { evaluate(itemId, attemptedValue) { return { itemId, constructId: "math.equal_groups", correct: attemptedValue === "4" }; } };
      parent.postMessage({type:'evaluation_ready'},'*');
      parent.postMessage({type:'evaluation_attempt'},'*');
      parent.postMessage({type:'evaluation_complete'},'*');
    </script></body></html>`;
}

function writeFrozenDiscoveryContract(rootDir: string, homeworkId = "hw-equal-groups"): void {
  const file = path.join(
    rootDir,
    "src/context/lab-child/homework/direct-drafts",
    homeworkId,
    "discovery-contract.json",
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
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
    responseContract: { mode: "tap_selection", representationId: "equal_groups" },
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
  it("requires a structured runtime contract instead of accepting academic strings in comments", () => {
    const academic = {
      ...contract,
      artifact: undefined,
    };
    expect(() => validateDiscoveryAcademicBinding(
      "<!-- probe-1 math.multiplication.equal_groups accepted answer 4 -->",
      academic,
    )).toThrow("discovery_runtime_contract_missing");
    expect(() => validateDiscoveryAcademicBinding(
      `<script id="sunny-discovery-contract" type="application/json">${JSON.stringify({
        items: [{
          itemId: "probe-1",
          constructId: "math.multiplication.equal_groups",
          acceptedValues: ["4"],
        }],
      })}</script>`,
      academic,
    )).not.toThrow();
  });

  it("uses Playwright to reject a runtime whose scorer changed a frozen accepted answer", async () => {
    const academic = { ...contract, artifact: undefined };
    const runtimeContract = JSON.stringify({
      items: [{
        itemId: "probe-1",
        constructId: "math.multiplication.equal_groups",
        acceptedValues: ["4"],
      }],
    });
    const html = `<!doctype html><html><body>
      <script id="sunny-discovery-contract" type="application/json">${runtimeContract}</script>
      <script>
        window.__SUNNY_DISCOVERY_TEST__ = {
          evaluate(itemId, attemptedValue) {
            return { itemId, constructId: "math.multiplication.equal_groups", correct: attemptedValue === "5" };
          }
        };
      </script>
    </body></html>`;

    await expect(verifyDiscoveryRuntimeScoring({
      html,
      academic,
      outputDir: root(),
    })).rejects.toThrow("discovery_runtime_scoring_mismatch:probe-1:4");
  });

  it("uses Playwright to reject a scorer that accepts a guaranteed-wrong sentinel", async () => {
    const academic = { ...contract, artifact: undefined };
    const runtimeContract = JSON.stringify({
      items: [{
        itemId: "probe-1",
        constructId: "math.multiplication.equal_groups",
        acceptedValues: ["4"],
      }],
    });
    const html = `<!doctype html><html><body>
      <script id="sunny-discovery-contract" type="application/json">${runtimeContract}</script>
      <script>
        window.__SUNNY_DISCOVERY_TEST__ = {
          evaluate(itemId) {
            return { itemId, constructId: "math.multiplication.equal_groups", correct: true };
          }
        };
      </script>
    </body></html>`;

    await expect(verifyDiscoveryRuntimeScoring({
      html,
      academic,
      outputDir: root(),
    })).rejects.toThrow("discovery_runtime_reject_mismatch:probe-1");
  });

  it("gives the repair Creator both rendered viewports as image evidence", () => {
    const outputDir = root();
    const first = path.join(outputDir, "1365.png");
    const second = path.join(outputDir, "1280.png");
    fs.writeFileSync(first, "first-screen");
    fs.writeFileSync(second, "second-screen");

    const content = buildDiscoveryRepairMessageContent([first, second], "repair only the clipped control");

    expect(content).toHaveLength(3);
    expect(content.slice(0, 2)).toEqual([
      expect.objectContaining({ type: "image", source: expect.objectContaining({ media_type: "image/png", data: expect.any(String) }) }),
      expect.objectContaining({ type: "image", source: expect.objectContaining({ media_type: "image/png", data: expect.any(String) }) }),
    ]);
    expect(content[2]).toEqual({ type: "text", text: "repair only the clipped control" });
  });

  it("records the repair cost and latency evidence needed to measure the safety net", () => {
    expect(buildDiscoveryRepairDiagnostic({
      response: { stop_reason: "end_turn", usage: { input_tokens: 1200, output_tokens: 3400 } },
      textCharacters: 9000,
      screenshotPaths: ["generation.png", "sunny.png"],
      issues: ["sunny:required_action_clipped:Skip"],
      startedAt: 1_000,
      finishedAt: 3_750,
    })).toEqual({
      stopReason: "end_turn",
      usage: { input_tokens: 1200, output_tokens: 3400 },
      textCharacters: 9000,
      screenshotCount: 2,
      screenshotPaths: ["generation.png", "sunny.png"],
      issues: ["sunny:required_action_clipped:Skip"],
      latencyMs: 2750,
    });
  });

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
    let nonStreamingCalls = 0;
    const responses = [
      { content: [{ type: "tool_use", name: "create_math_discovery_contract", input: { evaluationId: "eval-1", title: "Show What You Know", assignmentEvidenceIds: ["assignment:1"], constructs: [{ constructId: "math.equal_groups", prerequisiteIds: [] }], items: [{ itemId: "i1", constructId: "math.equal_groups", prompt: "How many groups?", responseContract: { mode: "tap_selection", representationId: "equal_groups" }, correctAnswerContract: { acceptedValues: ["4"] }, difficultyBoundary: "grade 3", exposureId: "eval-1:i1", possibleConfounds: ["interface_friction"], falsifyingEvidence: ["response is not independent"], measurementKeys: ["independent_correct"] }] } }], usage: { input_tokens: 10, output_tokens: 20 } },
      { content: [{ type: "text", text: generatedDiscoveryHtml() }], usage: { input_tokens: 10, output_tokens: 20 } },
    ];
    const client = { messages: {
      create: async () => {
        nonStreamingCalls += 1;
        throw new Error("non-streaming Discovery calls are forbidden");
      },
      stream: (request: { model: string; messages: Array<{ content: string }> }) => ({
        finalMessage: async () => {
          calls.push({ model: request.model, prompt: request.messages[0]!.content });
          if (calls.length === 2) {
            const contractHash = request.messages[0]!.content.match(/CONTRACT HASH: ([a-f0-9]+)/)?.[1];
            return { content: [{ type: "tool_use", name: "create_math_discovery_design", input: { contractHash, design: { firstAction: "Tap what you notice", interaction: "Touch groups", recovery: "Continue honestly" }, backgroundSvg: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1365\" height=\"768\"><rect width=\"100%\" height=\"100%\" fill=\"navy\"/></svg>" } }], usage: { input_tokens: 10, output_tokens: 20 } };
          }
          return responses.shift()!;
        },
      }),
    } };

    const generated = await generateMathDiscoveryExperience({ rootDir, childId: "lab-child", homeworkId: "hw-1", assignmentText: "Four equal groups.", assignmentEvidenceIds: ["assignment:1"], factualChildContext: { age: 9 }, client: client as never, visualReview: async ({ html }) => html });

    expect(calls).toHaveLength(3);
    expect(nonStreamingCalls).toBe(0);
    expect(calls[2]?.model).toBe(process.env.SUNNY_GENERATION_MODEL ?? process.env.SUNNY_INGEST_MODEL ?? "claude-sonnet-5");
    expect(calls[0]?.prompt).not.toContain("world");
    expect(calls[1]?.prompt).toContain(generated.contract.artifact.contractHash);
    expect(calls[2]?.prompt).toContain("1365x768 and 1280x720");
    expect(calls[2]?.prompt).toContain("fully visible without scrolling");
    expect(calls[2]?.prompt).toContain("mathematical representation large and legible");
    expect(generated.contract.artifact.htmlPath).toBe("/api/homework/game/lab-child/hw-1/discovery.html");
    expect(generated.contract.artifact.artworkPath).toBe("/api/homework/game/lab-child/hw-1/discovery-background.svg");
    expect(fs.existsSync(path.join(rootDir, "src/context/lab-child/homework/games/hw-1/discovery.html"))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, "src/context/lab-child/homework/games/hw-1/discovery-background.svg"))).toBe(true);
    expect(generated.contract.items).toHaveLength(1);
  });

  it("migrates legacy Discovery files into the server-backed cycle directory without generation", () => {
    const rootDir = root();
    const legacyHtml = path.join(rootDir, "public/games/hw-legacy/discovery.html");
    const legacyArtwork = path.join(rootDir, "public/generated/hw-legacy/discovery-background.svg");
    fs.mkdirSync(path.dirname(legacyHtml), { recursive: true });
    fs.mkdirSync(path.dirname(legacyArtwork), { recursive: true });
    fs.writeFileSync(legacyHtml, "<!doctype html><html></html>");
    fs.writeFileSync(legacyArtwork, "<svg></svg>");

    const migrated = ensureDiscoveryArtifactsAreServed({ rootDir, childId: "lab-child", homeworkId: "hw-legacy", contract: { ...contract, artifact: { ...contract.artifact, htmlPath: "/games/hw-legacy/discovery.html", artworkPath: "/generated/hw-legacy/discovery-background.svg" } } });

    expect(migrated.artifact.htmlPath).toBe("/api/homework/game/lab-child/hw-legacy/discovery.html");
    expect(migrated.artifact.artworkPath).toBe("/api/homework/game/lab-child/hw-legacy/discovery-background.svg");
    expect(fs.existsSync(path.join(rootDir, "src/context/lab-child/homework/games/hw-legacy/discovery.html"))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, "src/context/lab-child/homework/games/hw-legacy/discovery-background.svg"))).toBe(true);
  });

  it("checkpoints completed Discovery phases and resumes only the missing builder", async () => {
    const rootDir = root();
    const draftDir = path.join(rootDir, "src/context/lab-child/homework/direct-drafts/hw-resume");
    let firstRunCalls = 0;
    const academic = { evaluationId: "eval-resume", title: "Show What You Know", assignmentEvidenceIds: ["assignment:resume"], constructs: [{ constructId: "math.equal_groups", prerequisiteIds: [] }], items: [{ itemId: "i1", constructId: "math.equal_groups", prompt: "How many groups?", responseContract: { mode: "tap_selection", representationId: "equal_groups" }, correctAnswerContract: { acceptedValues: ["4"] }, difficultyBoundary: "grade 3", exposureId: "eval-resume:i1", possibleConfounds: ["interface_friction"], falsifyingEvidence: ["response is not independent"], measurementKeys: ["independent_correct"] }] };
    const firstClient = { messages: { stream: (request: { messages: Array<{ content: string }> }) => ({ finalMessage: async () => {
      firstRunCalls += 1;
      if (firstRunCalls === 1) return { content: [{ type: "tool_use", name: "create_math_discovery_contract", input: academic }] };
      if (firstRunCalls === 2) {
        const contractHash = request.messages[0]!.content.match(/CONTRACT HASH: ([a-f0-9]+)/)?.[1];
        return { content: [{ type: "tool_use", name: "create_math_discovery_design", input: { contractHash, design: { firstAction: "Tap a group" }, backgroundSvg: "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>" } }] };
      }
      throw new Error("builder connection lost");
    } }) } };

    await expect(generateMathDiscoveryExperience({ rootDir, childId: "lab-child", homeworkId: "hw-resume", assignmentText: "Four equal groups.", assignmentEvidenceIds: ["assignment:resume"], factualChildContext: { age: 9 }, client: firstClient as never, visualReview: async ({ html }) => html })).rejects.toThrow("builder connection lost");
    expect(fs.existsSync(path.join(draftDir, "discovery-academic.json"))).toBe(true);
    expect(fs.existsSync(path.join(draftDir, "discovery-design.json"))).toBe(true);

    let resumedCalls = 0;
    const resumedClient = { messages: { stream: () => ({ finalMessage: async () => {
      resumedCalls += 1;
      return { content: [{ type: "text", text: generatedDiscoveryHtml() }] };
    } }) } };
    await generateMathDiscoveryExperience({ rootDir, childId: "lab-child", homeworkId: "hw-resume", assignmentText: "Four equal groups.", assignmentEvidenceIds: ["assignment:resume"], factualChildContext: { age: 9 }, client: resumedClient as never, visualReview: async ({ html }) => html });
    expect(resumedCalls).toBe(1);
  });

  it("does not reuse Discovery HTML when its builder prompt checkpoint is missing", async () => {
    const rootDir = root();
    const homeworkId = "hw-builder-prompt-version";
    const draftDir = path.join(rootDir, "src/context/lab-child/homework/direct-drafts", homeworkId);
    const academic = { evaluationId: "eval-version", title: "Show What You Know", assignmentEvidenceIds: ["assignment:version"], constructs: [{ constructId: "math.equal_groups", prerequisiteIds: [] }], items: [{ itemId: "i1", constructId: "math.equal_groups", prompt: "How many groups?", responseContract: { mode: "tap_selection", representationId: "equal_groups" }, correctAnswerContract: { acceptedValues: ["4"] }, difficultyBoundary: "grade 3", exposureId: "eval-version:i1", possibleConfounds: [], falsifyingEvidence: [], measurementKeys: ["independent_correct"] }] };
    let calls = 0;
    const client = { messages: { stream: (request: { messages: Array<{ content: string }> }) => ({ finalMessage: async () => {
      calls += 1;
      if (calls === 1) return { content: [{ type: "tool_use", name: "create_math_discovery_contract", input: academic }] };
      if (calls === 2) {
        const contractHash = request.messages[0]!.content.match(/CONTRACT HASH: ([a-f0-9]+)/)?.[1];
        return { content: [{ type: "tool_use", name: "create_math_discovery_design", input: { contractHash, design: { firstAction: "Tap" }, backgroundSvg: "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>" } }] };
      }
      return { content: [{ type: "text", text: generatedDiscoveryHtml() }] };
    } }) } };
    await generateMathDiscoveryExperience({ rootDir, childId: "lab-child", homeworkId, assignmentText: "Four equal groups.", assignmentEvidenceIds: ["assignment:version"], factualChildContext: { age: 9 }, client: client as never, visualReview: async ({ html }) => html });
    expect(JSON.parse(fs.readFileSync(path.join(draftDir, "discovery-design.json"), "utf8"))).not.toHaveProperty("designHash");
    let unchangedCalls = 0;
    const unchangedClient = { messages: { stream: () => ({ finalMessage: async () => {
      unchangedCalls += 1;
      throw new Error("completed checkpoint should have been reused");
    } }) } };
    await generateMathDiscoveryExperience({ rootDir, childId: "lab-child", homeworkId, assignmentText: "Four equal groups.", assignmentEvidenceIds: ["assignment:version"], factualChildContext: { age: 9 }, client: unchangedClient as never, visualReview: async ({ html }) => html });
    expect(unchangedCalls).toBe(0);
    const checkpointFile = path.join(draftDir, "discovery-builder.json");
    const checkpoint = JSON.parse(fs.readFileSync(checkpointFile, "utf8"));
    delete checkpoint.builderPromptHash;
    fs.writeFileSync(checkpointFile, JSON.stringify(checkpoint));
    fs.rmSync(path.join(draftDir, "discovery-reviewed.json"), { force: true });

    let resumedCalls = 0;
    const resumedClient = { messages: { stream: () => ({ finalMessage: async () => {
      resumedCalls += 1;
      return { content: [{ type: "text", text: generatedDiscoveryHtml() }] };
    } }) } };
    await generateMathDiscoveryExperience({ rootDir, childId: "lab-child", homeworkId, assignmentText: "Four equal groups.", assignmentEvidenceIds: ["assignment:version"], factualChildContext: { age: 9 }, client: resumedClient as never, visualReview: async ({ html }) => html });

    expect(resumedCalls).toBe(1);
  });

  it("persists the raw builder outcome and reports truncation before parsing HTML", async () => {
    const rootDir = root();
    const homeworkId = "hw-builder-diagnostic";
    const draftDir = path.join(rootDir, "src/context/lab-child/homework/direct-drafts", homeworkId);
    fs.mkdirSync(draftDir, { recursive: true });
    fs.writeFileSync(path.join(draftDir, "discovery-academic.json"), JSON.stringify({ evaluationId: "eval-diagnostic", title: "Show What You Know", assignmentEvidenceIds: ["assignment:diagnostic"], constructs: [{ constructId: "math.equal_groups", prerequisiteIds: [] }], items: [{ itemId: "i1", constructId: "math.equal_groups", prompt: "How many groups?", responseContract: { mode: "tap_selection", representationId: "equal_groups" }, correctAnswerContract: { acceptedValues: ["4"] }, difficultyBoundary: "grade 3", exposureId: "eval-diagnostic:i1", possibleConfounds: [], falsifyingEvidence: [], measurementKeys: ["independent_correct"] }] }));
    const academic = JSON.parse(fs.readFileSync(path.join(draftDir, "discovery-academic.json"), "utf8"));
    const contractHash = createHash("sha256").update(JSON.stringify(academic)).digest("hex");
    fs.writeFileSync(path.join(draftDir, "discovery-design.json"), JSON.stringify({ contractHash, design: { firstAction: "Tap" }, backgroundSvg: "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>" }));
    const client = { messages: { stream: () => ({ finalMessage: async () => ({ stop_reason: "max_tokens", usage: { input_tokens: 100, output_tokens: 48_000 }, content: [{ type: "thinking", thinking: "unfinished" }] }) }) } };

    await expect(generateMathDiscoveryExperience({ rootDir, childId: "lab-child", homeworkId, assignmentText: "Four equal groups.", assignmentEvidenceIds: ["assignment:diagnostic"], factualChildContext: { age: 9 }, client: client as never })).rejects.toThrow("discovery_builder_truncated:stop=max_tokens");
    expect(fs.existsSync(path.join(draftDir, "provider-diagnostics", "discovery-builder-response.json"))).toBe(true);
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
    expect(cycle.academicPredictions).toEqual([]);
    expect(cycle.nodes.some((node) => node.role === "quest" || node.role === "boss")).toBe(false);
  });

  it("projects Discovery without inventing targeted nodes, routes, Quest, or Boss", () => {
    const plan = buildDiscoveryActiveSessionPlan({ childId: "lab-child", homeworkId: "hw-equal-groups", evaluation: contract, companion: { id: "elli", name: "Elli" } });
    expect(plan.nodePlan).toHaveLength(1);
    expect(plan.adventureBoard?.nodes.map((node) => node.id)).toEqual(["start", contract.evaluationId]);
    expect(plan.adventureBoard?.choiceSets).toBeUndefined();
    expect(plan.learningRoutes).toEqual([]);
    expect(plan.companionPolicy.openingLinePolicy).toBe("silent");
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
    writeFrozenDiscoveryContract(rootDir);

    recordDiscoveryAttempt({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", attempt: {
      attemptId: "attempt-1", itemId: "probe-1", attemptedValue: "3",
      supportEventIds: [], instrumentSignals: [], observedAt: "2026-08-22T12:00:00.000Z",
    } });
    const cycle = recordDiscoveryAttempt({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", attempt: {
      attemptId: "attempt-2", itemId: "probe-1", attemptedValue: "4",
      supportEventIds: ["support:elli:1"], instrumentSignals: ["interface_friction"], observedAt: "2026-08-22T12:01:00.000Z",
    } });

    expect(cycle.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ observationId: "attempt-1", result: expect.objectContaining({ correct: false }), assistance: { status: "unassisted", scaffolds: [] }, provenance: "independent_probe" }),
      expect.objectContaining({ observationId: "attempt-2", result: expect.objectContaining({ observedErrorType: "instrument_ambiguous" }), assistance: { status: "assisted", scaffolds: ["support:elli:1"] }, confounds: expect.arrayContaining(["interface_friction", "instrument_ambiguous"]) }),
    ]));
  });

  it("rejects item and construct identities that are not in the frozen Discovery contract", () => {
    const rootDir = root();
    createDiscoveryLearningCycle({
      rootDir,
      childId: "lab-child",
      homeworkId: "hw-equal-groups",
      assignment: { title: "Equal groups", contentFingerprint: "fingerprint", capturedEvidenceIds: ["assignment:equal-groups"], targets: ["math.multiplication.equal_groups"] },
      evaluation: contract,
    });
    writeFrozenDiscoveryContract(rootDir);

    const baseAttempt: MathDiscoveryAttempt = {
      attemptId: "attempt-invalid",
      itemId: "probe-1",
      attemptedValue: "3",
      supportEventIds: [],
      instrumentSignals: [],
      observedAt: "2026-08-22T12:00:00.000Z",
    };
    expect(() => recordDiscoveryAttempt({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", attempt: { ...baseAttempt, itemId: "unknown-item" } }))
      .toThrow("discovery_attempt_item_not_in_frozen_contract:unknown-item");
  });

  it("records a failed response capture as instrument ambiguity instead of child incorrect", () => {
    const rootDir = root();
    createDiscoveryLearningCycle({
      rootDir,
      childId: "lab-child",
      homeworkId: "hw-equal-groups",
      assignment: { title: "Equal groups", contentFingerprint: "fingerprint", capturedEvidenceIds: ["assignment:equal-groups"], targets: ["math.multiplication.equal_groups"] },
      evaluation: contract,
    });
    writeFrozenDiscoveryContract(rootDir);

    const cycle = recordDiscoveryAttempt({
      rootDir,
      childId: "lab-child",
      homeworkId: "hw-equal-groups",
      attempt: {
        attemptId: "attempt-malformed-result",
        itemId: "probe-1",
        attemptedValue: "",
        supportEventIds: [],
        instrumentSignals: ["response_not_captured"],
        observedAt: "2026-08-22T12:00:00.000Z",
      },
    });

    expect(cycle.observations[0]).toMatchObject({
      result: { observedErrorType: "instrument_ambiguous" },
      provenance: "practice",
      confounds: expect.arrayContaining(["instrument_ambiguous", "response_not_captured"]),
    });
    expect(cycle.evidence.academic[0]?.accuracy).toBeUndefined();
  });

  it("reveals arbitrary targeted programs as preparing and binds siblings independently", () => {
    const rootDir = root();
    createDiscoveryLearningCycle({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", assignment: { title: "Equal groups", contentFingerprint: "fingerprint", capturedEvidenceIds: ["assignment:equal-groups"], targets: ["math.multiplication.equal_groups"] }, evaluation: contract });
    writeFrozenDiscoveryContract(rootDir);
    recordDiscoveryAttempt({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", attempt: {
      attemptId: "attempt-before-board", itemId: "probe-1", attemptedValue: "4",
      supportEventIds: [], instrumentSignals: [], observedAt: "2026-08-22T12:01:00.000Z",
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

  it("preserves completed Discovery, Planner truth, artifacts, and board_ready during final reconciliation", () => {
    const rootDir = root();
    createDiscoveryLearningCycle({
      rootDir,
      childId: "lab-child",
      homeworkId: "hw-equal-groups",
      assignment: { title: "Equal groups", contentFingerprint: "fingerprint", capturedEvidenceIds: ["assignment:equal-groups"], targets: ["math.multiplication.equal_groups"] },
      evaluation: contract,
    });
    writeFrozenDiscoveryContract(rootDir);
    recordDiscoveryAttempt({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", attempt: {
      attemptId: "discovery-observation", itemId: "probe-1", attemptedValue: "4",
      supportEventIds: [], instrumentSignals: [], observedAt: "2026-08-22T12:00:00.000Z",
    } });
    completeDiscoveryEvaluation({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", completedAt: "2026-08-22T12:01:00.000Z" });
    const plannerPrediction = {
      predictionId: "planner-prediction",
      theoryId: "targeted-theory",
      constructId: "math.multiplication.equal_groups",
      context: "targeted board",
      horizon: "current session",
      expectedMetric: { key: "independent_accuracy", min: 0.6, max: 1 },
      predictedErrorPatterns: [],
      confidence: 0.72,
      evidenceIds: ["discovery-observation"],
      intervention: "targeted activity",
      evidenceLimit: "independent_performance" as const,
      createdAt: "2026-08-22T12:02:00.000Z",
    };
    let cycle = revealTargetedBoard({
      rootDir,
      childId: "lab-child",
      homeworkId: "hw-equal-groups",
      programHash: "program",
      designHash: "design",
      nodes: [{ nodeId: "N1", title: "Targeted One", academicTarget: "math.multiplication.equal_groups", algorithmOwner: "planner", theoryId: "targeted-theory", experimentId: "experiment", mechanic: "tap", theme: "world" }],
      academicTheory: { theoryId: "targeted-theory", revision: 1, hypothesis: "Planner hypothesis", supportCriteria: ["support"], reviseCriteria: ["revise"], falsifyCriteria: ["falsify"] },
      academicPredictions: [plannerPrediction],
    });
    expect(projectLearningCycle(cycle).adventureBoard.nodes.find((node) => node.id === "N1")).toMatchObject({
      state: "preview",
      action: { type: "show-preparing-status", payloadId: "N1" },
      lock: { label: "Preparing" },
    });
    cycle = transitionLearningCycle("lab-child", "hw-equal-groups", cycle.revision, {
      type: "artifact_bound",
      nodeId: "N1",
      artifact: {
        contentId: "content-N1",
        artifactId: "artifact-N1",
        localArtifactPath: "/api/homework/game/lab-child/hw-equal-groups/N1.html",
        localArtworkPath: "/api/homework/game/lab-child/hw-equal-groups/N1.png",
        contractFingerprint: "contract",
        validationStatus: "passed",
        creativeProvenance: { rationale: "r", qualityPrediction: "q", creatorPromptHash: "p", artworkPromptHash: "a", generatedHtmlHash: "h" },
      },
    }, { rootDir });
    expect(cycle.lifecycle).toBe("board_ready");
    expect(projectLearningCycle(cycle).adventureBoard.nodes.find((node) => node.id === "N1")).toMatchObject({
      state: "current",
      action: { type: "launch-activity" },
    });

    const reconciled = transitionLearningCycle("lab-child", "hw-equal-groups", cycle.revision, {
      type: "plan_reconciled",
      assignment: cycle.assignment,
      academicTheory: { ...cycle.academicTheory, hypothesis: "legacy overwrite" },
      engagementTheory: null,
      nodes: [structuredClone(cycle.nodes.find((node) => node.nodeId === "N1")!)],
      academicPredictions: [{ ...plannerPrediction, confidence: 0.1 }],
      reason: "Legacy compatibility persistence after adaptive publication.",
    }, { rootDir });

    expect(reconciled.lifecycle).toBe("board_ready");
    expect(reconciled.nodes.find((node) => node.role === "evaluation")).toMatchObject({ state: "completed", evidenceIds: ["discovery-observation"] });
    expect(reconciled.nodes.find((node) => node.nodeId === "N1")?.artifactBinding?.artifactId).toBe("artifact-N1");
    expect(reconciled.observations.map((observation) => observation.observationId)).toContain("discovery-observation");
    expect(reconciled.academicTheory.hypothesis).toBe("Planner hypothesis");
    expect(reconciled.academicPredictions).toEqual([plannerPrediction]);
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

  it("allows only one durable generation lease per assignment", () => {
    const rootDir = root();
    const first = acquireMathGenerationLease({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", ownerPid: 101 });
    const duplicate = acquireMathGenerationLease({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", ownerPid: 202 });
    expect(first).toMatchObject({ acquired: true });
    expect(duplicate).toMatchObject({ acquired: false, reason: "worker_already_running" });
    releaseMathGenerationLease({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", token: first.token! });
    expect(acquireMathGenerationLease({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", ownerPid: 303 })).toMatchObject({ acquired: true });
  });

  it("stops a failing node after two attempts and never calls its builder again", async () => {
    const rootDir = root();
    writeMathGenerationJob({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", programHash: "program", designHash: "design", nodeIds: ["N1"] });
    let calls = 0;
    const fail = async (): Promise<{ artifactHash: string }> => {
      calls += 1;
      throw new Error("builder failed");
    };

    await buildTargetedNodesResumably({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", firstNodeId: "N1", concurrency: 1, buildNode: fail });
    expect(getMathGenerationStatus("lab-child", "hw-equal-groups", { rootDir })?.nodes[0]).toMatchObject({ status: "failed_resumable", attemptCount: 1 });
    await buildTargetedNodesResumably({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", firstNodeId: "N1", concurrency: 1, buildNode: fail });
    expect(getMathGenerationStatus("lab-child", "hw-equal-groups", { rootDir })?.nodes[0]).toMatchObject({ status: "needs_attention", attemptCount: 2 });
    await buildTargetedNodesResumably({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", firstNodeId: "N1", concurrency: 1, buildNode: fail });
    expect(calls).toBe(2);
  });

  it("turns a twice-failed generated node into a canonical parent-help state", async () => {
    const rootDir = root();
    createDiscoveryLearningCycle({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", assignment: { title: "Equal groups", contentFingerprint: "fingerprint", capturedEvidenceIds: ["assignment:equal-groups"], targets: ["math.multiplication.equal_groups"] }, evaluation: contract });
    writeFrozenDiscoveryContract(rootDir);
    recordDiscoveryAttempt({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", attempt: { attemptId: "gap", itemId: "probe-1", attemptedValue: "3", supportEventIds: [], instrumentSignals: [], observedAt: "2026-08-22T12:00:00.000Z" } });
    completeDiscoveryEvaluation({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", completedAt: "2026-08-22T12:01:00.000Z" });
    revealTargetedBoard({
      rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", programHash: "program", designHash: "design",
      nodes: [{ nodeId: "N1", title: "Targeted practice", academicTarget: "math.multiplication.equal_groups", algorithmOwner: "error-pattern-remediation", theoryId: "theory", experimentId: "experiment", mechanic: "tap", theme: "generated" }],
    });
    writeMathGenerationJob({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", programHash: "program", designHash: "design", nodeIds: ["N1"] });
    const fail = async (): Promise<{ artifactHash: string }> => { throw new Error("builder failed"); };

    await buildTargetedNodesResumably({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", firstNodeId: "N1", concurrency: 1, buildNode: fail });
    await buildTargetedNodesResumably({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", firstNodeId: "N1", concurrency: 1, buildNode: fail });

    const cycle = getLearningCycle("lab-child", "hw-equal-groups", { rootDir })!;
    expect(cycle.lifecycle).toBe("board_ready");
    expect(cycle.nodes.find((node) => node.nodeId === "N1")?.state).toBe("blocked");
    expect(projectLearningCycle(cycle).adventureBoard.nodes.find((node) => node.id === "N1")).toMatchObject({
      state: "locked",
      action: { type: "show-locked-reason" },
      lock: { label: "Parent help needed" },
    });
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
    writeFrozenDiscoveryContract(rootDir);
    recordDiscoveryAttempt({ rootDir, childId: "lab-child", homeworkId: "hw-equal-groups", attempt: { attemptId: "gap", itemId: "probe-1", attemptedValue: "3", supportEventIds: [], instrumentSignals: [], observedAt: "2026-08-22T12:00:00.000Z" } });
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
