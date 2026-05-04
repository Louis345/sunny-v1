import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  resolveSunnyRuntimeConfig,
  type SunnyRuntimeConfig,
} from "../utils/runtimeMode";

describe("resolveSunnyRuntimeConfig", () => {
  it("builds a canonical preview inspect-all config from env", () => {
    const cfg = resolveSunnyRuntimeConfig({
      SUNNY_SUBJECT: "homework",
      SUNNY_MODE: "as-child",
      SUNNY_CHILD: "Reina",
      SUNNY_PREVIEW_MODE: "free",
      SUNNY_NODE_ACCESS: "inspect-all",
      SUNNY_VOICE_MODE: "normal",
    });
    expect(cfg).toEqual<SunnyRuntimeConfig>({
      subject: "homework",
      sessionMode: "as-child",
      previewMode: "free",
      nodeAccess: "inspect-all",
      voiceMode: "normal",
      persistenceMode: "blocked",
      childId: "reina",
    });
  });

  it("builds a canonical onboarding board preview config from env", () => {
    const cfg = resolveSunnyRuntimeConfig({
      SUNNY_SUBJECT: "onboarding",
      SUNNY_MODE: "as-child",
      SUNNY_CHILD: "Ila",
      SUNNY_PREVIEW_MODE: "free",
      SUNNY_NODE_ACCESS: "inspect-all",
      SUNNY_VOICE_MODE: "muted",
    });
    expect(cfg).toEqual<SunnyRuntimeConfig>({
      subject: "onboarding",
      sessionMode: "as-child",
      previewMode: "free",
      nodeAccess: "inspect-all",
      voiceMode: "muted",
      persistenceMode: "blocked",
      childId: "ila",
    });
  });

  it("falls back to inspect-all when DIAG_UNLOCK_MAP is true", () => {
    const cfg = resolveSunnyRuntimeConfig({
      SUNNY_MODE: "real",
      SUNNY_SUBJECT: "homework",
      DIAG_UNLOCK_MAP: "true",
    });
    expect(cfg.nodeAccess).toBe("inspect-all");
    expect(cfg.previewMode).toBe("off");
  });
});

describe("package.json runtime launcher scripts", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../../package.json"), "utf-8"),
  ) as { scripts: Record<string, string> };

  it('contains script "sunny:run"', () => {
    expect(pkg.scripts["sunny:run"]).toBeDefined();
  });

  it('contains script "sunny:preview"', () => {
    expect(pkg.scripts["sunny:preview"]).toBeDefined();
  });

  it("contains visual onboarding preview script that delegates to canonical sunny:run", () => {
    expect(pkg.scripts["sunny:mode:onboarding:board"]).toContain("sunny:run");
    expect(pkg.scripts["sunny:mode:onboarding:board"]).toContain("--subject onboarding");
    expect(pkg.scripts["sunny:mode:onboarding:board"]).toContain("--preview free");
    expect(pkg.scripts["sunny:mode:onboarding:board"]).toContain("--node-access inspect-all");
  });

  it('contains script "sunny:homework"', () => {
    expect(pkg.scripts["sunny:homework"]).toBeDefined();
  });

  it("plain sunny runs review mode, while sunny:homework focuses the latest homework", () => {
    expect(pkg.scripts.sunny).toContain("--subject review");
    expect(pkg.scripts["sunny:homework"]).toContain("--subject homework");
  });

  it('contains script "sunny:diag"', () => {
    expect(pkg.scripts["sunny:diag"]).toBeDefined();
  });

  it('preserves the intro/showroom script as a public entry point', () => {
    expect(pkg.scripts["sunny:mode:intro"]).toBeDefined();
    expect(pkg.scripts["sunny:mode:intro"]).toContain("--session-mode intro");
  });

  it("preserves compatibility aliases for existing launch commands", () => {
    expect(pkg.scripts["sunny:homework:preview"]).toBeDefined();
    expect(pkg.scripts["sunny:mode:diag:homework:as-reina"]).toBeDefined();
    expect(pkg.scripts["sunny:mode:reading"]).toBeDefined();
    expect(pkg.scripts["sunny:mode:pronunciation"]).toBeDefined();
  });

  it("sunny:run delegates to the canonical runner", () => {
    expect(pkg.scripts["sunny:run"]).toContain("src/scripts/sunnyRun.ts");
  });

  it("ignores regenerated homework learning-plan audit artifacts", () => {
    const ignore = fs.readFileSync(
      path.join(__dirname, "../../.gitignore"),
      "utf-8",
    );
    expect(ignore).toContain("src/context/*/homework/pending/**/learning-plan.*");
  });

  it("AdventureMap uses profile-configured Word Radar timer seconds instead of hardcoded 10", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../web/src/components/AdventureMap.tsx"),
      "utf-8",
    );
    expect(src).toContain("props.wordRadarFromProfile?.timerSeconds");
    expect(src).not.toContain(
      "timerSeconds={props.wordRadarFromProfile?.showTimer === true ? 10 : undefined}",
    );
  });
});

describe("shared preview launcher", () => {
  it("builds canonical stateless board preview commands", async () => {
    const { buildPreviewBoardCommand, previewBoardPrompt } = await import(
      "../utils/previewLauncher"
    );

    expect(previewBoardPrompt({ childId: "ila", label: "onboarding" })).toContain(
      "Open read-only onboarding board for ila?",
    );
    expect(
      buildPreviewBoardCommand({
        childId: "ila",
        subject: "onboarding",
        sessionMode: "as-child",
        voiceMode: "muted",
      }),
    ).toEqual({
      display:
        "npm run sunny:run -- --subject onboarding --child ila --session-mode as-child --preview free --node-access inspect-all --voice muted",
      command: "npm",
      args: [
        "run",
        "sunny:run",
        "--",
        "--subject",
        "onboarding",
        "--child",
        "ila",
        "--session-mode",
        "as-child",
        "--preview",
        "free",
        "--node-access",
        "inspect-all",
        "--voice",
        "muted",
      ],
    });
  });
});
