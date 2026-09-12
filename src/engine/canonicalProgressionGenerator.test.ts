import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLearningCycle, getLearningCycle, transitionLearningCycle } from "./learningCycleRepository";
import { buildSpellingRecallItems } from "./learningCycleIngest";
import { runDirectBrowserSmokeCheck, buildAdaptiveProgressionCreatorPrompt } from "./directMathExperience";
vi.mock("../scripts/validateGeneratedGame",()=>({validateGeneratedGame:()=>({passed:true,failures:[]})}));
vi.mock("./generatedArtifactRuntimeValidator",()=>({validateGeneratedArtifactRuntime:async()=>({passed:true,failures:[]})}));
vi.mock("./directMathExperience",async original=>({...await original<typeof import("./directMathExperience")>(),runDirectBrowserSmokeCheck:vi.fn(async()=>({passed:false,failures:["real_controls_broken"],screenshots:[]}))}));
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

/** Human review noticed that Planner node IDs repeat across assignments. Logs
 * surfaced a request mismatch but not the missing assignment namespace. The lab
 * used a fresh root per assignment, so its resume tests never exercised this.
 */
describe("spelling Creator assignment-scoped checkpoints", () => {
  let rootDir: string;
  beforeEach(() => {
    rootDir = root();
    vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context"));
    vi.stubEnv("SUNNY_GENERATION_MODEL", "recorded-creator-model");
    vi.stubGlobal("fetch", () => { throw new Error("test_forbids_provider_calls"); });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });
  const quality = (homeworkId?: string) => path.join(rootDir, "src/context/lab-child/homework/games/.validation", ...(homeworkId ? ["assignments", homeworkId] : []), "facts/quality");
  const bytes = (dir: string) => Object.fromEntries(fs.readdirSync(dir, { recursive: true }).map(String).sort()
    .filter(file => fs.statSync(path.join(dir, file)).isFile()).map(file => [file, fs.readFileSync(path.join(dir, file), "utf8")]));
  function fixture(homeworkId: string, word: string, role: "baseline" | "quest" = "baseline") {
    const initial = baseInput();
    initial.childId = "lab-child"; initial.homeworkId = homeworkId; initial.domain = "spelling";
    initial.assignment = { title: "Recorded spelling", contentFingerprint: homeworkId, capturedEvidenceIds: ["source:lab"], targets: [word] };
    const item = buildSpellingRecallItems({ homeworkId, words: [word], evidenceIds: ["source:lab"], measurementRole: "practice", exposure: "practiced", occasionId: "facts" })[0];
    initial.nodes = [{ ...initial.nodes[0], role, state: "generating", artifactBinding: null,
      academicTarget: { domain: "spelling", skill: "word-recall", targets: [word] },
      generationPrompt: { promptId: `${homeworkId}:prompt`, text: `Practice ${word}`, createdFromEvidenceIds: ["source:lab"] },
      artwork: { status: "pending", localPath: null, prompt: "An abstract backdrop" },
      evidenceContract: { academic: true, engagement: true, companionObservations: true, spellingItems: { [item.id]: item }, itemRoles: { [item.id]: "practice" } },
    }] as never;
    const cycle = createLearningCycle(initial, { rootDir });
    const generateArtwork = vi.fn(async () => `/recorded/${homeworkId}.png`);
    const generateHtml = vi.fn(async () => `<html><h1>Fact Blaster</h1><p>${item.id}: ${word}</p></html>`);
    const input = { childId: initial.childId, homeworkId, nodeId: "facts", generateArtwork, generateHtml };
    const interrupt = () => generateCanonicalProgressionArtifact({ ...input, validate: async () => {
      if (role === "quest") throw new Error("recorded_interruption");
      return { passed: false, failures: ["recorded_interruption"] };
    } }, { rootDir });
    const resume = () => generateCanonicalProgressionArtifact({ ...input, validate: async () => ({ passed: true, failures: [] }) }, { rootDir });
    const validateDefault = () => generateCanonicalProgressionArtifact(input, { rootDir });
    return { cycle, item, generateArtwork, generateHtml, interrupt, resume, validateDefault };
  }
  async function legacyFixture(role: "baseline" | "quest" = "baseline") {
    const value = fixture("hw-first", "night", role);
    await expect(value.interrupt()).rejects.toThrow("recorded_interruption");
    // Recreate the pre-fix layout from real recorded provider-stage files.
    if (fs.existsSync(quality("hw-first"))) {
      fs.mkdirSync(path.dirname(quality()), { recursive: true });
      fs.renameSync(quality("hw-first"), quality());
    }
    return value;
  }

  it("generates different frozen words for the same child/node in two assignments, then resumes with zero additional calls", async () => {
    const first = fixture("hw-first", "night"), second = fixture("hw-second", "light");
    await expect(first.interrupt()).rejects.toThrow("recorded_interruption");
    await expect(second.interrupt()).rejects.toThrow("recorded_interruption");
    const firstBytes = bytes(quality("hw-first")), secondBytes = bytes(quality("hw-second"));
    expect(firstBytes["creator-1.input.json"]).toContain(first.item.id);
    expect(secondBytes["creator-1.input.json"]).toContain(second.item.id);
    for (const value of [first, second]) {
      const ready = await value.resume();
      expect(ready.nodes[0].artifactBinding?.validationStatus).toBe("passed");
      expect(ready.nodes[0].evidenceContract).toEqual(value.cycle.nodes[0].evidenceContract);
      await value.resume();
      expect(value.generateHtml).toHaveBeenCalledOnce();
      expect(value.generateArtwork).toHaveBeenCalledOnce();
    }
    expect(bytes(quality("hw-first"))).toEqual(firstBytes);
    expect(bytes(quality("hw-second"))).toEqual(secondBytes);
    expect(fs.existsSync(quality())).toBe(false);
  });

  it("keeps distinct candidate files through two default spelling validations for the same child/node", async () => {
    const first = fixture("hw-first", "night"), second = fixture("hw-second", "light");
    const verifier = vi.mocked(runDirectBrowserSmokeCheck), before = verifier.mock.calls.length;
    // Do not inject validate: exercise productionValidate's real file writes.
    // Only the final browser boundary is recorded; this is not browser acceptance.
    await expect(first.validateDefault()).rejects.toThrow("real_controls_broken");
    await expect(second.validateDefault()).rejects.toThrow("real_controls_broken");
    const artifacts = verifier.mock.calls.slice(before).map(([input]) => input.artifacts[0]);
    expect(artifacts).toHaveLength(2);
    expect(artifacts.map(artifact => artifact.htmlPath)).toEqual([
      path.join(quality("hw-first"), "candidate.html"), path.join(quality("hw-second"), "candidate.html"),
    ]);
    expect(artifacts.map(artifact => artifact.homeworkId)).toEqual(["hw-first", "hw-second"]);
    for (const [index, value] of [first, second].entries()) {
      expect(fs.readFileSync(artifacts[index].htmlPath, "utf8")).toContain(`${value.item.id}: ${value.item.word}`);
      expect(artifacts[index].itemIds).toEqual([value.item.id]);
      expect(value.generateHtml).toHaveBeenCalledOnce();
      expect(value.generateArtwork).toHaveBeenCalledOnce();
    }
  });

  it("leaves the existing default math validation candidate path unchanged", async () => {
    const initial = baseInput(); initial.childId = "lab-child";
    initial.nodes = [{ ...initial.nodes[0], state: "generating", artifactBinding: null,
      generationPrompt: { promptId: "recorded-math", text: "Practice multiplication", createdFromEvidenceIds: ["pdf"] },
    }] as never;
    createLearningCycle(initial, { rootDir });
    const verifier = vi.mocked(runDirectBrowserSmokeCheck), before = verifier.mock.calls.length;
    await expect(generateCanonicalProgressionArtifact({ childId: "lab-child", homeworkId: initial.homeworkId,
      generateHtml: async () => "<html><h1>Fact Blaster</h1></html>",
    }, { rootDir })).rejects.toThrow("real_controls_broken");
    expect(verifier.mock.calls.slice(before)).toHaveLength(1);
    expect(verifier.mock.calls[before][0].artifacts[0].htmlPath).toBe(path.join(path.dirname(quality()), "candidate.html"));
  });

  it("reuses matching legacy completed artwork/Creator receipts byte-for-byte with their original model and frozen evidence", async () => {
    const value = await legacyFixture(), legacy = bytes(quality());
    transitionLearningCycle("lab-child", "hw-first", value.cycle.revision, { type: "prediction_evaluations_recorded", evaluations: [] }, { rootDir });
    vi.stubEnv("SUNNY_GENERATION_MODEL", "different-current-model");
    const ready = await value.resume();
    expect(ready.nodes[0].artifactBinding?.validationStatus).toBe("passed");
    expect(value.generateHtml).toHaveBeenCalledOnce();
    expect(value.generateArtwork).toHaveBeenCalledOnce();
    expect(bytes(quality())).toEqual(legacy);
    expect(bytes(quality("hw-first"))).toEqual(legacy);
    expect(JSON.stringify(legacy)).toContain("recorded-creator-model");
    expect(JSON.stringify(bytes(quality("hw-first")))).not.toContain("different-current-model");
  });

  it("does not adopt or overwrite another assignment's legacy snapshot or completed receipts", async () => {
    const first = await legacyFixture(), legacy = bytes(quality());
    const second = fixture("hw-second", "light");
    await second.resume();
    expect(second.generateHtml).toHaveBeenCalledOnce();
    expect(second.generateArtwork).toHaveBeenCalledOnce();
    expect(bytes(quality())).toEqual(legacy);
    const saved = JSON.parse(bytes(quality("hw-second"))["creator-1.input.json"]);
    expect(saved.input.cycle.homeworkId).toBe("hw-second");
    expect(saved.input.node.evidenceContract.spellingItems).toHaveProperty(second.item.id);
    await first.resume();
    expect(first.generateHtml).toHaveBeenCalledOnce();
    expect(first.generateArtwork).toHaveBeenCalledOnce();
  });

  it("reuses a matching completed legacy receipt even when its stage pointer is missing", async () => {
    const value = await legacyFixture();
    fs.unlinkSync(path.join(quality(), "provider-receipts/creator-1.stage.json"));
    const legacy = bytes(quality());
    await value.resume();
    expect(value.generateHtml).toHaveBeenCalledOnce();
    expect(value.generateArtwork).toHaveBeenCalledOnce();
    expect(bytes(quality())).toEqual(legacy);
  });

  it.each(["baseline", "quest"] as const)("does not regenerate or relabel a completed legacy %s request after the configured provider changes", async role => {
    const value = await legacyFixture(role), legacy = bytes(quality());
    vi.stubEnv("SUNNY_GENERATION_MODEL", "gpt-recorded-other-provider");
    await expect(value.resume()).rejects.toThrow("provider_stage_request_changed:creator-1");
    expect(value.generateHtml).toHaveBeenCalledOnce();
    expect(value.generateArtwork).toHaveBeenCalledOnce();
    expect(bytes(quality())).toEqual(legacy);
  });

  it("preserves an uncertain legacy request and refuses another provider call", async () => {
    const value = await legacyFixture();
    const stage = JSON.parse(fs.readFileSync(path.join(quality(), "provider-receipts/creator-1.stage.json"), "utf8"));
    fs.writeFileSync(path.join(quality(), `provider-receipts/${stage.requestHash}.json`), JSON.stringify({ status: "in_flight", model: "recorded-creator-model" }));
    const legacy = bytes(quality());
    await expect(value.resume()).rejects.toThrow("provider_outcome_uncertain");
    expect(value.generateHtml).toHaveBeenCalledOnce();
    expect(value.generateArtwork).toHaveBeenCalledOnce();
    expect(bytes(quality())).toEqual(legacy);
    expect(bytes(quality("hw-first"))).toEqual(legacy);
  });

  it("refuses a conflicting scoped snapshot without overwriting either copy", async () => {
    const value = await legacyFixture(), legacy = bytes(quality());
    fs.mkdirSync(quality("hw-first"), { recursive: true });
    const destination = path.join(quality("hw-first"), "creator-1.input.json");
    const conflictingBytes = legacy["creator-1.input.json"] + "\n";
    fs.writeFileSync(destination, conflictingBytes);
    await expect(value.resume()).rejects.toThrow("spelling_legacy_checkpoint_conflict");
    expect(fs.readFileSync(destination, "utf8")).toBe(conflictingBytes);
    expect(bytes(quality())).toEqual(legacy);
    expect(value.generateHtml).toHaveBeenCalledOnce();
    expect(value.generateArtwork).toHaveBeenCalledOnce();
  });

  it("fails closed on a changed matching legacy frozen snapshot without new calls or overwrites", async () => {
    const value = await legacyFixture();
    const file = path.join(quality(), "creator-1.input.json");
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    saved.input.node.academicTarget.targets = ["invented"];
    fs.writeFileSync(file, JSON.stringify(saved));
    const legacy = bytes(quality());
    await expect(value.resume()).rejects.toThrow("spelling_creator_snapshot_changed");
    expect(bytes(quality())).toEqual(legacy);
    expect(value.generateHtml).toHaveBeenCalledOnce();
    expect(value.generateArtwork).toHaveBeenCalledOnce();
  });
});

