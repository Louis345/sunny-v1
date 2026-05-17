import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildHumanCaughtBugReview,
  buildInvariantCoverage,
  renderHumanCaughtBugReviewMarkdown,
  type LabInvariant,
} from "./humanCaughtBugReview";

describe("human-caught bug review", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function root(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-human-miss-"));
    roots.push(dir);
    return dir;
  }

  function writeSessionFixture(rootDir: string): string {
    const sessionDir = path.join(rootDir, "logs", "sessions", "fixture");
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, "transcript.md"),
      [
        "**assistant:** You crushed that Word Radar - 100 percent perfect!",
        "**user:** I thought the boxes would fill in.",
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      path.join(sessionDir, "events.ndjson"),
      [
        JSON.stringify({
          component: "game_narration",
          action: "speak",
          text: "Ayla, word radar is ready.",
        }),
      ].join("\n") + "\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(sessionDir, "game-traces.ndjson"),
      [
        JSON.stringify({
          type: "node_complete",
          game: "word-radar",
          activityId: "word-radar",
          accuracy: 0.6,
          missedWords: ["thousand", "understood"],
          correctWords: ["machine", "pair", "wait"],
        }),
      ].join("\n") + "\n",
      "utf8",
    );
    return sessionDir;
  }

  it("turns a human observation into a review with evidence, lab gap, and product invariant", () => {
    const projectRoot = root();
    const sessionDir = writeSessionFixture(projectRoot);

    const review = buildHumanCaughtBugReview({
      rootDir: projectRoot,
      sessionDir,
      bug: "The Word Radar mic should play the word, the empty boxes look fillable, and Elli said 100 percent perfect when evidence was 60 percent.",
      generatedAt: "2026-05-17T18:30:00.000Z",
    });

    expect(review.humanObservation).toContain("Word Radar mic");
    expect(review.sessionEvidence.some((item) => item.code === "word_radar_narration_request_missing")).toBe(true);
    expect(review.sessionEvidence.some((item) => item.code === "word_radar_overpraise_contradicts_evidence")).toBe(true);
    expect(review.logEvidence).toContain("Word Radar completed at 60%");
    expect(review.labGap).toContain("child-perception");
    expect(review.missingAssertion).toContain("visible mic");
    expect(review.proposedInvariant).toContain("product invariant");
    expect(review.suggestedFailingTest).toContain("Word Radar");
    expect(review.suggestedOrganicFixCategory).not.toMatch(/if word is|if child is/i);

    const markdown = renderHumanCaughtBugReviewMarkdown(review);
    expect(markdown).toContain("Why did the human catch it?");
    expect(markdown).toContain("Why did the AI lab miss it?");
  });

  it("writes the miss-review artifact set under the sandbox", () => {
    const projectRoot = root();
    const sessionDir = writeSessionFixture(projectRoot);

    const review = buildHumanCaughtBugReview({
      rootDir: projectRoot,
      sessionDir,
      bug: "Word Radar said perfect even though the evidence was not perfect.",
      generatedAt: "2026-05-17T18:35:00.000Z",
      writeFiles: true,
    });

    expect(review.outDir).toContain(path.join(".sunny-sandbox", "lab", "miss-reviews"));
    expect(fs.existsSync(path.join(review.outDir, "human-caught-bug-review.json"))).toBe(true);
    expect(fs.existsSync(path.join(review.outDir, "human-caught-bug-review.md"))).toBe(true);
  });

  it("marks known human-caught bugs as blocking until they have a matching invariant", () => {
    const known: LabInvariant[] = [
      {
        code: "word_radar_audio_affordance_requires_narration",
        source: "human_caught_bug",
        invariant: "Visible hear controls must produce audio proof.",
        suggestedFailingTest: "Word Radar mic click emits narration_request.",
      },
    ];

    expect(buildInvariantCoverage({ knownHumanBugInvariants: known, coveredInvariantCodes: [] })).toMatchObject({
      missingCount: 1,
      blockingFailures: ["word_radar_audio_affordance_requires_narration"],
    });
    expect(
      buildInvariantCoverage({
        knownHumanBugInvariants: known,
        coveredInvariantCodes: ["word_radar_audio_affordance_requires_narration"],
      }),
    ).toMatchObject({
      missingCount: 0,
      blockingFailures: [],
    });
  });

  it("keeps the organic and human-caught-bug rules at the top of AGENTS.md", () => {
    const text = fs.readFileSync(path.join(process.cwd(), "AGENTS.md"), "utf8");
    const lines = text.split("\n").slice(0, 2);

    expect(lines[0]).toContain("Organic first");
    expect(lines[1]).toContain("Every human-caught child-session bug must become a lab invariant");
  });
});
