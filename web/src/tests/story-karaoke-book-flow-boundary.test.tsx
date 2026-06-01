import { describe, expect, it } from "vitest";
import meta, * as StoryKaraokeStories from "../stories/StoryKaraoke.stories";

describe("Story Karaoke book-flow boundary", () => {
  it("does not expose the rhythm sprint playground or controls", () => {
    expect(StoryKaraokeStories).not.toHaveProperty("RhythmPlayground");
    expect(Object.keys(meta.argTypes ?? {})).toEqual(["state"]);
  });
});
