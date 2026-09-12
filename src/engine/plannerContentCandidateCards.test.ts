import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { AIContentCatalogItem } from "../context/schemas/learningProfile";
import type { ChildChart } from "../profiles/childChart";
import {
  buildPlannerContentCandidateCards,
  resolveExactMathCatalogReuse,
} from "./learningDecisionContext";

function chart(items: AIContentCatalogItem[] = []): ChildChart {
  return {
    childId: "reina",
    learningProfile: {
      activityModel: {
        "spell-check": {
          activityId: "spell-check",
          plays: 8,
          completions: 7,
          completionRate: 0.875,
          averageAccuracy: 0.91,
          engagementScore: 0.82,
          frustrationScore: 0.16,
          likedCount: 2,
          dislikedCount: 0,
          lastRating: "like",
          domains: { spelling: 8 },
          missedWords: ["knock"],
        },
      },
    },
    contentCatalog: {
      filePath: "/tmp/content_catalog.json",
      items,
      summary: { total: items.length, reusable: 0, needsRevision: 0, retired: 0, candidates: items.length },
    },
  } as unknown as ChildChart;
}

describe("Planner content candidate cards", () => {
  it("does not offer the registered Visual Explainer as an immediately reusable math artifact", () => {
    const cards = buildPlannerContentCandidateCards({ chart: chart(), domain: "math" });
    const explainer = cards.find(card => card.contentId === "instrument:visual-explainer");
    expect(explainer).toMatchObject({ runtime: { status: "registered_unverified" }, decisionCosts: { reuse: { eligible: false } } });
    expect(resolveExactMathCatalogReuse({ decision: { action: "reuse", contentId: explainer!.contentId }, targetNodeId: "graph-bridge", academicContractHash: "graph-contract", cards })).toBeNull();
  });

  it("uses one factual protocol while retaining domain-specific learning capabilities", () => {
    const spelling = buildPlannerContentCandidateCards({ chart: chart(), domain: "spelling" });
    const math = buildPlannerContentCandidateCards({ chart: chart(), domain: "math" });

    const spellCheck = spelling.find((card) => card.contentId === "instrument:spell-check");
    expect(spellCheck?.domainCapabilities.spelling).toMatchObject({
      production: true,
      recall: true,
    });
    expect(spellCheck?.childEvidence).toMatchObject({
      plays: 8,
      completions: 7,
      evidenceCount: 8,
    });
    expect(spellCheck?.childEvidence).not.toHaveProperty("averageAccuracy");

    const clock = math.find((card) => card.contentId === "instrument:clock-game");
    expect(clock?.domainCapabilities.math?.constructs.join(" ").toLowerCase()).toContain("clock");
    expect(clock?.runtime.status).toBe("registered_unverified");
    expect(clock?.decisionCosts.reuse.eligible).toBe(false);

    const serialized = JSON.stringify([...spelling, ...math]);
    expect(serialized).not.toContain("promptDirectives");
    expect(serialized).not.toContain("preferredDimensions");
    expect(serialized).not.toContain("avoidedDimensions");
    expect(serialized).not.toContain("utilityScore");
  });

  it("exposes historical generated content with hashes, uncertainty, outcomes, and cost choices", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-candidate-card-"));
    const htmlPath = path.join(rootDir, "prior.html");
    fs.writeFileSync(htmlPath, "<!doctype html><html><body>prior</body></html>");
    const item = {
      contentId: "hw-old:N1",
      homeworkId: "hw-old",
      childId: "reina",
      type: "game",
      source: "generated",
      purpose: "learning_intervention",
      title: "Clock Harbor",
      activityId: "N1",
      gameHtmlPath: htmlPath,
      domain: "math",
      skillTarget: "read analog clocks to five minutes",
      algorithmTargets: ["retrieval-practice"],
      targetSkills: ["read analog clocks"],
      targetConcepts: ["math:time:analog-clock"],
      targetWords: [],
      engagementHooks: ["visible progress"],
      inputEvidence: { contentFingerprint: "old-source" },
      reuseStatus: "candidate",
      reuseReason: "Needs new-assignment compatibility review.",
      designMemory: {
        artifactId: "artifact-old-N1",
        artifactHash: "artifact-hash",
        academicResponsibility: "clock reading",
        interactionHistory: ["move clock hands"],
        themeHistory: ["harbor"],
        humanReview: "positive",
        childEvidenceIds: ["obs-1", "obs-2"],
        predictionIds: [],
        theoryDecisionIds: [],
        academicContractHash: "contract-hash",
        implementationPromptHash: "prompt-hash",
        generatedHtmlHash: "html-hash",
      },
      performanceSummary: {
        plays: 2,
        completionRate: 0.5,
        averageAccuracy: 0.75,
        engagementScore: 0.7,
        frustrationScore: 0.2,
      },
    } as AIContentCatalogItem;

    const card = buildPlannerContentCandidateCards({ chart: chart([item]), domain: "math" })
      .find((candidate) => candidate.contentId === item.contentId);

    expect(card).toMatchObject({
      hashes: {
        academicContractHash: "contract-hash",
        designArtifactHash: "artifact-hash",
        implementationPromptHash: "prompt-hash",
        htmlHash: "html-hash",
      },
      runtime: { status: "verified" },
      uncertainty: { evidenceCount: 2 },
      decisionCosts: {
        reuse: { eligible: true, estimatedModelCalls: 0 },
        revise: { eligible: true, estimatedModelCalls: 1 },
        generateNew: { eligible: true, estimatedModelCalls: 2 },
      },
    });
  });
});

