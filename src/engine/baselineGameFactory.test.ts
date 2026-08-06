import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  attachBaselineShellToHomework,
  baselineGenerationAttemptLimit,
  catalogBaselineShellArtifact,
  refillBaselineLaneConfigs,
  refillBaselineShellConfig,
  type BaselineShellArtifact,
} from "./baselineGameFactory";
import type { BaselineMechanicBrief } from "./baselineMechanicBrief";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const brief: BaselineMechanicBrief = {
  briefId: "brief-1",
  title: "Fraction Builder",
  mechanic: "Drag shapes",
  theme: "builder",
  domain: "math",
  skillTarget: "fraction_reasoning",
  engagementWrapper: "builder puzzle",
  controlledExperiment: { engagementVariable: "visual", holdConstant: ["academic targets"] },
  experienceLoop: { childAction: "Drag a shape.", worldReaction: "The structure grows.", anticipation: "The next section appears.", rewardMoment: "The finished structure animates." },
  deterministicMath: { source: "activity-config", artworkMayDefineQuantities: false },
  sfxContract: ["tap", "correct", "incorrect", "progress", "complete"],
  recentThemeExclusions: [],
  configInjection: {
    configUrlParam: "config",
    requiredFields: ["rounds"],
    description: "config url",
  },
  evidenceContract: {
    gameStateUpdate: true,
    attemptEvents: true,
    targetResults: true,
    completionSummary: true,
  },
  guardPushback: {
    behavior: "coach",
    tone: "firm-but-playful",
    mustNotRevealAnswer: true,
  },
  companionRules: {
    sunnyCompanionAnchor: true,
    noInGameCompanionChrome: true,
    fireCompanionEvents: true,
    reportGameState: true,
  },
};

function seedChild(rootDir: string, childId: string): void {
  const base = path.join(rootDir, "src", "context", childId);
  fs.mkdirSync(path.join(base, "homework"), { recursive: true });
  fs.mkdirSync(path.join(base, "plans"), { recursive: true });
  fs.mkdirSync(path.join(base, "care_plan"), { recursive: true });
  fs.writeFileSync(
    path.join(base, "child_profile.json"),
    JSON.stringify({
      childId,
      identity: { displayName: "Demo", ttsName: "Demo" },
      chartLinks: {
        learningProfile: "learning_profile.json",
        wordBank: "word_bank.json",
        factBank: "fact_bank.json",
        currentHomework: "homework/current.json",
        currentSessionPlan: "plans/active_session_plan.json",
        currentCarePlan: "care_plan/current.json",
        contentCatalog: "content_catalog.json",
      },
    }),
    "utf8",
  );
  const pendingHomework = {
    homeworkId: "hw-math-test",
    weekOf: "2026-07-10",
    generatedAt: new Date().toISOString(),
    wordList: [],
    testDate: null,
    nodes: [
      {
        id: "node-baseline",
        type: "generated-baseline",
        words: ["1/3"],
        difficulty: 1,
        gameFile: null,
        storyFile: null,
      },
    ],
  };
  fs.writeFileSync(
    path.join(base, "learning_profile.json"),
    JSON.stringify({ childId, pendingHomework, aiContentCatalog: [] }),
    "utf8",
  );
  fs.writeFileSync(path.join(base, "homework/current.json"), JSON.stringify({ version: 1, childId, current: pendingHomework, activeByDomain: {}, updatedAt: new Date().toISOString() }), "utf8");
  fs.writeFileSync(path.join(base, "content_catalog.json"), JSON.stringify({ version: 1, childId, items: [], updatedAt: new Date().toISOString() }), "utf8");
  fs.writeFileSync(path.join(base, "word_bank.json"), JSON.stringify({ childId, version: 1, words: [] }), "utf8");
  fs.writeFileSync(path.join(base, "fact_bank.json"), JSON.stringify({ childId, version: 1, lastUpdated: "", facts: [] }), "utf8");
}