describe("canonical progression generation", () => {
  it("requires the shared full-journey gate for generated spelling instead of the legacy opening check", async () => {
    const rootDir = root();
    const initial = baseInput(); initial.domain = "spelling";
    initial.nodes = [{ ...initial.nodes[0], state: "generating", artifactBinding: null, generationPrompt: { promptId: "spelling-prompt", text: "Practice", createdFromEvidenceIds: ["pdf"] }, evidenceContract: { academic: true, engagement: true, companionObservations: true, itemRoles: { "frozen-night": "practice" } } }] as never;
    createLearningCycle(initial, { rootDir });
    await expect(generateCanonicalProgressionArtifact({ childId: "reina", homeworkId: "hw-progression", generateHtml: async () => "<html><h1>Fact Blaster</h1></html>" }, { rootDir })).rejects.toThrow("real_controls_broken");
    expect(runDirectBrowserSmokeCheck).toHaveBeenCalledWith(expect.objectContaining({ artifacts: [expect.objectContaining({ itemIds: ["frozen-night"] })] }));
  });
  it("keeps generated spelling in the same Creator with the assigned word identities", () => {
    const cycle = { ...baseInput(), domain: "spelling", observations: [] };
    const node = { ...cycle.nodes[0], generationPrompt: { promptId: "p", text: "Practice night", createdFromEvidenceIds: ["pdf"] }, evidenceContract: { spellingItems: { frozen: { id: "frozen", word: "night" } } } };
    const prompt = buildAdaptiveProgressionCreatorPrompt({ cycle, node, childContext: {} } as never);
    expect(prompt).toContain('domain:"spelling"');
    expect(prompt).not.toContain('domain:"math"');
    expect(prompt).toContain("Preserve the assigned spelling words and frozen item IDs");
    expect(prompt).toContain('"frozen"');
  });
  it("builds the requested spelling node and reuses its finished Creator call after failed verification", async () => {
    const rootDir = root();
    try {
      const initial = baseInput(); initial.domain = "spelling";
      initial.nodes = ["one", "two"].map(id => ({ ...initial.nodes[0], nodeId: id, title: id, state: "generating", artifactBinding: null, openingScreen: { title: id, purpose: "Practice spelling" }, academicTarget: { domain: "spelling", skill: "word-recall", targets: ["night"] }, generationPrompt: { promptId: `prompt-${id}`, createdFromEvidenceIds: ["pdf"], text: `Build ${id}` } })) as never;
      createLearningCycle(initial, { rootDir });
      const generateHtml = vi.fn(async () => "<html><body><h1>two</h1></body></html>");
      const input = { childId: "reina", homeworkId: "hw-progression", nodeId: "two", generateHtml, validate: async () => ({ passed: false, failures: ["recorded_failure"] }) };
      await expect(generateCanonicalProgressionArtifact(input, { rootDir })).rejects.toThrow("recorded_failure");
      const result = await generateCanonicalProgressionArtifact({ ...input, validate: async () => ({ passed: true, failures: [] }) }, { rootDir });
      expect(result.nodes.find(node => node.nodeId === "one")?.artifactBinding).toBeNull();
      expect(result.nodes.find(node => node.nodeId === "two")?.artifactBinding).not.toBeNull();
      expect(generateHtml).toHaveBeenCalledOnce();
    } finally { fs.rmSync(rootDir, { recursive: true, force: true }); }
  });
  it("reuses spelling artwork after validation failure instead of paying again", async () => {
    const rootDir = root();
    const initial = baseInput(); initial.domain = "spelling";
    initial.nodes = [{ ...initial.nodes[0], state: "generating", artifactBinding: null, artwork: { status: "pending", localPath: null, prompt: "An abstract backdrop" }, generationPrompt: { promptId: "p-art", text: "Practice", createdFromEvidenceIds: ["pdf"] } }] as never;
    createLearningCycle(initial, { rootDir });
    const generateArtwork = vi.fn(async () => "/recorded-art.png");
    const input = { childId: "reina", homeworkId: "hw-progression", generateArtwork, generateHtml: async () => "<html><h1>Fact Blaster</h1></html>", validate: async () => ({ passed: false, failures: ["recorded_failure"] }) };
    await expect(generateCanonicalProgressionArtifact(input, { rootDir })).rejects.toThrow("recorded_failure");
    await expect(generateCanonicalProgressionArtifact(input, { rootDir })).rejects.toThrow("recorded_failure");
    expect(generateArtwork).toHaveBeenCalledOnce();
  });
  it("freezes the Creator evidence snapshot across a spelling verification interruption", async () => {
    const rootDir = root(), initial = baseInput(); initial.domain = "spelling";
    initial.nodes = [{ ...initial.nodes[0], state: "generating", artifactBinding: null, generationPrompt: { promptId: "p-snapshot", text: "Practice", createdFromEvidenceIds: ["pdf"] } }] as never;
    createLearningCycle(initial, { rootDir });
    const snapshots: string[] = [];
    const generateHtml = vi.fn(async (input: any) => { snapshots.push(JSON.stringify(input)); return "<html><h1>Fact Blaster</h1></html>"; });
    const input = { childId: "reina", homeworkId: "hw-progression", generateHtml, validate: async () => ({ passed: false, failures: ["recorded_interruption"] }) };
    await expect(generateCanonicalProgressionArtifact(input, { rootDir })).rejects.toThrow("recorded_interruption");
    const file = path.join(rootDir, "src/context/reina/homework/games/.validation/assignments/hw-progression/facts/quality/creator-1.input.json");
    const frozen = fs.readFileSync(file, "utf8");
    const current = getLearningCycle("reina", "hw-progression", { rootDir })!;
    transitionLearningCycle("reina", "hw-progression", current.revision, { type: "prediction_evaluations_recorded", evaluations: [] }, { rootDir });
    await generateCanonicalProgressionArtifact({ ...input, validate: async () => ({ passed: true, failures: [] }) }, { rootDir });
    expect(fs.readFileSync(file, "utf8")).toBe(frozen);
    expect(snapshots).toHaveLength(1);
    expect(JSON.stringify(JSON.parse(frozen).input)).toBe(snapshots[0]);
  });
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


it("requires the real control verifier for newly generated math Quest", async () => {
  const rootDir=root();const cycle=createLearningCycle(baseInput(),{rootDir});
  transitionLearningCycle("reina","hw-progression",cycle.revision,{type:"baseline_completed",nodeId:"facts",academicEvidence:[],engagementEvidence:[],companionObservations:[],decision:{status:"supported",reason:"Try transfer",nextAction:"Quest"}},{rootDir});
  const result=await generateCanonicalProgressionArtifact({childId:"reina",homeworkId:"hw-progression",generateHtml:async()=>"<html><body><h1>Quest</h1><button>Broken</button></body></html>"},{rootDir});
  expect(runDirectBrowserSmokeCheck).toHaveBeenCalled();
  expect(result.nodes.find(node=>node.role==="quest")?.artifactBinding).toBeNull();
});


it("binds verified content after an unrelated canonical revision changes during generation", async () => {
  const rootDir=root();const created=createLearningCycle(baseInput(),{rootDir});
  transitionLearningCycle("reina","hw-progression",created.revision,{type:"baseline_completed",nodeId:"facts",academicEvidence:[],engagementEvidence:[],companionObservations:[],decision:{status:"supported",reason:"Transfer",nextAction:"Quest"}},{rootDir});
  let calls=0;
  const result=await generateCanonicalProgressionArtifact({childId:"reina",homeworkId:"hw-progression",generateHtml:async()=>{calls++;const current=getLearningCycle("reina","hw-progression",{rootDir})!;transitionLearningCycle("reina","hw-progression",current.revision,{type:"prediction_evaluations_recorded",evaluations:[]},{rootDir});return "<html><h1>Quest</h1></html>";},validate:async()=>({passed:true,failures:[]})},{rootDir});
  expect(result.lifecycle).toBe("quest_ready");expect(calls).toBe(1);
});
