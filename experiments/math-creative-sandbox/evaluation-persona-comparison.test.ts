import { describe, expect, it } from "vitest";
import {
  ComparisonCallBudget,
  buildArchitectPrompts,
  buildHarnessPrompt,
  buildNeutralBuilderPrompt,
  extractComparisonHtml,
  extractToolArtifact,
  renderPromptManifest,
  renderComparisonReport,
  resolveComparisonOutput,
  verifyPromptManifestIntegrity,
} from "./evaluation-persona-comparison";

const input = {
  evaluationContract: {
    evaluationId: "EVAL-LAB-MATH-C-OPEN-01",
    upstreamHash: "source-hash",
    assignmentScope: ["equal groups", "factor meaning"],
    items: [{ itemId: "ITEM-1", constructId: "C1" }],
  },
  evaluationHash: "evaluation-hash",
  factualChildEvidence: [
    { evidenceId: "reina:age:2026-07", fact: "The child is nine years old." },
    { evidenceId: "reina:riddles:scaffold", fact: "She requested hints and continued when stuck." },
  ],
  viewport: { width: 1365, height: 768 },
};

describe("evaluation persona comparison", () => {
  it("changes only the declared reasoning-persona block between architect arms", () => {
    const prompts = buildArchitectPrompts(input);

    expect(prompts.neutral.sharedPrompt).toBe(prompts.persona.sharedPrompt);
    expect(prompts.neutral.variantBlock).not.toBe(prompts.persona.variantBlock);
    expect(prompts.neutral.variantBlock).toContain("No additional reasoning persona");
    expect(prompts.persona.variantBlock).toContain("accountable");
    expect(prompts.persona.variantBlock).toContain("Form your own design point of view");
    expect(prompts.persona.variantBlock).toContain("no aesthetic style or mechanic has been selected");
  });

  it("contains no hidden aesthetic steering or historical activity anchors", () => {
    const serialized = JSON.stringify(buildArchitectPrompts(input));

    expect(serialized).not.toMatch(/playful|bold|cinematic|exciting|beautiful|high[- ]stakes|decorative quiz/i);
    expect(serialized).not.toMatch(/Skyglider|Crane|Vault|Tidepool|Rope-and-Peg/i);
    expect(serialized).toContain("Creative constraints imposed by the experiment: none");
  });

  it("requires experiential completeness without selecting the creative answer", () => {
    const shared = buildArchitectPrompts(input).neutral.sharedPrompt;

    expect(shared).toContain("openingPromise");
    expect(shared).toContain("mathAsPower");
    expect(shared).toContain("stakesAndConsequences");
    expect(shared).toContain("worldReaction");
    expect(shared).toContain("payoff");
    expect(shared).toContain("replayVariation");
    expect(shared).toContain("No theme, mechanic, world, character, visual style, sound style, or reward form has been selected");
  });

  it("uses one neutral builder instruction for both frozen artifacts", () => {
    const left = buildNeutralBuilderPrompt({
      evaluationContract: input.evaluationContract,
      evaluationHash: input.evaluationHash,
      designArtifact: { artifactId: "neutral-artifact" },
      designHash: "neutral-hash",
      viewport: input.viewport,
    });
    const right = buildNeutralBuilderPrompt({
      evaluationContract: input.evaluationContract,
      evaluationHash: input.evaluationHash,
      designArtifact: { artifactId: "persona-artifact" },
      designHash: "persona-hash",
      viewport: input.viewport,
    });

    expect(left.instruction).toBe(right.instruction);
    expect(left.instruction).not.toMatch(/Rowan|playful|bold|exciting|beautiful/i);
    expect(left.payload).not.toBe(right.payload);
  });

  it("keeps the harness observational and unable to repair either candidate", () => {
    const prompt = buildHarnessPrompt({
      evaluationHash: input.evaluationHash,
      neutralDesignHash: "neutral-hash",
      personaDesignHash: "persona-hash",
    });

    expect(prompt).toContain("review-only");
    expect(prompt).toContain("overlap");
    expect(prompt).toContain("first required action");
    expect(prompt).toContain("evidence classification");
    expect(prompt).not.toMatch(/repair|rewrite|improve the design|choose a winner/i);
  });

  it("renders every exact prompt and the variant diff before calls are enabled", () => {
    const prompts = buildArchitectPrompts(input);
    const manifest = renderPromptManifest({
      prompts,
      builderInstruction: buildNeutralBuilderPrompt({
        evaluationContract: input.evaluationContract,
        evaluationHash: input.evaluationHash,
        designArtifact: { artifactId: "pending" },
        designHash: "pending",
        viewport: input.viewport,
      }).instruction,
      harnessPrompt: buildHarnessPrompt({
        evaluationHash: input.evaluationHash,
        neutralDesignHash: "pending",
        personaDesignHash: "pending",
      }),
      evaluationContract: input.evaluationContract,
      promptHashes: { shared: "one", neutral: "two", persona: "three", builder: "four", harness: "five" },
      callsEnabled: false,
    });

    expect(manifest).toContain("Exact shared architect prompt");
    expect(manifest).toContain("Exact neutral-only block");
    expect(manifest).toContain("Exact persona-only block");
    expect(manifest).toContain("Exact neutral builder instruction");
    expect(manifest).toContain("Exact review-only harness prompt");
    expect(manifest).toContain("Paid calls are locked");
  });

  it("caps the experiment at five calls with no retry", () => {
    const budget = new ComparisonCallBudget(5);
    expect(budget.begin("neutral-architect")).toBe(1);
    expect(budget.begin("persona-architect")).toBe(2);
    expect(budget.begin("neutral-builder")).toBe(3);
    expect(budget.begin("persona-builder")).toBe(4);
    expect(budget.begin("review-harness")).toBe(5);
    expect(() => budget.begin("review-harness")).toThrow("evaluation_persona_call_ceiling_reached");
  });

  it("cannot write outside the comparison output root", () => {
    expect(resolveComparisonOutput("/repo", "run-1")).toBe(
      "/repo/outputs/math-creative-sandbox/evaluation-persona-comparison/run-1",
    );
    expect(() => resolveComparisonOutput("/repo", "../../src/context/reina"))
      .toThrow("evaluation_persona_output_escape");
  });

  it("refuses to run when any frozen prompt text no longer matches its hash", () => {
    const prompts = buildArchitectPrompts(input);
    const manifest = {
      evaluationHash: input.evaluationHash,
      prompts,
      builderInstruction: "neutral builder",
      harnessPrompt: "review-only harness",
      promptHashes: {
        shared: "",
        neutralVariant: "",
        personaVariant: "",
        neutralFull: "",
        personaFull: "",
        builderInstruction: "",
        harness: "",
      },
    };
    const sealed = verifyPromptManifestIntegrity(manifest, { sealMissingHashes: true });
    expect(() => verifyPromptManifestIntegrity({
      ...sealed,
      prompts: {
        ...sealed.prompts,
        persona: { ...sealed.prompts.persona, fullPrompt: `${sealed.prompts.persona.fullPrompt}\nhidden taste` },
      },
    })).toThrow("evaluation_persona_prompt_hash_mismatch:personaFull");
  });

  it("accepts only complete standalone candidate HTML", () => {
    expect(extractComparisonHtml("```html\n<!doctype html><html><body>candidate</body></html>\n```")).toContain("candidate");
    expect(() => extractComparisonHtml("<html><body>truncated"))
      .toThrow("evaluation_persona_complete_html_missing");
  });

  it("recovers a frozen architect artifact from its saved provider response", () => {
    const artifact = extractToolArtifact([
      { type: "text", text: "done" },
      { type: "tool_use", name: "submit_evaluation_design_artifact", input: { artifactId: "A1", upstreamHash: "evaluation-hash" } },
    ], "submit_evaluation_design_artifact");

    expect(artifact).toEqual({ artifactId: "A1", upstreamHash: "evaluation-hash" });
    expect(() => extractToolArtifact([], "submit_evaluation_design_artifact"))
      .toThrow("evaluation_persona_structured_output_missing");
  });

  it("renders a blinded playable comparison with an explicit provenance reveal", () => {
    const report = renderComparisonReport({
      candidates: [
        { label: "Candidate A", relativePath: "candidate-a/experience.html", arm: "persona", designHash: "a", htmlHash: "ha" },
        { label: "Candidate B", relativePath: "candidate-b/experience.html", arm: "neutral", designHash: "b", htmlHash: "hb" },
      ],
      harnessReview: { scope: "review-only", findings: [] },
      usage: [],
      promptManifestRelativePath: "prompt-manifest.html",
    });

    expect(report).toContain("Candidate A");
    expect(report).toContain("Candidate B");
    expect(report).toContain("candidate-a/experience.html");
    expect(report).toContain("Reveal provenance");
    expect(report).toContain("Evaluation quality scorecard");
    expect(report).toContain("hidden");
  });
});
