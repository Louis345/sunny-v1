import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildNodeLaunchAction } from "../shared/homeworkNodeRouting";
import { validateVisualLearnerArtifactConfig } from "../shared/visualLearnerArtifactConfig";

const PROJECT_ROOT = process.cwd();
const ARTIFACT_DIR = join(
  PROJECT_ROOT,
  "web/public/generated/openai-visual-probe/centimeters-vs-inches-1778454253669",
);
const CONFIG_PATH = join(ARTIFACT_DIR, "artifact.config.json");
const HTML_PATH = join(ARTIFACT_DIR, "index.html");
const SHELL_PATH = join(
  PROJECT_ROOT,
  "web/public/generated/openai-visual-probe/artifact-shell.js",
);
const PROBE_SCRIPT_PATH = join(PROJECT_ROOT, "scripts/openaiVisualLearnerProbe.ts");

describe("visual learner artifact config", () => {
  it("catalogs the centimeters artifact with swappable narration and question controls", () => {
    const config = validateVisualLearnerArtifactConfig(
      JSON.parse(readFileSync(CONFIG_PATH, "utf-8")),
    );

    expect(config.artifactId).toBe("centimeters-vs-inches-1778454253669");
    expect(config.type).toBe("visual-explainer");
    expect(config.algorithmTargets).toContain("retrieval_practice");
    expect(config.reuseDecision.status).toBe("candidate");
    expect(config.mode.default).toBe("pause-for-question");
    expect(config.preview.allowPlaythrough).toBe(true);
    expect(config.narration).toMatchObject({
      enabled: true,
      provider: "elevenlabs",
      voiceId: "052jzHJceQiZr7ltnY0C",
      modelId: "eleven_multilingual_v2",
    });
    expect(config.narration.timings.length).toBeGreaterThanOrEqual(4);
    expect(config.questions[0]).toMatchObject({
      targetConcept: "measurement_units",
      pauseAtProgress: 45,
      correctOptionId: "cm",
    });
    expect(config.chrome.childShowsEvidence).toBe(false);
    expect(config.chrome.parentShowsEvidence).toBe(true);
  });

  it("rejects configs without narration audio or prediction options", () => {
    const config = validateVisualLearnerArtifactConfig(
      JSON.parse(readFileSync(CONFIG_PATH, "utf-8")),
    );

    expect(() =>
      validateVisualLearnerArtifactConfig({
        ...config,
        narration: { ...config.narration, audioPath: "" },
      }),
    ).toThrow();
    expect(() =>
      validateVisualLearnerArtifactConfig({
        ...config,
        questions: [{ ...config.questions[0], options: [] }],
      }),
    ).toThrow();
  });
});

