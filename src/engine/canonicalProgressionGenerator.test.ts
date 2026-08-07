import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import { createLearningCycle, transitionLearningCycle } from "./learningCycleRepository";
import { generateCanonicalProgressionArtifact } from "./canonicalProgressionGenerator";
import type { ExperienceDesignArtifactV1 } from "./directMathExperience";

function root(): string { return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-progression-")); }

function progressionDesign(nodeId: string, academicContractHash: string): ExperienceDesignArtifactV1 {
  return {
    artifactId: `${nodeId}-design-v1`,
    nodeId,
    academicContractHash,
    title: nodeId === "boss" ? "Boss" : "Quest",
    audienceRationale: "A clear challenge for the current child.",
    openingPromise: "Restore the world by using multiplication.",
    firstThreeSeconds: "The threatened world and first movable object are visible.",
    firstAction: "Drag equal groups into the damaged structure.",
    interactionDemonstration: "One group pulses toward an open slot.",
    coreInteraction: "Construct and test equal groups inside the world.",
    mathAsPower: "Correct multiplication repairs the structure.",
    stakes: "A rival advances when a structure is incorrect.",
    consequences: "Incorrect structures visibly crack and move the rival.",
    recovery: "The crack exposes the mismatched rows and groups.",
    progression: ["repair one structure", "coordinate several structures", "complete the finale"],
    interactionContinuity: "The same construction action deepens across the experience.",
    worldReaction: "Structures illuminate and the rival changes position.",
    payoff: "The completed world activates in a full-screen finale.",
    replayVariation: "New layouts require different equal groups.",
    visualDirection: "A vivid reactive world with large manipulable objects.",
    motionDirection: "Objects snap, crack, illuminate, and travel.",
    soundDirection: "Use Sunny semantic cues for action, recovery, progress, and completion.",
    usefulLibraries: [],
    engagementPrediction: "Visible consequences may sustain attention.",
    falsifyingEvidence: "The child abandons before the second structure.",
  };
}

function designExperience() {
  return async ({ node, academicContractHash }: { node: { nodeId: string }; academicContractHash: string }) =>
    progressionDesign(node.nodeId, academicContractHash);
}

function baseInput() {
  const contract = (id: string, role: "baseline" | "quest" | "boss", state: "ready" | "locked") => ({
    nodeId: id, role, title: role === "quest" ? "Quest" : role === "boss" ? "Boss" : "Fact Blaster", state,
    academicTarget: { domain: "math", skill: "multiplication", targets: ["2x5"] }, algorithmOwner: "retrieval-practice",
    theoryId: "theory", experimentId: `experiment-${id}`, mechanic: role === "baseline" ? "fact-retrieval" : "adaptive-challenge", theme: "space",
    openingScreen: { title: role === "quest" ? "Quest" : role === "boss" ? "Boss" : "Fact Blaster", purpose: "Practice multiplication" },
    generationPrompt: null, artifactBinding: role === "baseline" ? { contentId: "facts", artifactId: "facts", localArtifactPath: "/games/facts.html", localArtworkPath: "/generated/facts.png", contractFingerprint: "facts", validationStatus: "passed" as const } : null,
    artwork: { status: "ready" as const, localPath: role === "quest" ? "/generated/adventure-board-demo/quest.jpeg" : role === "boss" ? "/generated/adventure-board-demo/boss.jpeg" : "/generated/facts.png", prompt: null },
    sfxContract: ["tap", "correct", "incorrect", "progress", "complete"], companionContract: { events: ["session_complete"] },
    evidenceContract: { academic: true, engagement: true, companionObservations: true }, evidenceIds: [],
  });
  return { childId: "reina", homeworkId: "hw-progression", domain: "math", assignment: { title: "Multiplication", contentFingerprint: "fp", capturedEvidenceIds: ["pdf"], targets: ["2x5"] }, academicTheory: { theoryId: "theory", revision: 1, hypothesis: "Test transfer", supportCriteria: [".8"], reviseCriteria: ["below .8"], falsifyCriteria: ["below .5"] }, engagementTheory: null, nodes: [contract("facts", "baseline", "ready"), contract("quest", "quest", "locked"), contract("boss", "boss", "locked")] };
}

describe("canonical progression generation", () => {
  it("uses the existing Experience Creator with a two-attempt guard and no legacy generator", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/canonicalProgressionGenerator.ts"), "utf8");
    expect(source).toContain("generateAdaptiveProgressionActivityHtml");
    expect(source).not.toContain("generateQuestGameHtml");
    expect(source).toContain("const maxAttempts = retryableStage ? 2 : 1");
    expect(source).toContain("attempt <= maxAttempts");
    expect(source).not.toContain("while (");
    expect(source).not.toContain("Repair these rejected artifact failures");
  });
  it("generates and binds Quest from its canonical prompt plus a frozen design artifact", async () => {
    const rootDir = root();
    const created = createLearningCycle(baseInput(), { rootDir });
    const generating = transitionLearningCycle("reina", "hw-progression", created.revision, { type: "baseline_completed", nodeId: "facts", academicEvidence: [{ evidenceId: "attempt:1", summary: "correct", accuracy: 1 }], engagementEvidence: [], companionObservations: [], decision: { status: "supported", reason: "Ready for transfer", nextAction: "Generate Quest" } }, { rootDir });
    let receivedPrompt = "";
    let receivedDesign: ExperienceDesignArtifactV1 | undefined;
    const result = await generateCanonicalProgressionArtifact({ childId: "reina", homeworkId: "hw-progression", designExperience: designExperience(), generateHtml: async ({ prompt, designArtifact }) => { receivedPrompt = prompt; receivedDesign = designArtifact; return "<html><body><h1>Quest</h1></body></html>"; }, validate: async () => ({ passed: true, failures: [], screenshotPaths: ["/tmp/open.png", "/tmp/recovery.png", "/tmp/mid.png", "/tmp/complete.png"] }) }, { rootDir });
    expect(receivedPrompt).toContain(generating.nodes.find((node) => node.role === "quest")?.generationPrompt?.text);
    expect(receivedDesign?.coreInteraction).toContain("Construct and test equal groups");
    expect(result.lifecycle).toBe("quest_ready");
    expect(result.nodes.find((node) => node.role === "quest")?.artifactBinding?.localArtifactPath).toContain("/api/homework/game/reina/");
  });

  it("adds one Creator design phase without changing the canonical academic contract", async () => {
    const rootDir = root();
    const created = createLearningCycle(baseInput(), { rootDir });
    const generating = transitionLearningCycle("reina", "hw-progression", created.revision, {
      type: "baseline_completed",
      nodeId: "facts",
      academicEvidence: [{ evidenceId: "attempt:1", summary: "correct", accuracy: 1 }],
      engagementEvidence: [],
      companionObservations: [],
      decision: { status: "supported", reason: "Ready for transfer", nextAction: "Generate Quest" },
    }, { rootDir });
    const questBefore = generating.nodes.find((node) => node.role === "quest")!;
    let creatorPrompt = "";
    let creatorArtwork = "";
    let artworkCalls = 0;
    let designCalls = 0;
    let receivedDesign: ExperienceDesignArtifactV1 | undefined;

    const result = await generateCanonicalProgressionArtifact({
      childId: "reina",
      homeworkId: "hw-progression",
      designExperience: async ({ node, academicContractHash }) => {
        designCalls += 1;
        return progressionDesign(node.nodeId, academicContractHash);
      },
      generateArtwork: async ({ prompt }) => {
        artworkCalls += 1;
        expect(prompt).toContain("without words");
        return "/generated/direct-math/hw-progression-quest-fresh.jpeg";
      },
      generateHtml: async ({ prompt, node, designArtifact }) => {
        creatorPrompt = prompt;
        creatorArtwork = node.artwork.localPath ?? "";
        receivedDesign = designArtifact;
        return "<html><body><h1>Quest</h1></body></html>";
      },
      validate: async () => ({
        passed: true,
        failures: [],
        screenshotPaths: ["/tmp/open.png", "/tmp/recovery.png", "/tmp/mid.png", "/tmp/complete.png"],
      }),
    }, { rootDir });

    expect(artworkCalls).toBe(0);
    expect(designCalls).toBe(1);
    expect(creatorPrompt).toBe(questBefore.generationPrompt?.text);
    expect(receivedDesign?.academicContractHash).toBeTruthy();
    expect(creatorArtwork).toBe("/generated/adventure-board-demo/quest.jpeg");
    const questAfter = result.nodes.find((node) => node.role === "quest")!;
    expect(questAfter.generationPrompt).toEqual(questBefore.generationPrompt);
    expect(questAfter.academicTarget).toEqual(questBefore.academicTarget);
    expect(questAfter.evidenceContract).toEqual(questBefore.evidenceContract);
    expect(questAfter.artifactBinding?.localArtworkPath)
      .toBe("/generated/adventure-board-demo/quest.jpeg");
    expect(questAfter.artifactBinding?.creativeProvenance).toMatchObject({
      architectModel: "claude-fable-5",
      builderModel: "claude-opus-5",
      academicContractHash: receivedDesign?.academicContractHash,
    });
    expect(questAfter.artifactBinding?.creativeProvenance?.designArtifactHash).toBeTruthy();
  });

  it("retries a Quest once when runtime validation fails and binds the corrected implementation", async () => {
    const rootDir = root();
    const created = createLearningCycle(baseInput(), { rootDir });
    transitionLearningCycle("reina", "hw-progression", created.revision, {
      type: "baseline_completed",
      nodeId: "facts",
      academicEvidence: [{ evidenceId: "attempt:1", summary: "correct", accuracy: 1 }],
      engagementEvidence: [],
      companionObservations: [],
      decision: { status: "supported", reason: "Ready for transfer", nextAction: "Generate Quest" },
    }, { rootDir });
    const generatedPrompts: string[] = [];
    const generatedDesigns: ExperienceDesignArtifactV1[] = [];
    let designCalls = 0;

    const result = await generateCanonicalProgressionArtifact({
      childId: "reina",
      homeworkId: "hw-progression",
      designExperience: async ({ node, academicContractHash }) => {
        designCalls += 1;
        return progressionDesign(node.nodeId, academicContractHash);
      },
      generateHtml: async ({ prompt, designArtifact }) => {
        generatedPrompts.push(prompt);
        generatedDesigns.push(designArtifact!);
        return generatedPrompts.length === 1
          ? "<html><body><h1>Quest</h1><button>Answer</button></body></html>"
          : "<html><body><h1>Quest</h1><main>Reactive world and visible journey</main></body></html>";
      },
      validate: async ({ html }) => html.includes("Reactive")
        ? {
            passed: true,
            failures: [],
            screenshotPaths: ["/tmp/revised-opening.png", "/tmp/revised-recovery.png", "/tmp/revised-midplay.png", "/tmp/revised-completion.png"],
          }
        : {
            passed: false,
            failures: ["Runtime attempt event count 0/5 is too low."],
            screenshotPaths: ["/tmp/initial-opening.png"],
          },
    }, { rootDir });

    expect(generatedPrompts).toHaveLength(2);
    expect(designCalls).toBe(1);
    expect(generatedDesigns[1]).toEqual(generatedDesigns[0]);
    expect(generatedPrompts[1]).toContain("Runtime attempt event count 0/5 is too low.");
    expect(generatedPrompts[1]).toContain("<button>Answer</button>");
    const quest = result.nodes.find((node) => node.role === "quest")!;
    const artifactFile = path.join(
      rootDir,
      "src/context/reina/homework/games",
      path.basename(quest.artifactBinding?.localArtifactPath ?? ""),
    );
    expect(fs.readFileSync(artifactFile, "utf8")).toContain("Reactive world");
  });

  it("persists the frozen design before building and reuses it after builder or validator interruption", async () => {
    const rootDir = root();
    const created = createLearningCycle(baseInput(), { rootDir });
    transitionLearningCycle("reina", "hw-progression", created.revision, {
      type: "baseline_completed",
      nodeId: "facts",
      academicEvidence: [{ evidenceId: "attempt:1", summary: "correct", accuracy: 1 }],
      engagementEvidence: [], companionObservations: [],
      decision: { status: "supported", reason: "Ready", nextAction: "Generate Quest" },
    }, { rootDir });
    let designCalls = 0;
    const design = async ({ node, academicContractHash }: { node: { nodeId: string }; academicContractHash: string }) => {
      designCalls += 1;
      return progressionDesign(node.nodeId, academicContractHash);
    };

    await expect(generateCanonicalProgressionArtifact({
      childId: "reina",
      homeworkId: "hw-progression",
      designExperience: design,
      generateHtml: async () => "<html><body><h1>Quest</h1></body></html>",
      validate: async () => { throw new Error("browser_interrupted"); },
    }, { rootDir })).resolves.toMatchObject({ lifecycle: "quest_generating" });

    const frozenFile = path.join(
      rootDir,
      "src/context/reina/homework/games/.validation/quest/quality/design-artifact.json",
    );
    expect(fs.existsSync(frozenFile)).toBe(true);
    const frozen = JSON.parse(fs.readFileSync(frozenFile, "utf8")) as ExperienceDesignArtifactV1;

    const completed = await generateCanonicalProgressionArtifact({
      childId: "reina",
      homeworkId: "hw-progression",
      designExperience: async () => { throw new Error("design_should_have_been_reused"); },
      generateHtml: async ({ designArtifact }) => {
        expect(designArtifact).toEqual(frozen);
        return "<html><body><h1>Quest</h1></body></html>";
      },
      validate: async () => ({ passed: true, failures: [] }),
    }, { rootDir });

    expect(designCalls).toBe(1);
    expect(completed.lifecycle).toBe("quest_ready");
  });

  it("keeps the frozen design checkpoint exclusively atomic after the builder starts", async () => {
    const rootDir = root();
    const created = createLearningCycle(baseInput(), { rootDir });
    transitionLearningCycle("reina", "hw-progression", created.revision, {
      type: "baseline_completed",
      nodeId: "facts",
      academicEvidence: [{ evidenceId: "attempt:1", summary: "correct", accuracy: 1 }],
      engagementEvidence: [], companionObservations: [],
      decision: { status: "supported", reason: "Ready", nextAction: "Generate Quest" },
    }, { rootDir });
    const frozenFile = path.join(
      rootDir,
      "src/context/reina/homework/games/.validation/quest/quality/design-artifact.json",
    );
    const writeFileSync = fs.writeFileSync.bind(fs);
    let buildStarted = false;
    const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(((file, data, options) => {
      if (buildStarted && String(file) === frozenFile) {
        throw new Error("frozen_design_rewritten_non_atomically");
      }
      return writeFileSync(file, data, options);
    }) as typeof fs.writeFileSync);

    try {
      const result = await generateCanonicalProgressionArtifact({
        childId: "reina",
        homeworkId: "hw-progression",
        designExperience: designExperience(),
        generateHtml: async () => {
          expect(fs.existsSync(frozenFile)).toBe(true);
          buildStarted = true;
          return "<html><body><h1>Quest</h1></body></html>";
        },
        validate: async () => ({ passed: true, failures: [] }),
      }, { rootDir });
      expect(result.lifecycle).toBe("quest_ready");
    } finally {
      writeSpy.mockRestore();
    }
  });

  it("stops after two Creator attempts and leaves a rejected Quest unbound for human review", async () => {
    const rootDir = root();
    const created = createLearningCycle(baseInput(), { rootDir });
    transitionLearningCycle("reina", "hw-progression", created.revision, {
      type: "baseline_completed",
      nodeId: "facts",
      academicEvidence: [{ evidenceId: "attempt:1", summary: "correct", accuracy: 1 }],
      engagementEvidence: [],
      companionObservations: [],
      decision: { status: "supported", reason: "Ready for transfer", nextAction: "Generate Quest" },
    }, { rootDir });
    let generateCalls = 0;
    const result = await generateCanonicalProgressionArtifact({
      childId: "reina",
      homeworkId: "hw-progression",
      designExperience: designExperience(),
      generateHtml: async () => {
        generateCalls += 1;
        return `<html><body><h1>Quest</h1><button>Attempt ${generateCalls}</button></body></html>`;
      },
      validate: async () => ({
        passed: false,
        failures: ["Runtime attempt event count 0/5 is too low."],
        screenshotPaths: ["/tmp/open.png"],
      }),
    }, { rootDir });
    expect(generateCalls).toBe(2);
    expect(result.lifecycle).toBe("quest_generating");
    expect(result.nodes.find((candidate) => candidate.role === "quest")?.artifactBinding).toBeNull();
  });

  it("does nothing unless the canonical lifecycle is generating", async () => {
    const rootDir = root();
    const created = createLearningCycle(baseInput(), { rootDir });
    let calls = 0;
    const result = await generateCanonicalProgressionArtifact({ childId: "reina", homeworkId: "hw-progression", generateHtml: async () => { calls += 1; return ""; }, validate: async () => ({ passed: true, failures: [] }) }, { rootDir });
    expect(result.revision).toBe(created.revision);
    expect(calls).toBe(0);
  });

  it("builds a Planner-prescribed support instrument through the same Creator", async () => {
    const rootDir = root();
    const created = createLearningCycle(baseInput(), { rootDir });
    const observed = transitionLearningCycle("reina", "hw-progression", created.revision, {
      type: "instrument_observed",
      nodeId: "facts",
      academicEvidence: [{ evidenceId: "attempt:1", summary: "fragile", accuracy: 0.4 }],
      engagementEvidence: [],
      companionObservations: [],
      observations: [],
    }, { rootDir });
    transitionLearningCycle("reina", "hw-progression", observed.revision, {
      type: "theory_decided",
      decision: {
        status: "revised",
        reason: "Need another representation.",
        nextAction: "Generate support.",
        progressionAction: "generate_support",
        evidenceIds: ["attempt:1"],
        predictionEvaluationIds: [],
        preserve: [],
        change: ["representation"],
        testNext: ["array link"],
        nextEvidenceRequired: ["support result"],
        nextInstrument: {
          nodeId: "array-support",
          title: "Array Bridge",
          academicTarget: "array notation",
          mechanic: "construction",
          theme: "bridge",
          openingPurpose: "Connect an array to notation.",
          creatorPrompt: "Build the support activity.",
        },
      },
    }, { rootDir });

    const generated = await generateCanonicalProgressionArtifact({
      childId: "reina",
      homeworkId: "hw-progression",
      designExperience: designExperience(),
      generateHtml: async () => "<html><body><h1>Array Bridge</h1></body></html>",
      validate: async () => ({ passed: true, failures: [] }),
    }, { rootDir });

    expect(generated.lifecycle).toBe("baseline_ready");
    const binding = generated.nodes.find((node) => node.nodeId === "array-support")?.artifactBinding;
    expect(binding).not.toBeNull();
    expect(binding?.localArtifactPath).toContain("/api/homework/game/reina/hw-progression/");
    expect(fs.existsSync(path.join(
      rootDir,
      "src/context/reina/homework/games/hw-progression",
      path.basename(binding?.localArtifactPath ?? ""),
    ))).toBe(true);
  });

  it("keeps the published cycle unchanged when both Quest candidates conflict with the canonical role", async () => {
    const rootDir = root();
    const created = createLearningCycle(baseInput(), { rootDir });
    transitionLearningCycle("reina", "hw-progression", created.revision, {
      type: "baseline_completed",
      nodeId: "facts",
      academicEvidence: [{ evidenceId: "attempt:1", summary: "correct", accuracy: 1 }],
      engagementEvidence: [], companionObservations: [],
      decision: { status: "supported", reason: "Ready", nextAction: "Generate Quest" },
    }, { rootDir });

    let generateCalls = 0;
    const result = await generateCanonicalProgressionArtifact({
      childId: "reina",
      homeworkId: "hw-progression",
      designExperience: designExperience(),
      generateHtml: async () => {
        generateCalls += 1;
        return "<html><body><h1>Vault Cracker</h1><p>Multiplication Quest</p></body></html>";
      },
      validate: async () => ({ passed: true, failures: [] }),
    }, { rootDir });
    expect(generateCalls).toBe(2);
    expect(result.lifecycle).toBe("quest_generating");
    expect(result.nodes.find((node) => node.role === "quest")?.artifactBinding).toBeNull();
  });
});
