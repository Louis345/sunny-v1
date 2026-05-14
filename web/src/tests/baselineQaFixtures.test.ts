import { describe, expect, it } from "vitest";
import {
  baselineActivities,
  baselineQaFixtures,
  fixtureStates,
  isStorybookPreview,
  makeIframeGameUrl,
} from "../storybook/baselineQaFixtures";

describe("baseline QA fixture matrix", () => {
  it("defines all first-class baseline instruments with every QA state", () => {
    expect(baselineActivities).toEqual([
      "word-radar",
      "pronunciation",
      "story-karaoke",
      "letter-rush",
      "spell-check",
      "monster-stampede",
    ]);
    expect(fixtureStates).toEqual(["easy", "medium", "hard", "support", "complete"]);

    for (const activityId of baselineActivities) {
      expect(Object.keys(baselineQaFixtures[activityId])).toEqual(fixtureStates);
      for (const state of fixtureStates) {
        const fixture = baselineQaFixtures[activityId][state];
        expect(fixture.activityId).toBe(activityId);
        expect(fixture.state).toBe(state);
        expect(fixture.words.length).toBeGreaterThan(0);
        expect(fixture.title.length).toBeGreaterThan(0);
      }
    }
  });

  it("builds Storybook-only iframe URLs with stable child and fixture params", () => {
    const url = makeIframeGameUrl("monster-stampede", "support");
    expect(url).toContain("/games/monster-stampede.html?");
    expect(url).toContain("preview=storybook");
    expect(url).toContain("fixtureState=support");
    expect(url).toContain("childId=qa");
    expect(url).toContain("nodeId=storybook-monster-stampede-support");
    expect(url).toContain("words=");
  });

  it("guards fixture behavior so it is ignored outside Storybook preview", () => {
    expect(isStorybookPreview(new URLSearchParams("preview=storybook"))).toBe(true);
    expect(isStorybookPreview(new URLSearchParams("preview=true"))).toBe(false);
    expect(isStorybookPreview(new URLSearchParams("fixtureState=complete"))).toBe(false);
  });
});