describe("visual learner generated HTML artifact", () => {
  it("keeps modal, replay, chrome, and GameBridge behavior in the reusable shell", () => {
    const shell = readFileSync(SHELL_PATH, "utf-8");
    const html = readFileSync(HTML_PATH, "utf-8");

    expect(shell).toContain("window.SunnyVisualLearnerArtifactShell");
    expect(shell).toContain("function resetVisualLearnerRun");
    expect(shell).toContain("function recordPrediction");
    expect(shell).toContain("function completeActivity");
    expect(shell).toContain("function reportCompanionAnchor");
    expect(shell).toContain("GameBridge.reportCompanionAnchor");
    expect(shell).toContain("allowedRole");
    expect(shell).toContain("selectedAnswer");
    expect(shell).toContain("GameBridge.reportAction");
    expect(shell).toContain("activity_target_result");
    expect(shell).toContain("activity_complete");
    expect(shell).toContain("question-active");
    expect(shell).not.toContain("Centimeters vs Inches");
    expect(shell).not.toContain("same pencil");

    expect(html).toContain(
      '<script src="/generated/openai-visual-probe/artifact-shell.js"></script>',
    );
    expect(html).toContain("SunnyVisualLearnerArtifactShell.mount");
    expect(html).not.toContain("function resetVisualLearnerRun");
    expect(html).not.toContain("function recordPrediction");
    expect(html).not.toContain("function completeActivity");
  });

  it("loads the Sunny game contract and emits standardized learning events", () => {
    const html = readFileSync(HTML_PATH, "utf-8");
    const shell = readFileSync(SHELL_PATH, "utf-8");

    expect(html).toContain('<script src="/games/_contract.js"></script>');
    expect(html).not.toContain("URLSearchParams");
    expect(shell).toContain("window.GAME_PARAMS");
    expect(shell).toContain("GameBridge.reportState");
    expect(shell).toContain("GameBridge.reportAction");
    expect(shell).toContain("GameBridge.fireEvent");
    expect(shell).toContain("fireAttemptEvent");
    expect(shell).toContain("activity_target_result");
    expect(shell).toContain("activity_complete");
    expect(shell).toContain("back_to_map");
    expect(shell).toContain("sendNodeComplete");
    expect(shell).toContain("accuracy");
    expect(shell).toContain("flaggedWords");
    expect(shell).toContain("xpEarned");
    expect(shell).toContain("timeSpent_ms");
  });

  it("declutters child mode while preserving parent preview diagnostics", () => {
    const html = readFileSync(HTML_PATH, "utf-8");
    const shell = readFileSync(SHELL_PATH, "utf-8");
    const contract = readFileSync(
      join(PROJECT_ROOT, "web/public/games/_contract.js"),
      "utf-8",
    );

    expect(html).toContain('data-parent-only="care-plan"');
    expect(html).toContain('data-parent-only="narration-debug"');
    expect(html).toContain('data-parent-only="evidence-console"');
    expect(html).toContain('data-parent-only="artifact-debug"');
    expect(html).toContain('data-testid="visual-learner-playthrough-toggle"');
    expect(shell).toContain("applyChromeMode");
    expect(html).toContain("child-mode");
    expect(html).toContain("parent-preview");
    expect(html).toContain("body.child-mode:not(.question-active) .side-stack");
    expect(html).toContain("body.child-mode.question-active .side-stack");
    expect(html).toContain("position:fixed");
    expect(html).toContain("backdrop-filter:blur");
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(shell).toContain("state.revealOpened");
    expect(shell).toContain("state.revealOpened = true");
    expect(shell).toContain("question-active");
    expect(shell).toContain("gameParams.visualLearnerFlowMode");
    expect(contract).toContain("visualLearnerFlowMode");
  });

  it("keeps generated visual learner prompt fixes at the reusable template level", () => {
    const script = readFileSync(PROBE_SCRIPT_PATH, "utf-8");

    expect(script).toContain("Reusable artifact shell requirements");
    expect(script).toContain("Use /generated/openai-visual-probe/artifact-shell.js");
    expect(script).toContain("SunnyVisualLearnerArtifactShell.mount");
    expect(script).toContain("child mode must show the prediction question as a centered modal dialog");
    expect(script).toContain("dismiss the modal immediately and continue the reveal");
    expect(script).toContain("reset prediction state when replaying");
    expect(script).toContain("parent/preview may keep diagnostics in a side rail");
  });
});

describe("visual learner launch routing", () => {
  it("launches a visual-explainer node as an iframe with the artifact config path", () => {
    const action = buildNodeLaunchAction(
      {
        id: "visual-learner-centimeters",
        type: "visual-explainer",
        difficulty: 2,
        activityConfigPath:
          "/generated/openai-visual-probe/centimeters-vs-inches-1778454253669/artifact.config.json",
      },
      {
        childId: "reina",
        childName: "Reina",
        companion: "matilda",
        companionName: "Matilda",
        isDiagMode: true,
        iframePreviewParam: "free",
        companionCurrency: 318,
      },
    );

    expect(action.kind).toBe("iframe");
    if (action.kind !== "iframe") return;
    expect(action.url).toContain(
      "/generated/openai-visual-probe/centimeters-vs-inches-1778454253669/index.html",
    );
    expect(action.url).toContain(
      "config=%2Fgenerated%2Fopenai-visual-probe%2Fcentimeters-vs-inches-1778454253669%2Fartifact.config.json",
    );
    expect(action.url).toContain("childId=reina");
    expect(action.url).toContain("companionName=Matilda");
    expect(action.url).toContain("chrome=parent");
  });

  it("can launch the artifact in child chrome or parent playthrough mode for companion demos", () => {
    const node = {
      id: "visual-learner-centimeters",
      type: "visual-explainer",
      difficulty: 2,
      activityConfigPath:
        "/generated/openai-visual-probe/centimeters-vs-inches-1778454253669/artifact.config.json",
    };

    const childAction = buildNodeLaunchAction(node, {
      childId: "reina",
      childName: "Reina",
      companion: "matilda",
      companionName: "Matilda",
      isDiagMode: true,
      iframePreviewParam: "false",
    });
    expect(childAction.kind).toBe("iframe");
    if (childAction.kind !== "iframe") return;
    expect(childAction.url).toContain("preview=false");
    expect(childAction.url).toContain("chrome=child");
    expect(childAction.url).not.toContain("visualLearnerFlow=playthrough");

    const playthroughAction = buildNodeLaunchAction(node, {
      childId: "reina",
      childName: "Reina",
      companion: "matilda",
      companionName: "Matilda",
      isDiagMode: true,
      iframePreviewParam: "free",
      visualLearnerFlowMode: "playthrough",
    });
    expect(playthroughAction.kind).toBe("iframe");
    if (playthroughAction.kind !== "iframe") return;
    expect(playthroughAction.url).toContain("preview=free");
    expect(playthroughAction.url).toContain("chrome=parent");
    expect(playthroughAction.url).toContain("visualLearnerFlow=playthrough");
  });
});
