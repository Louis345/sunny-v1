import fs from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

describe("SparkOrbEncounterPost Storybook cleanup", () => {
  it("keeps the legacy post-style encounter out of Storybook navigation", () => {
    expect(
      fs.existsSync(resolve(__dirname, "../stories/SparkOrbEncounterPost.stories.tsx")),
    ).toBe(false);
  });
});
