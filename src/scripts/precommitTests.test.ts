import { describe, expect, it } from "vitest";
import { planPrecommitTests, precommitVitestArgs } from "./precommitTests";

describe("precommitVitestArgs", () => {
  it("leaves real-browser acceptance journeys to CI in related runs", () => {
    const args = precommitVitestArgs({ mode: "related", files: ["src/server/session-manager.ts"] });
    expect(args.slice(0, 3)).toEqual(["vitest", "related", "--run"]);
    expect(args).toContain("src/server/session-manager.ts");
    expect(args).toEqual(expect.arrayContaining(["--exclude", "**/*Browser*.test.ts"]));
    expect(args).toEqual(expect.arrayContaining(["--exclude", "**/*Acceptance*.test.ts"]));
  });

  it("runs everything, browser journeys included, in full mode", () => {
    expect(precommitVitestArgs({ mode: "full", files: [] })).toEqual(["vitest", "run", "--reporter=dot"]);
  });
});

describe("planPrecommitTests", () => {
  it("runs only root tests related to staged root source files", () => {
    expect(
      planPrecommitTests(["src/server/ws-tts-bridge.ts", "src/server/voiceTurnLatency.test.ts", "README.md"]),
    ).toEqual({
      root: {
        mode: "related",
        files: [
          "src/server/ws-tts-bridge.ts",
          "src/server/voiceTurnLatency.test.ts",
          "src/tests/test-session-manager-lines.ts",
        ],
      },
      web: { mode: "skip", files: [] },
    });
  });

  it("maps staged web files to paths relative to web/", () => {
    expect(planPrecommitTests(["web/src/components/CompanionShowroom.tsx"])).toEqual({
      root: { mode: "skip", files: [] },
      web: { mode: "related", files: ["src/components/CompanionShowroom.tsx"] },
    });
  });

  it("falls back to the full suite when shared config or dependencies change", () => {
    expect(planPrecommitTests(["package-lock.json"]).root.mode).toBe("full");
    expect(planPrecommitTests(["vitest.config.ts"]).root.mode).toBe("full");
    expect(planPrecommitTests(["web/package-lock.json"]).web.mode).toBe("full");
    expect(planPrecommitTests(["web/vitest.config.ts"]).web.mode).toBe("full");
  });

  it("always adds disk-reading budget tests that `vitest related` cannot see", () => {
    // test-session-manager-lines.ts counts lines in session-manager.ts via fs.
    expect(planPrecommitTests(["src/server/session-manager.ts"]).root).toEqual({
      mode: "related",
      files: ["src/server/session-manager.ts", "src/tests/test-session-manager-lines.ts"],
    });
  });

  it("does not run the full suite for a package.json script-only edit", () => {
    expect(planPrecommitTests(["package.json"]).root.mode).toBe("skip");
  });

  it("runs the full suite when forced", () => {
    expect(planPrecommitTests(["README.md"], { forceFull: true })).toEqual({
      root: { mode: "full", files: [] },
      web: { mode: "full", files: [] },
    });
  });

  it("skips tests when nothing testable is staged", () => {
    expect(planPrecommitTests(["docs/notes.md"])).toEqual({
      root: { mode: "skip", files: [] },
      web: { mode: "skip", files: [] },
    });
  });
});