describe("exact Math catalog reuse", () => {
  it("returns the source only for verified complete HTML with the exact frozen academic hash", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-exact-reuse-"));
    const htmlPath = path.join(rootDir, "source.html");
    fs.writeFileSync(htmlPath, "<!doctype html><html><body><script>window.parent.postMessage({type:'node_complete'},'*')</script></body></html>");
    fs.writeFileSync(path.join(rootDir, "source.artifact.json"), JSON.stringify({
      nodeId: "N1",
      academicContractHash: "same-hash",
    }));

    const matching = resolveExactMathCatalogReuse({
      decision: { action: "reuse", contentId: "hw-old:N1", reason: "Exact contract." },
      targetNodeId: "N1",
      academicContractHash: "same-hash",
      cards: [{
        contentId: "hw-old:N1",
        source: "generated",
        title: "Prior",
        domain: "math",
        academicResponsibility: "clock reading",
        domainCapabilities: {},
        runtime: { status: "verified", launchPath: htmlPath, reason: "Saved complete HTML." },
        childEvidence: { evidenceIds: [], evidenceCount: 0 },
        hashes: { academicContractHash: "same-hash" },
        decisionCosts: {
          reuse: { eligible: true, estimatedModelCalls: 0, estimatedLatencyMs: 0 },
          revise: { eligible: true, estimatedModelCalls: 1, estimatedLatencyMs: null },
          generateNew: { eligible: true, estimatedModelCalls: 2, estimatedLatencyMs: null },
        },
        uncertainty: { evidenceCount: 0, confidence: 0, note: "No child evidence." },
      }],
    });
    expect(matching?.contentId).toBe("hw-old:N1");

    expect(resolveExactMathCatalogReuse({
      decision: { action: "reuse", contentId: "hw-old:N1", reason: "Wrong contract." },
      targetNodeId: "N1",
      academicContractHash: "different-hash",
      cards: matching ? [{ ...matching, hashes: { academicContractHash: "same-hash" } }] : [],
    })).toBeNull();

    expect(resolveExactMathCatalogReuse({
      decision: { action: "reuse", contentId: "hw-old:N1", reason: "Wrong node." },
      targetNodeId: "N2",
      academicContractHash: "same-hash",
      cards: matching ? [matching] : [],
    })).toBeNull();
  });
});
