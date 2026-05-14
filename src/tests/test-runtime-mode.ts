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
      demoRoute: null,
      childId: "reina",
      homeworkDomain: null,
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
      demoRoute: null,
      childId: "ila",
      homeworkDomain: null,
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

  it("carries the visual explainer demo route through runtime config", () => {
    const cfg = resolveSunnyRuntimeConfig({
      SUNNY_MODE: "diag",
      SUNNY_SUBJECT: "diag",
      SUNNY_PREVIEW_MODE: "free",
      SUNNY_DEMO_ROUTE: "visual-explainer-map",
    });

    expect(cfg.demoRoute).toBe("visual-explainer-map");
    expect(cfg.persistenceMode).toBe("blocked");
  });

  it("carries homework domain intent through runtime config before child selection", () => {
    const cfg = resolveSunnyRuntimeConfig({
      SUNNY_SUBJECT: "homework",
      SUNNY_HOMEWORK_DOMAIN: "spelling",
    });

    expect(cfg.subject).toBe("homework");
    expect(cfg.childId).toBeNull();
    expect(cfg.homeworkDomain).toBe("spelling");
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

  it("contains visual explainer demo script that delegates to canonical sunny:run", () => {
    expect(pkg.scripts["sunny:demo:visual"]).toContain("sunny:run");
    expect(pkg.scripts["sunny:demo:visual"]).toContain("--preview free");
    expect(pkg.scripts["sunny:demo:visual"]).toContain("--voice muted");
    expect(pkg.scripts["sunny:demo:visual"]).toContain("--demo visual-explainer-map");
  });

  it('contains script "sunny:homework"', () => {
    expect(pkg.scripts["sunny:homework"]).toBeDefined();
  });

  it("plain sunny runs review mode, while sunny:homework focuses the latest homework", () => {
    expect(pkg.scripts.sunny).toContain("--subject review");
    expect(pkg.scripts["sunny:homework"]).toContain("--subject homework");
  });

  it("has parent-facing homework domain scripts that delegate to child-picker startup", () => {
    expect(pkg.scripts["sunny:homework:spelling"]).toContain("--subject homework");
    expect(pkg.scripts["sunny:homework:spelling"]).toContain("--homework-domain spelling");
    expect(pkg.scripts["sunny:homework:spelling"]).not.toContain("--child");
    expect(pkg.scripts["sunny:spelling"]).toContain("sunny:homework:spelling");
  });

  it("has parent-facing ingest domain scripts that start intake without child flags", () => {
    expect(pkg.scripts["sunny:ingest:spelling"]).toContain("sunny:ingest:homework");
    expect(pkg.scripts["sunny:ingest:spelling"]).toContain("--domain spelling");
    expect(pkg.scripts["sunny:ingest:spelling"]).not.toContain("--child");
    expect(pkg.scripts["sunny:ingest:reading"]).toContain("--domain reading");
    expect(pkg.scripts["sunny:ingest:math"]).toContain("--domain math");
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
