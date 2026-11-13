import fs from "node:fs";
import { configDefaults } from "vitest/config";
import { describe, expect, it } from "vitest";
import { PREDEPLOY_TESTS, testSelection } from "../testTiers";

describe("test tiers", () => {
  it("names only pre-deploy files that exist, so a rename never drops a slow test silently", () => {
    expect(PREDEPLOY_TESTS.length).toBeGreaterThan(0);
    for (const file of PREDEPLOY_TESTS) expect(fs.existsSync(file), file).toBe(true);
  });

  it("everyday runs leave the pre-deploy files out", () => {
    const { include, exclude } = testSelection("everyday", ["src/scripts/*.test.ts"]);
    expect(include).toEqual(["src/scripts/*.test.ts"]);
    expect(exclude).toEqual([...configDefaults.exclude, ...PREDEPLOY_TESTS]);
  });

  it("pre-deploy runs only the slow files", () => {
    const { include, exclude } = testSelection("predeploy", ["src/scripts/*.test.ts"]);
    expect(include).toEqual([...PREDEPLOY_TESTS]);
    expect(exclude).toEqual(configDefaults.exclude);
  });

  it("the full run keeps everything", () => {
    const { include, exclude } = testSelection("all", ["src/scripts/*.test.ts"]);
    expect(include).toEqual(["src/scripts/*.test.ts"]);
    expect(exclude).toEqual(configDefaults.exclude);
  });
});
