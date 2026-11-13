import { describe, expect, it } from "vitest";
import {
  buildRefactorPrompt,
  buildScenarioPackets,
  chooseStrongestCandidate,
  explorationTurnAllowed,
  parseGeneratedHtml,
  resolveSandboxOutput,
  type CandidateReview,
} from "./experiment";

const profile = {
  identity: { name: "Reina" },
  learningProfile: {
    rewardPreferences: { celebrationStyle: "mixed" },
    activityModel: {
      "wheel-of-fortune": { lastRating: "like", plays: 4 },
      pronunciation: { lastRating: "like", plays: 1 },
    },
  },
  engagementTheory: {
    preferredDimensions: ["competition"],
    avoidedDimensions: ["pressure"],
    promptDirectives: { avoid: ["timers"], prefer: ["wrestling"] },
  },
};

describe("math creative sandbox scenario isolation", () => {
  it("changes only the evidence packet across scenarios 1-3", () => {
    const packets = buildScenarioPackets({
      concept: "multiplication as equal groups and arrays",
      profile,
    });

    expect(packets.map((packet) => packet.id)).toEqual([
      "scenario-1-concept-only",
      "scenario-2-profile",
      "scenario-3-profile-and-spelling",
    ]);
    expect(packets[0].context).toEqual({});
    expect(JSON.stringify(packets[1].context)).toContain("Reina");
    expect(JSON.stringify(packets[1].context)).not.toContain("wheel-of-fortune");
    expect(JSON.stringify(packets[2].context)).toContain("wheel-of-fortune");
    expect(packets.every((packet) => packet.concept === packets[0].concept)).toBe(true);
  });

  it("excludes generated behavioral directives from model-facing profile context", () => {
    const packets = buildScenarioPackets({
      concept: "multiplication as equal groups and arrays",
      profile,
    });
    const text = JSON.stringify(packets);

    expect(text).not.toContain("preferredDimensions");
    expect(text).not.toContain("avoidedDimensions");
    expect(text).not.toContain("promptDirectives");
    expect(text).not.toContain("avoid pressure");
    expect(text).not.toContain("use competition");
  });
});

describe("bounded evaluator decision", () => {
  const review = (
    id: string,
    verdict: CandidateReview["verdict"],
    score: number,
    nextMove: CandidateReview["nextMove"],
  ): CandidateReview => ({
    candidateId: id,
    verdict,
    scores: {
      designQuality: score,
      originality: score,
      craft: score,
      functionality: score,
      learningIntegration: score,
      replayAppeal: score,
    },
    evidence: ["visible evidence"],
    critique: "specific critique",
    nextMove,
  });

  it("selects the strongest reviewed candidate while allowing every candidate to be rejected", () => {
    const selected = chooseStrongestCandidate([
      review("a", "reject", 2, "pivot"),
      review("b", "reject", 3, "pivot"),
      review("c", "reject", 1, "stop"),
    ]);

    expect(selected.candidateId).toBe("b");
    expect(selected.allRejected).toBe(true);
  });

  it("withholds rejected HTML on pivot and includes it on refine", () => {
    const base = {
      concept: "multiplication as equal groups",
      originalPrompt: "create an experience",
      critique: "the interaction is a decorative quiz",
      html: "<html>old direction</html>",
    };

    expect(buildRefactorPrompt({ ...base, move: "pivot" })).not.toContain(base.html);
    expect(buildRefactorPrompt({ ...base, move: "refine" })).toContain(base.html);
  });
});

describe("sandbox output isolation", () => {
  it("never resolves output outside outputs/math-creative-sandbox", () => {
    const root = "/repo";
    expect(resolveSandboxOutput(root, "run-1")).toBe(
      "/repo/outputs/math-creative-sandbox/run-1",
    );
    expect(() => resolveSandboxOutput(root, "../src/context/reina")).toThrow(
      "sandbox_output_escape",
    );
  });
});

describe("generated HTML delivery", () => {
  it("distinguishes complete HTML from a truncated response without inventing content", () => {
    expect(parseGeneratedHtml("<!doctype html><html><body>ok</body></html>")).toEqual({
      ok: true,
      html: "<!doctype html><html><body>ok</body></html>",
    });
    expect(parseGeneratedHtml("<!doctype html><html><body>truncated")).toEqual({
      ok: false,
      reason: "sandbox_creator_returned_incomplete_html",
    });
  });
});

describe("live evaluator loop guard", () => {
  it("permits bounded state-by-state exploration and stops at the ceiling", () => {
    expect(explorationTurnAllowed(0, 8)).toBe(true);
    expect(explorationTurnAllowed(7, 8)).toBe(true);
    expect(explorationTurnAllowed(8, 8)).toBe(false);
    expect(explorationTurnAllowed(20, 8)).toBe(false);
  });

});