describe("baseline shell attach + refill", () => {
  it("allows a generated activity to repair both static and runtime contract failures", () => {
    expect(baselineGenerationAttemptLimit()).toBeGreaterThanOrEqual(3);
  });

  it("does not retain a generic HTML renderer or runtime fallback for homework generation", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/baselineGameFactory.ts"), "utf8");
    expect(source).not.toContain("function defaultBaselineHtml");
    expect(source).not.toContain("runtime-fallback");
  });

  it("catalogs generated content with the theory decision that authorized it", () => {
    const artifact: BaselineShellArtifact = {
      contentId: "hw-math-test:generated-baseline:brief-1",
      briefId: "brief-1",
      filename: "shell.html",
      filePath: "/tmp/shell.html",
      gameHtmlPath: "/tmp/shell.html",
      artifactStatus: "approved_ready",
      brief,
    };
    const item = catalogBaselineShellArtifact({
      artifact,
      childId: "reina",
      homeworkId: "hw-math-test",
      evidenceUsed: ["assignment-source"],
      theoryDecisionId: "theory:plan-math-1",
    });
    expect(item.theoryDecisionId).toBe("theory:plan-math-1");
  });

  it("attachBaselineShellToHomework writes gameHtmlPath onto generated-baseline node", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-baseline-attach-"));
    tempDirs.push(rootDir);
    const childId = "demo-pashley";
    seedChild(rootDir, childId);
    const shellPath = path.join(rootDir, "src", "context", childId, "homework", "games", "shell.html");
    fs.mkdirSync(path.dirname(shellPath), { recursive: true });
    fs.writeFileSync(shellPath, "<html></html>", "utf8");
    const artifact: BaselineShellArtifact = {
      contentId: "hw-math-test:generated-baseline:brief-1",
      briefId: "brief-1",
      filename: "shell.html",
      filePath: shellPath,
      gameHtmlPath: shellPath,
      artifactStatus: "approved_ready",
      brief,
    };

    attachBaselineShellToHomework({
      rootDir,
      childId,
      artifact,
      activityConfigPath: "/api/activity-config/demo-pashley/hw-math-test/generated-baseline.json",
    });

    const profile = JSON.parse(
      fs.readFileSync(path.join(rootDir, "src", "context", childId, "learning_profile.json"), "utf8"),
    );
    const node = profile.pendingHomework.nodes.find((entry: { type: string }) => entry.type === "generated-baseline");
    expect(node.gameHtmlPath).toBe(shellPath);
    expect(node.activityConfigPath).toContain("hw-math-test");
    expect(node.artifactStatus).toBe("approved_ready");
  });

  it("refillBaselineShellConfig mixes homework rounds with due facts", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-baseline-refill-"));
    tempDirs.push(rootDir);
    const childId = "demo-pashley";
    seedChild(rootDir, childId);
    const factBankPath = path.join(rootDir, "src", "context", childId, "fact_bank.json");
    const today = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(
      factBankPath,
      JSON.stringify({
        childId,
        version: 1,
        lastUpdated: today,
        facts: [
          {
            factId: "5x2::10",
            prompt: "5 x 2",
            answer: "10",
            domain: "math",
            tracks: { math: { interval: 1, easinessFactor: 2.5, nextReviewDate: today } },
          },
        ],
      }),
      "utf8",
    );

    const out = refillBaselineShellConfig({
      rootDir,
      childId,
      shell: { activityId: "generated-baseline", nodeType: "generated-baseline", source: "generated_shell", gameHtmlPath: "/tmp/shell.html" },
      homeworkId: "hw-math-test",
      title: "Multiplication",
      homeworkRounds: [{ id: "q1", prompt: "2 x 3", options: [{ id: "a", label: "6", correct: true }] }],
    });

    const config = JSON.parse(fs.readFileSync(out.configPath, "utf8"));
    expect(config.rounds.length).toBeGreaterThan(1);
    expect(config.dueFactIds).toContain("5x2::10");
  });

  it("refillBaselineLaneConfigs writes one concept-matched config per generated-baseline node", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-baseline-lanes-"));
    tempDirs.push(rootDir);
    const childId = "demo-pashley";
    seedChild(rootDir, childId);

    const laneConfigs = refillBaselineLaneConfigs({
      rootDir,
      childId,
      homeworkId: "hw-math-test",
      title: "Time and Money",
      homeworkRounds: [
        { id: "t1", prompt: "What time does the clock show?", options: [{ id: "a", label: "2:30", correct: true }] },
        { id: "m1", prompt: "How many cents are 2 quarters?", options: [{ id: "a", label: "50", correct: true }] },
      ],
      nodes: [
        { id: "node-time", type: "generated-baseline", title: "Clock Detective", words: ["What time is shown on the clock? 2:30"] },
        { id: "node-money", type: "generated-baseline", title: "Coin Counter", words: ["Sara has 2 quarters. How much money?"] },
        { id: "node-mystery", type: "mystery", words: [] },
      ],
    });

    expect(Object.keys(laneConfigs).sort()).toEqual(["node-money", "node-time"]);
    expect(laneConfigs["node-time"]).toContain("generated-baseline-node-time.json");

    const timeConfig = JSON.parse(fs.readFileSync(
      path.join(rootDir, "src", "context", childId, "homework", "games", "hw-math-test", "generated-baseline-node-time.json"),
      "utf8",
    ));
    const moneyConfig = JSON.parse(fs.readFileSync(
      path.join(rootDir, "src", "context", childId, "homework", "games", "hw-math-test", "generated-baseline-node-money.json"),
      "utf8",
    ));
    expect(timeConfig.rounds.map((round: { id: string }) => round.id)).toContain("t1");
    expect(timeConfig.rounds.map((round: { id: string }) => round.id)).not.toContain("m1");
    expect(moneyConfig.rounds.map((round: { id: string }) => round.id)).toContain("m1");
    expect(moneyConfig.rounds.map((round: { id: string }) => round.id)).not.toContain("t1");
    expect(timeConfig.topic).toBe("Clock Detective");
    expect(moneyConfig.topic).toBe("Coin Counter");
    expect(timeConfig.assignmentTitle).toBe("Time and Money");
  });

  it("attachBaselineShellToHomework applies per-node config paths when provided", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-baseline-attach-lanes-"));
    tempDirs.push(rootDir);
    const childId = "demo-pashley";
    seedChild(rootDir, childId);
    const base = path.join(rootDir, "src", "context", childId);
    const profile = JSON.parse(fs.readFileSync(path.join(base, "learning_profile.json"), "utf8"));
    profile.pendingHomework.nodes = [
      { id: "node-a", type: "generated-baseline", words: [], difficulty: 1, gameFile: null, storyFile: null },
      { id: "node-b", type: "generated-baseline", words: [], difficulty: 1, gameFile: null, storyFile: null },
    ];
    fs.writeFileSync(path.join(base, "learning_profile.json"), JSON.stringify(profile), "utf8");
    fs.writeFileSync(
      path.join(base, "homework/current.json"),
      JSON.stringify({ version: 1, childId, current: profile.pendingHomework, activeByDomain: {}, updatedAt: new Date().toISOString() }),
      "utf8",
    );
    const shellPath = path.join(base, "homework", "games", "shell.html");
    fs.mkdirSync(path.dirname(shellPath), { recursive: true });
    fs.writeFileSync(shellPath, "<html></html>", "utf8");

    attachBaselineShellToHomework({
      rootDir,
      childId,
      artifact: {
        contentId: "hw-math-test:generated-baseline:brief-1",
        briefId: "brief-1",
        filename: "shell.html",
        filePath: shellPath,
        gameHtmlPath: shellPath,
        artifactStatus: "approved_ready",
        brief,
      },
      activityConfigPath: "/api/activity-config/demo-pashley/hw-math-test/generated-baseline.json",
      configPathByNodeId: {
        "node-a": "/api/activity-config/demo-pashley/hw-math-test/generated-baseline-node-a.json",
        "node-b": "/api/activity-config/demo-pashley/hw-math-test/generated-baseline-node-b.json",
      },
    });

    const next = JSON.parse(fs.readFileSync(path.join(base, "learning_profile.json"), "utf8"));
    const nodeA = next.pendingHomework.nodes.find((entry: { id: string }) => entry.id === "node-a");
    const nodeB = next.pendingHomework.nodes.find((entry: { id: string }) => entry.id === "node-b");
    expect(nodeA.activityConfigPath).toContain("node-a.json");
    expect(nodeB.activityConfigPath).toContain("node-b.json");
    expect(nodeA.gameHtmlPath).toBe(shellPath);
  });

  function seedTwoNodeChild(rootDir: string, childId: string): string {
    seedChild(rootDir, childId);
    const base = path.join(rootDir, "src", "context", childId);
    const profile = JSON.parse(fs.readFileSync(path.join(base, "learning_profile.json"), "utf8"));
    profile.pendingHomework.nodes = [
      { id: "node-a", type: "generated-baseline", words: [], difficulty: 1, gameFile: null, storyFile: null },
      { id: "node-b", type: "generated-baseline", words: [], difficulty: 1, gameFile: null, storyFile: null },
    ];
    fs.writeFileSync(path.join(base, "learning_profile.json"), JSON.stringify(profile), "utf8");
    fs.writeFileSync(
      path.join(base, "homework/current.json"),
      JSON.stringify({ version: 1, childId, current: profile.pendingHomework, activeByDomain: {}, updatedAt: new Date().toISOString() }),
      "utf8",
    );
    return base;
  }

  function shellArtifact(base: string, filename: string, briefId: string): BaselineShellArtifact {
    const shellPath = path.join(base, "homework", "games", filename);
    fs.mkdirSync(path.dirname(shellPath), { recursive: true });
    fs.writeFileSync(shellPath, "<html></html>", "utf8");
    return {
      contentId: `hw-math-test:generated-baseline:${briefId}`,
      briefId,
      filename,
      filePath: shellPath,
      gameHtmlPath: shellPath,
      artifactStatus: "approved_ready",
      brief: { ...brief, briefId },
    };
  }

  it("attachBaselineShellToHomework stamps a distinct shell per node via artifactByNodeId", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-baseline-per-node-"));
    tempDirs.push(rootDir);
    const childId = "demo-pashley";
    const base = seedTwoNodeChild(rootDir, childId);
    const shellA = shellArtifact(base, "shell-a.html", "brief-a");
    const shellB = shellArtifact(base, "shell-b.html", "brief-b");

    attachBaselineShellToHomework({
      rootDir,
      childId,
      artifact: shellA,
      activityConfigPath: "/api/activity-config/demo-pashley/hw-math-test/generated-baseline.json",
      artifactByNodeId: { "node-a": shellA, "node-b": shellB },
    });

    const next = JSON.parse(fs.readFileSync(path.join(base, "learning_profile.json"), "utf8"));
    const nodeA = next.pendingHomework.nodes.find((entry: { id: string }) => entry.id === "node-a");
    const nodeB = next.pendingHomework.nodes.find((entry: { id: string }) => entry.id === "node-b");
    expect(nodeA.gameHtmlPath).toBe(shellA.gameHtmlPath);
    expect(nodeB.gameHtmlPath).toBe(shellB.gameHtmlPath);
    expect(nodeA.gameHtmlPath).not.toBe(nodeB.gameHtmlPath);
    const catalogIds = (next.aiContentCatalog ?? []).map((item: { contentId: string }) => item.contentId);
    expect(catalogIds).toContain(shellA.contentId);
    expect(catalogIds).toContain(shellB.contentId);
  });

  it("attachBaselineShellToHomework leaves out-of-scope nodes untouched with onlyNodeIds", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-baseline-only-nodes-"));
    tempDirs.push(rootDir);
    const childId = "demo-pashley";
    const base = seedTwoNodeChild(rootDir, childId);
    const shellA = shellArtifact(base, "shell-a.html", "brief-a");
    attachBaselineShellToHomework({
      rootDir,
      childId,
      artifact: shellA,
      activityConfigPath: "/api/activity-config/demo-pashley/hw-math-test/generated-baseline.json",
      artifactByNodeId: { "node-a": shellA },
      onlyNodeIds: ["node-a"],
    });

    const shellShared = shellArtifact(base, "shell-shared.html", "reuse");
    attachBaselineShellToHomework({
      rootDir,
      childId,
      artifact: shellShared,
      activityConfigPath: "/api/activity-config/demo-pashley/hw-math-test/generated-baseline.json",
      onlyNodeIds: ["node-b"],
    });

    const next = JSON.parse(fs.readFileSync(path.join(base, "learning_profile.json"), "utf8"));
    const nodeA = next.pendingHomework.nodes.find((entry: { id: string }) => entry.id === "node-a");
    const nodeB = next.pendingHomework.nodes.find((entry: { id: string }) => entry.id === "node-b");
    expect(nodeA.gameHtmlPath).toBe(shellA.gameHtmlPath);
    expect(nodeB.gameHtmlPath).toBe(shellShared.gameHtmlPath);
  });

  it("refillBaselineLaneConfigs prefers planner rounds and honors the domain param", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-baseline-planner-rounds-"));
    tempDirs.push(rootDir);
    const childId = "demo-pashley";
    seedChild(rootDir, childId);

    const laneConfigs = refillBaselineLaneConfigs({
      rootDir,
      childId,
      homeworkId: "hw-sci-test",
      title: "Water Cycle",
      domain: "science",
      homeworkRounds: [
        { id: "fallback", prompt: "5 x 2 = ?", options: [{ id: "a", label: "10", correct: true }] },
      ],
      roundsByNodeId: {
        "node-cycle": [
          { id: "p1", prompt: "What comes after evaporation?", options: [
            { id: "a", label: "Condensation", correct: true },
            { id: "b", label: "Runoff", correct: false },
          ] },
        ],
      },
      nodes: [{ id: "node-cycle", type: "generated-baseline", words: ["evaporation"] }],
    });

    expect(laneConfigs["node-cycle"]).toContain("generated-baseline-node-cycle.json");
    const config = JSON.parse(fs.readFileSync(
      path.join(rootDir, "src", "context", childId, "homework", "games", "hw-sci-test", "generated-baseline-node-cycle.json"),
      "utf8",
    ));
    expect(config.domain).toBe("science");
    expect(config.rounds.map((round: { id: string }) => round.id)).toContain("p1");
    expect(config.rounds.map((round: { id: string }) => round.id)).not.toContain("fallback");
  });
});
