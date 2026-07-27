import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { createLearningCycle, transitionLearningCycle } from "./learningCycleRepository";
import { generateCanonicalProgressionArtifact } from "./canonicalProgressionGenerator";

function root(): string { return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-progression-")); }

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
  it("generates and binds Quest only from the canonical Quest prompt", async () => {
    const rootDir = root();
    const created = createLearningCycle(baseInput(), { rootDir });
    const generating = transitionLearningCycle("reina", "hw-progression", created.revision, { type: "baseline_completed", nodeId: "facts", academicEvidence: [{ evidenceId: "attempt:1", summary: "correct", accuracy: 1 }], engagementEvidence: [], companionObservations: [], decision: { status: "supported", reason: "Ready for transfer", nextAction: "Generate Quest" } }, { rootDir });
    let receivedPrompt = "";
    const result = await generateCanonicalProgressionArtifact({ childId: "reina", homeworkId: "hw-progression", generateHtml: async ({ prompt }) => { receivedPrompt = prompt; return "<html><body><h1>Quest</h1></body></html>"; }, validate: async () => ({ passed: true, failures: [], screenshotPaths: ["/tmp/open.png", "/tmp/recovery.png", "/tmp/mid.png", "/tmp/complete.png"] }) }, { rootDir });
    expect(receivedPrompt).toContain(generating.nodes.find((node) => node.role === "quest")?.generationPrompt?.text);
    expect(result.lifecycle).toBe("quest_ready");
    expect(result.nodes.find((node) => node.role === "quest")?.artifactBinding?.localArtifactPath).toContain("/api/homework/game/reina/");
  });

  it("sends the canonical Quest directly to the Creator without a pre-build Creative Director call", async () => {
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

    const result = await generateCanonicalProgressionArtifact({
      childId: "reina",
      homeworkId: "hw-progression",
      generateArtwork: async ({ prompt }) => {
        artworkCalls += 1;
        expect(prompt).toContain("without words");
        return "/generated/direct-math/hw-progression-quest-fresh.jpeg";
      },
      generateHtml: async ({ prompt, node }) => {
        creatorPrompt = prompt;
        creatorArtwork = node.artwork.localPath ?? "";
        return "<html><body><h1>Quest</h1></body></html>";
      },
      validate: async () => ({
        passed: true,
        failures: [],
        screenshotPaths: ["/tmp/open.png", "/tmp/recovery.png", "/tmp/mid.png", "/tmp/complete.png"],
      }),
    }, { rootDir });

    expect(artworkCalls).toBe(0);
    expect(creatorPrompt).toBe(questBefore.generationPrompt?.text);
    expect(creatorArtwork).toBe("/generated/adventure-board-demo/quest.jpeg");
    const questAfter = result.nodes.find((node) => node.role === "quest")!;
    expect(questAfter.generationPrompt).toEqual(questBefore.generationPrompt);
    expect(questAfter.academicTarget).toEqual(questBefore.academicTarget);
    expect(questAfter.evidenceContract).toEqual(questBefore.evidenceContract);
    expect(questAfter.artifactBinding?.localArtworkPath)
      .toBe("/generated/adventure-board-demo/quest.jpeg");
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

    const result = await generateCanonicalProgressionArtifact({
      childId: "reina",
      homeworkId: "hw-progression",
      generateHtml: async ({ prompt }) => {
        generatedPrompts.push(prompt);
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
