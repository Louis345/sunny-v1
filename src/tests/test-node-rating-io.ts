import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import type { NodeRating } from "../shared/adventureTypes";
import {
  appendNodeRating,
  getNodeRatings,
  getNodeRatingsByType,
} from "../utils/nodeRatingIO";

const CHILD = "zq_ratings_qa";
const ROOT = path.resolve(process.cwd(), "src", "context", CHILD);

function rating(
  overrides: Partial<NodeRating> & Pick<NodeRating, "sessionDate" | "word">,
): NodeRating {
  return {
    childId: CHILD,
    sessionDate: overrides.sessionDate,
    nodeType: overrides.nodeType ?? "karaoke",
    word: overrides.word,
    theme: overrides.theme ?? "default",
    rating: overrides.rating ?? "like",
    completionTime_ms: overrides.completionTime_ms ?? 1000,
    accuracy: overrides.accuracy ?? 1,
    abandonedEarly: overrides.abandonedEarly ?? false,
  };
}

describe("nodeRatingIO (TASK-007)", () => {
  beforeAll(() => {
    fs.rmSync(ROOT, { recursive: true, force: true });
  });

  afterAll(() => {
    fs.rmSync(ROOT, { recursive: true, force: true });
  });

  it("appendNodeRating writes under src/context/{childId}/ratings/", async () => {
    const r = rating({ sessionDate: "2026-04-10T10:00:00.000Z", word: "alpha" });
    await appendNodeRating(r);
    const file = path.join(ROOT, "ratings", "2026-04-10.ndjson");
    expect(fs.existsSync(file)).toBe(true);
  });

  it("appendNodeRating is append-only (second line)", async () => {
    await appendNodeRating(
      rating({ sessionDate: "2026-04-10T11:00:00.000Z", word: "beta" }),
    );
    const file = path.join(ROOT, "ratings", "2026-04-10.ndjson");
    const lines = fs.readFileSync(file, "utf-8").trim().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it("getNodeRatings returns chronological order", async () => {
    fs.rmSync(ROOT, { recursive: true, force: true });
    await appendNodeRating(
      rating({ sessionDate: "2026-04-09T12:00:00.000Z", word: "first" }),
    );
    await appendNodeRating(
      rating({ sessionDate: "2026-04-11T12:00:00.000Z", word: "last" }),
    );
    const all = await getNodeRatings(CHILD);
    expect(all.map((x) => x.word)).toEqual(["first", "last"]);
  });

  it("getNodeRatings respects limit (tail)", async () => {
    const limited = await getNodeRatings(CHILD, 1);
    expect(limited.length).toBe(1);
    expect(limited[0].word).toBe("last");
  });

  it("getNodeRatingsByType filters", async () => {
    await appendNodeRating(
      rating({
        sessionDate: "2026-04-12T12:00:00.000Z",
        word: "wb",
        nodeType: "word-builder",
      }),
    );
    const wb = await getNodeRatingsByType(CHILD, "word-builder");
    expect(wb.every((r) => r.nodeType === "word-builder")).toBe(true);
    expect(wb.some((r) => r.word === "wb")).toBe(true);
  });
});
