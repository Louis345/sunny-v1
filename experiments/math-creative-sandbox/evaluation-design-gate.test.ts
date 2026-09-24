import { describe, expect, it } from "vitest";
import {
  EvaluationGateBudget,
  buildEvaluationGatePrompts,
  classifyEvaluationAttempt,
  extractStandaloneEvaluationHtml,
  renderEvaluationGateReport,
  resolveEvaluationGateOutput,
} from "./evaluation-design-gate";

const frozenInput = {
  assignment: {
    assignmentId: "LAB-MATH-C",
    grade: 3,
    domain: "math",
    concepts: ["equal groups", "factor meaning", "multiplication equations"],
    sourceEvidenceIds: ["assignment:lab-math-c"],
    sourceQuestionTexts: ["Explain what 8 and 5 count in an array."],
  },
  childEvidence: [
    { evidenceId: "reina:age:2026-07", fact: "The child is nine years old." },
    { evidenceId: "reina:riddles:harder", fact: "She requested harder riddles." },
    { evidenceId: "reina:riddles:scaffold", fact: "She requested hints and continued when stuck." },
  ],
  excludedProfileFields: {
    preferredDimensions: ["competition"],
    promptDirectives: { prefer: ["wrestling"] },
  },
  viewport: { width: 1365, height: 768 },
};

describe("personalized evaluation design gate", () => {
  it("keeps the construct contract stable while AI owns the evaluation experience", () => {
    const prompts = buildEvaluationGatePrompts(frozenInput);

    expect(prompts).toHaveLength(3);
    expect(prompts.map((prompt) => prompt.stage)).toEqual([
      "evaluation-planner",
      "evaluation-architect",
      "evaluation-engineer",
    ]);
    expect(prompts[0].request).toContain("prerequisite");
    expect(prompts[0].request).toContain("possibleConfounds");
    expect(prompts[0].request).toContain("falsifyingEvidence");
    expect(prompts[0].request).toContain("Do not copy or lightly rewrite");
    expect(prompts[1].request).toContain("independently choose");
    expect(prompts[1].request).toContain("modality");
    expect(prompts[1].request).not.toMatch(/must use (a )?(race|wrestling|timer|drag)/i);
    expect(prompts[2].request).toContain("1365×768");
  });

  it("passes only factual child evidence and treats personalization as a hypothesis", () => {
    const serialized = JSON.stringify(buildEvaluationGatePrompts(frozenInput));

    expect(serialized).toContain("reina:riddles:harder");
    expect(serialized).toContain("hypothesis");
    expect(serialized).not.toContain("preferredDimensions");
    expect(serialized).not.toContain("promptDirectives");
    expect(serialized).not.toContain("use competition");
  });

  it("requires independent evidence, factual friction, and no mastery claim", () => {
    const engineer = buildEvaluationGatePrompts(frozenInput)[2].request;

    expect(engineer).toContain("evaluation_attempt");
    expect(engineer).toContain("evaluation_complete");
    expect(engineer).toContain("independent");
    expect(engineer).toContain("instrument_ambiguous");
    expect(engineer).toContain("must not declare mastery");
    expect(engineer).toContain("must never trap the child");
    expect(engineer).not.toContain("Sunny API");
  });

  it("accepts only complete standalone HTML", () => {
    expect(extractStandaloneEvaluationHtml("```html\n<!doctype html><html><body>ready</body></html>\n```")).toContain("ready");
    expect(() => extractStandaloneEvaluationHtml("<html><body>truncated"))
      .toThrow("evaluation_gate_complete_html_missing");
  });

  it("produces a parent report that evaluates the instrument rather than awarding mastery", () => {
    const report = renderEvaluationGateReport({
      experienceRelativePath: "experience.html",
      evaluationContract: { evaluationId: "evaluation:lab" },
      designArtifact: { artifactId: "artifact:lab" },
      provenance: { calls: 3, costUsd: 1.25 },
    });

    expect(report).toContain("Evaluation quality review");
    expect(report).toContain("Was the first action understandable");
    expect(report).toContain("Conceptual evidence");
    expect(report).toContain("Interface or reading friction");
    expect(report).toContain("Download factual session report");
    expect(report).toContain("experience.html");
    expect(report).not.toContain("Mastered");
  });

  it("classifies structured activity provenance without turning independent work into assistance", () => {
    expect(classifyEvaluationAttempt({
      result: "incorrect",
      assistance: { level: "none", independentResponse: true },
      exposure: { instructionalExposure: "none: no hint or example" },
    })).toBe("independent_incorrect");

    expect(classifyEvaluationAttempt({
      result: "correct",
      assistance: { level: "hint", independentResponse: false },
      exposure: { instructionalExposure: "hint shown" },
    })).toBe("assisted_or_exposed");
  });

  it("caps the isolated experiment at three calls with no retry", () => {
    const budget = new EvaluationGateBudget(3);
    expect(budget.begin("evaluation-planner")).toBe(1);
    expect(budget.begin("evaluation-architect")).toBe(2);
    expect(budget.begin("evaluation-engineer")).toBe(3);
    expect(() => budget.begin("evaluation-engineer")).toThrow("evaluation_gate_call_ceiling_reached");
  });

  it("cannot write outside the sandbox output root", () => {
    expect(resolveEvaluationGateOutput("/repo", "run-1")).toBe(
      "/repo/outputs/math-creative-sandbox/evaluation-design-gate/run-1",
    );
    expect(() => resolveEvaluationGateOutput("/repo", "../src/context/reina"))
      .toThrow("evaluation_gate_output_escape");
  });
});
