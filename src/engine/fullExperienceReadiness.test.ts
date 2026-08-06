import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { validateFullExperienceReadiness } from "./fullExperienceReadiness";

const VALID_HTML = `
<h1>Fact Blaster</h1>
<button id="mute-toggle">🔊</button>
<script>
const ctx = new AudioContext();
fireAttemptEvent({ target: "r1" });
fireCompanionEvent("correct_answer");
sendNodeComplete({ completed: true });
</script>`;

describe("full experience readiness", () => {
  it("requires exactly two baseline arms for the initial controlled math experiment", () => {
    const result = validateFullExperienceReadiness({
      baselineNodes: [],
      boardNodes: [],
      publicRoot: os.tmpdir(),
    });
    expect(result.failures).toContain("baseline_experiment_requires_exactly_two_arms");
  });

  it("rejects fallback SVG artwork that Chromium cannot decode", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-readiness-svg-"));
    fs.mkdirSync(path.join(root, "thumbnails"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "thumbnails", "broken.svg"),
      Buffer.from([0x3c, 0x73, 0x76, 0x67, 0x3e, 0xd7, 0x3c, 0x2f, 0x73, 0x76, 0x67, 0x3e]),
    );

    const result = validateFullExperienceReadiness({
      baselineNodes: [],
      boardNodes: [{ id: "vault", kind: "activity", thumbnailUrl: "/thumbnails/broken.svg" }],
      publicRoot: root,
    });

    expect(result.failures).toContain("vault:artwork_missing_or_unresolved");
  });
  it("blocks missing artifacts, titles, artwork, and runtime contracts", () => {
    const result = validateFullExperienceReadiness({
      baselineNodes: [{ id: "facts", contentId: "same" }],
      boardNodes: [{ id: "facts", kind: "activity", thumbnailUrl: "/missing.svg" }],
      publicRoot: os.tmpdir(),
    });
    expect(result.failures).toEqual(expect.arrayContaining([
      "facts:missing_child_title",
      "facts:missing_attached_artifact",
      "facts:artwork_missing_or_unresolved",
    ]));
  });

  it("accepts an attached artifact only when its contracts and artwork resolve", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-readiness-"));
    const artifact = path.join(root, "facts.html");
    const storyArtifact = path.join(root, "story.html");
    fs.writeFileSync(artifact, VALID_HTML, "utf8");
    fs.writeFileSync(storyArtifact, VALID_HTML.replace("Fact Blaster", "Story Solver"), "utf8");
    fs.writeFileSync(path.join(root, "facts.svg"), "<svg />", "utf8");
    fs.writeFileSync(path.join(root, "story.svg"), "<svg />", "utf8");
    const result = validateFullExperienceReadiness({
      baselineNodes: [
        {
          id: "facts",
          title: "Fact Blaster",
          contentId: "hw:facts",
          mechanic: "fact-retrieval",
          engagementVariable: "speed",
          targets: ["5x2", "5x5"],
          difficulty: 2,
          gameHtmlPath: artifact,
          activityConfigPath: "/api/activity-config/reina/hw/facts.json",
          validationProof: { engine: "playwright", passed: true, worldStateChanged: true, screenshotPaths: ["load.png", "mid.png", "complete.png"] },
        },
        {
          id: "story",
          title: "Story Solver",
          contentId: "hw:story",
          mechanic: "equal-groups-story",
          engagementVariable: "visual",
          targets: ["5x2", "5x5"],
          difficulty: 2,
          gameHtmlPath: storyArtifact,
          activityConfigPath: "/api/activity-config/reina/hw/story.json",
          validationProof: { engine: "playwright", passed: true, worldStateChanged: true, screenshotPaths: ["load.png", "mid.png", "complete.png"] },
        },
      ],
      boardNodes: [
        { id: "facts", kind: "activity", thumbnailUrl: "/facts.svg" },
        { id: "story", kind: "activity", thumbnailUrl: "/story.svg" },
      ],
      publicRoot: root,
    });
    expect(result.failures).toEqual([]);
    expect(result.launchableActivities).toBe(2);
  });

  it("rejects a token-complete quiz when no validated world-state reaction exists", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-readiness-generic-"));
    const artifact = path.join(root, "generic-quiz.html");
    fs.writeFileSync(artifact, VALID_HTML, "utf8");
    fs.writeFileSync(path.join(root, "facts.svg"), "<svg />", "utf8");

    const result = validateFullExperienceReadiness({
      baselineNodes: [{
        id: "facts",
        title: "Fact Blaster",
        contentId: "hw:facts",
        mechanic: "fact-retrieval",
        gameHtmlPath: artifact,
        activityConfigPath: "/api/activity-config/reina/hw/facts.json",
      }],
      boardNodes: [{ id: "facts", kind: "activity", thumbnailUrl: "/facts.svg" }],
      publicRoot: root,
    });

    expect(result.failures).toContain("facts:missing_validated_world_state_reaction");
  });

  it("rejects duplicate content identity across experiment arms", () => {
    const result = validateFullExperienceReadiness({
      baselineNodes: [
        { id: "facts", title: "Fact Blaster", contentId: "same", gameHtmlPath: "/tmp/a" },
        { id: "story", title: "Story Solver", contentId: "same", gameHtmlPath: "/tmp/b" },
      ],
      boardNodes: [],
      publicRoot: os.tmpdir(),
    });
    expect(result.failures).toContain("duplicate_content_identity");
  });

  it("rejects multiple arms that share one artifact and one mechanic", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-shared-arm-"));
    const artifact = path.join(root, "shared.html");
    fs.writeFileSync(artifact, VALID_HTML, "utf8");
    const result = validateFullExperienceReadiness({
      baselineNodes: [
        { id: "route-a", title: "Speed Facts", contentId: "a", mechanic: "fact-retrieval", gameHtmlPath: artifact },
        { id: "route-b", title: "Story Solver", contentId: "b", mechanic: "fact-retrieval", gameHtmlPath: artifact },
      ],
      boardNodes: [],
      publicRoot: root,
    });

    expect(result.failures).toContain("shared_experiment_artifact");
  });

  it("rejects a route fork that does not vary an engagement variable", () => {
    const result = validateFullExperienceReadiness({
      baselineNodes: [
        { id: "route-a", title: "Speed Facts", contentId: "a", mechanic: "speed", engagementVariable: "speed", gameHtmlPath: "/tmp/a" },
        { id: "route-b", title: "Fast Facts", contentId: "b", mechanic: "race", engagementVariable: "speed", gameHtmlPath: "/tmp/b" },
      ],
      boardNodes: [],
      publicRoot: os.tmpdir(),
    });

    expect(result.failures).toContain("route_arms_must_vary_engagement_variable");
  });

  it("rejects route arms that do not hold academic targets and difficulty constant", () => {
    const result = validateFullExperienceReadiness({
      baselineNodes: [
        { id: "route-a", title: "Strategy", contentId: "a", mechanic: "strategy", engagementVariable: "control", targets: ["5x2", "5x5"], difficulty: 2, gameHtmlPath: "/tmp/a" },
        { id: "route-b", title: "Visual", contentId: "b", mechanic: "builder", engagementVariable: "visual", targets: ["5x2"], difficulty: 1, gameHtmlPath: "/tmp/b" },
      ],
      boardNodes: [],
      publicRoot: os.tmpdir(),
    });

    expect(result.failures).toContain("route_arms_must_hold_academic_variables_constant");
  });

  it("rejects duplicate child-facing titles across visible activities", () => {
    const result = validateFullExperienceReadiness({
      baselineNodes: [
        { id: "facts-a", title: "Fact Blaster", contentId: "a", gameHtmlPath: "/tmp/a" },
        { id: "facts-b", title: "Fact Blaster", contentId: "b", gameHtmlPath: "/tmp/b" },
      ],
      boardNodes: [],
      publicRoot: os.tmpdir(),
    });

    expect(result.failures).toContain("duplicate_child_title");
  });

  it("rejects an artifact whose opening identity conflicts with its node contract", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-full-identity-"));
    const artifact = path.join(root, "rocket.html");
    fs.writeFileSync(artifact, VALID_HTML.replace("Fact Blaster", "Rocket Launch Countdown"), "utf8");
    const result = validateFullExperienceReadiness({
      publicRoot: root,
      baselineNodes: [{
        id: "facts",
        title: "Fact Blaster",
        mechanic: "fact-retrieval",
        contentId: "facts-1",
        gameHtmlPath: artifact,
        activityConfigPath: "/config.json",
      }],
      boardNodes: [],
    });
    expect(result.failures).toContain("facts:artifact_title_mismatch");
  });
});
