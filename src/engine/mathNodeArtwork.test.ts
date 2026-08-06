import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  enrichMathNodeArtwork,
  localizeMathNodeArtwork,
  type MathArtworkNode,
} from "./mathNodeArtwork";

describe("math node artwork", () => {
  it("assigns artwork to each visible node from its own content contract", async () => {
    const calls: string[] = [];
    const result = await enrichMathNodeArtwork<MathArtworkNode>([
      {
        id: "facts-x2",
        type: "generated-baseline",
        title: "2s Fact Blaster",
        mechanic: "fact-retrieval-speed",
        theme: "space arcade",
        targets: ["5x2"],
      },
      {
        id: "story-problems",
        type: "generated-baseline",
        title: "Equal Groups Story",
        mechanic: "equal-groups-story",
        theme: "story mission",
        targets: ["pencils-word-problem"],
      },
    ], async (prompt) => {
      calls.push(prompt);
      return `/generated/reina-math/${calls.length}.png`;
    });

    expect(result.map((node) => node.thumbnailUrl)).toEqual([
      "/generated/reina-math/1.png",
      "/generated/reina-math/2.png",
    ]);
    expect(calls[0]).toContain("2s Fact Blaster");
    expect(calls[1]).toContain("equal-groups-story");
    expect(result.every((node) => node.thumbnailPrompt?.length)).toBe(true);
  });

  it("preserves an existing asset and leaves an explicit fallback when Grok is unavailable", async () => {
    const result = await enrichMathNodeArtwork<MathArtworkNode>([
      {
        id: "facts",
        type: "generated-baseline",
        title: "Fact Blaster",
        thumbnailUrl: "/generated/existing.png",
        targets: ["5x2"],
      },
      {
        id: "story",
        type: "generated-baseline",
        title: "Story Solver",
        targets: ["pencils-word-problem"],
      },
    ], async () => null);

    expect(result[0]?.thumbnailUrl).toBe("/generated/existing.png");
    expect(result[1]?.thumbnailUrl).toBeUndefined();
    expect(result[1]?.thumbnailPrompt).toContain("Story Solver");
  });

  it("downloads provider artwork to a stable Sunny-owned path", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-node-art-"));
    const result = await localizeMathNodeArtwork<MathArtworkNode>([
      {
        id: "fact/blaster",
        type: "generated-baseline",
        title: "Fact Blaster",
        targets: ["5x2"],
        thumbnailUrl: "https://imgen.x.ai/temporary.jpeg",
      },
    ], {
      rootDir,
      childId: "reina",
      homeworkId: "hw-math-cycle",
      download: async () => ({ bytes: Buffer.from("stable-image"), contentType: "image/jpeg" }),
    });

    expect(result[0]?.thumbnailUrl).toBe("/generated/reina/hw-math-cycle/fact-blaster.jpeg");
    expect(fs.readFileSync(path.join(
      rootDir,
      "web/public/generated/reina/hw-math-cycle/fact-blaster.jpeg",
    ), "utf8")).toBe("stable-image");
  });

  it("removes an unusable temporary URL instead of persisting it as artwork", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-node-art-fail-"));
    const result = await localizeMathNodeArtwork<MathArtworkNode>([
      {
        id: "facts",
        type: "generated-baseline",
        title: "Fact Blaster",
        targets: ["5x2"],
        thumbnailUrl: "https://imgen.x.ai/expired.jpeg",
      },
    ], {
      rootDir,
      childId: "reina",
      homeworkId: "hw-math-cycle",
      download: async () => null,
    });

    expect(result[0]?.thumbnailUrl).toBeUndefined();
  });
});
