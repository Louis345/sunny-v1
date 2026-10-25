import {readVerifiedSpellingResponseMode} from "../profiles/childChart";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { recordChoiceEvent } from "./choiceEvents";
import { buildChildExperiencePacket } from "../profiles/childExperiencePacket";

describe("buildChildExperiencePacket", () => {
  it("presents remaining checkpoint cards as practice after the spelling evidence batch closes", () => {
    const packet=buildChildExperiencePacket({childId:"lab",companion:{},homework:{},learningCycle:{
      domain:"spelling",homeworkId:"hw",revision:2,lifecycle:"baseline_evaluating",observations:[],decisionHistory:[],
      boards:[{boardId:"b",kind:"teaching",nodeIds:["later"],publishedAt:"2026-10-20T12:00:00Z"}],
      nodes:[{nodeId:"later",role:"baseline",state:"ready",evidenceContract:{spellingItems:{i:{id:"i",word:"night",lineage:{measurementRole:"fresh_checkpoint"},response:{acceptedForms:["night"]}}}}}],
    }} as never);
    expect(packet.spellingInstruments?.later).toMatchObject({assessment:false,items:[{itemId:"i",display:"night"}]});
  });
  it("projects saved evaluation correctness without grading missing answers or practice", () => {
    const chart = { childId: "lab", companion: {}, homework: {}, learningCycle: {
      domain: "spelling", homeworkId: "hw", lifecycle: "targeted_planning", revision: 2,
      nodes: [{ nodeId: "eval", role: "evaluation", evidenceContract: { spellingItems: Object.fromEntries(
        ["night", "light", "bright"].map(word => [word, { id: word, word, lineage: { measurementRole: "independent_probe" }, response: { acceptedForms: [word] } }])) } }],
      observations: [
        { itemId: "night", sourceId: "evaluation:eval", result: { correct: true } },
        { itemId: "light", sourceId: "evaluation:eval", result: { correct: false } },
        { itemId: "bright", sourceId: "evaluation:eval", result: { observedErrorType: "not_sure" } },
        { itemId: "light", sourceId: "activity:practice:recall", result: { correct: true } },
      ],
    } };
    expect(buildChildExperiencePacket(chart as never).spellingEvaluationResults).toEqual([
      { display: "night", correct: true }, { display: "light", correct: false }, { display: "bright" },
    ]);
    expect(buildChildExperiencePacket({ ...chart, learningCycle: { ...chart.learningCycle, lifecycle: "evaluation_active" } } as never).spellingEvaluationResults).toBeUndefined();
  });
  it("projects the displayed canonical board kind independent of the plan ID", () => {
    const packet=buildChildExperiencePacket({childId:"lab", companion:{}, homework:{},
      learningCycle:{homeworkId:"hw", revision:2, lifecycle:"evaluation_ready", nodes:[], observations:[], boards:[{boardId:"hw:board:1",kind:"probe"}]},
      activeSessionPlan:{planId:"learning-cycle:hw:cycle-r2",nodePlan:[],adventureBoard:{boardId:"hw:board:1",nodes:[]}},
    } as never);
    expect(packet.childChart.learningCycle).toHaveProperty("boardKind","probe");
  });
  it("launches a legacy spelling node with its verified Planner response mode", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-spelling-mode-"));
    const artifact = { version: 1, node: { id: "teach-long-o", type: "word-radar", wordRadarConfig: {
      recallMode: "visible_read", inputMode: "whole-word", speakStyle: "option-a",
      showTimer: false, hideWordDuringResponse: false, requiresCapturedResponse: true,
    } } };
    const fingerprint = createHash("sha256").update(JSON.stringify(artifact)).digest("hex");
    const artifactPath = path.join(rootDir, "src/context/lab/homework/direct-drafts/hw/native-instruments/teach-long-o.json");
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, JSON.stringify(artifact));
    const chart = {
      childId: "lab", rootDir, identity: {}, companion: { presetId: "elli", displayName: "Elli", config: {} },
      companionCare: {}, economy: {}, adventureMapProfile: {}, homework: { selectedDomain: "spelling" },
      learningCycle: { domain: "spelling", homeworkId: "hw", revision: 1, lifecycle: "board_ready", observations: [], nodes: [{
        nodeId: "teach-long-o", role: "baseline", state: "ready", implementationType: "word-radar",
        evidenceContract: { spellingItems: {} },
        artifactBinding: { validationStatus: "passed", contractFingerprint: fingerprint,
          localArtifactPath: "/homework/direct-drafts/hw/native-instruments/teach-long-o.json" },
      }] },
      activeSessionPlan: { planId: "hw", activeHomeworkId: "hw", nodePlan: [{
        id: "teach-long-o", type: "word-radar", activityId: "word-radar", targets: ["broken"],
      }] },
    };

    const hydrated = {...chart,activeSessionPlan:readVerifiedSpellingResponseMode(chart as never,chart.activeSessionPlan as never)};
    expect(buildChildExperiencePacket(hydrated as never).activeSessionPlan?.nodePlan[0]?.wordRadarConfig).toEqual(artifact.node.wordRadarConfig);
    // An altered file is never trusted: that one activity cannot launch, and the chart still opens.
    fs.writeFileSync(artifactPath, JSON.stringify({ ...artifact, node: { ...artifact.node, wordRadarConfig: { ...artifact.node.wordRadarConfig, recallMode: "full_recall" } } }));
    const altered = readVerifiedSpellingResponseMode(chart as never,chart.activeSessionPlan as never)!;
    expect(altered.nodePlan[0]).toMatchObject({ id: "teach-long-o", locked: true });
    expect(altered.nodePlan[0]).not.toHaveProperty("wordRadarConfig");
  });
  // 2026-10-25 human catch (Saori): Reina's October Discovery was saved by older Sunny as a Discovery
  // config at the draft root, not a Word Radar node file. The Oct 10 check threw on it, so her whole
  // chart refused to load and no new homework could start. Logs named the node; the lab never loaded a
  // chart written by an older Sunny. One unverifiable old activity is locked; the chart always opens.
  it("locks one unverifiable old activity instead of refusing the whole chart", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-legacy-discovery-"));
    const legacy = path.join(rootDir, "src/context/lab/homework/direct-drafts/hw/spelling-discovery-config.json");
    fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(legacy, JSON.stringify({ version: 1, mode: "independent_spelling_discovery", items: [], contractHash: "old" }));
    const chart = { childId: "lab", rootDir, learningCycle: { domain: "spelling", homeworkId: "hw", nodes: [
      { nodeId: "hw:discovery", role: "evaluation", state: "completed", implementationType: "word-radar", evidenceContract: { spellingItems: {} },
        artifactBinding: { validationStatus: "passed", contractFingerprint: "f".repeat(64), localArtifactPath: legacy } },
      { nodeId: "other", role: "baseline", state: "ready", implementationType: "word-radar", evidenceContract: { spellingItems: {}, nativeConfig: { activityId: "word-radar" } } },
    ] } };
    const plan = { planId: "hw", activeHomeworkId: "hw", nodePlan: [{ id: "hw:discovery", type: "word-radar" }, { id: "other", type: "word-radar" }] };
    const read = readVerifiedSpellingResponseMode(chart as never, plan as never)!;
    expect(read.nodePlan[0]).toMatchObject({ id: "hw:discovery", locked: true });
    expect(read.nodePlan[1]).toEqual(plan.nodePlan[1]);
  });
  it("replays a completed recall check as practice rather than resubmitting the assessment", () => {
    const packet = buildChildExperiencePacket({ childId: "lab", companion: {}, homework: {}, learningCycle: { domain: "spelling", homeworkId: "hw", revision: 1, lifecycle: "board_ready", observations: [{ itemId: "i1" }], nodes: [{ nodeId: "check", role: "baseline", state: "completed", evidenceContract: { spellingItems: { i1: { id: "i1", word: "night", lineage: { measurementRole: "fresh_checkpoint" }, response: { acceptedForms: ["night"] } } } } }] } } as never);
    expect(packet.spellingInstruments?.check).toMatchObject({ assessment: false, items: [{ itemId: "i1" }] });
  });
  it("projects unfinished targeted recall from frozen item identities, not reconstructed words", () => {
    const packet = buildChildExperiencePacket({ childId: "lab", companion: {}, homework: {}, learningCycle: { domain: "spelling", homeworkId: "hw", revision: 1, lifecycle: "board_ready", observations: [{ itemId: "i1", childResponse: "private" }], nodes: [{ nodeId: "check", role: "baseline", state: "active", evidenceContract: { spellingItems: { i1: { id: "i1", word: "night", lineage: { measurementRole: "fresh_checkpoint" }, response: { acceptedForms: ["night"] } }, i2: { id: "i2", word: "light", lineage: { measurementRole: "fresh_checkpoint" }, response: { acceptedForms: ["light"] } } } } }] } } as never);
    expect(packet.spellingInstruments?.check).toMatchObject({ assessment: true, items: [{ itemId: "i2", display: "light" }] });
    expect(JSON.stringify(packet)).not.toContain("private");
  });
  it("projects frozen spelling recall identities without sharing raw responses", () => {
    const packet = buildChildExperiencePacket({ childId: "lab-child", companion: {}, homework: {}, learningCycle: { domain: "spelling", homeworkId: "hw", revision: 1, lifecycle: "evaluation_active", observations: [{ itemId: "i1", childResponse: "private response" }], nodes: [{ nodeId: "opening", role: "evaluation", evidenceContract: { spellingItems: { i1: { id: "i1", word: "night", response: { acceptedForms: ["night"] } }, i2: { id: "i2", word: "light", response: { acceptedForms: ["light"] } } } } }] } } as never);
    expect(packet.spellingDiscovery).toEqual({ nodeId: "opening", items: [{ itemId: "i2", display: "light", acceptedResponses: ["light"], label: "Spelling", subject: "spelling" }] });
    expect(JSON.stringify(packet)).not.toContain("private response");
  });
  it("projects the active homework identity onto generated playable nodes", () => {
    const packet = buildChildExperiencePacket({
      childId: "reina",
      identity: { displayName: "Reina" },
      companion: { presetId: "elli", displayName: "Elli", config: {} },
      companionCare: {},
      economy: {},
      adventureMapProfile: {},
      homework: { selectedDomain: "math" },
      activeSessionPlan: {
        planId: "published-math-board",
        activeHomeworkId: "hw-math-cycle",
        nodePlan: [{
          id: "comet-check",
          type: "generated-baseline",
          activityId: "generated-baseline",
          targets: [],
          difficulty: 1,
          source: "chart_planner",
          gameHtmlPath: "/games/comet-check.html",
        }],
      },
    } as never);

    expect(packet.activeSessionPlan?.nodePlan[0]?.date).toBe("hw-math-cycle");
  });

  it("prefers the compiled selected-domain active session board over stale chart board data", () => {
    const packet = buildChildExperiencePacket({
      childId: "ila",
      identity: { childId: "ila", displayName: "Ila" },
      companion: { presetId: "elli", displayName: "Elli", config: {} },
      companionCare: {},
      economy: {},
      adventureMapProfile: {},
      homework: { selectedDomain: "spelling" },
      activeSessionPlan: {
        planId: "stale-homework-board",
        adventureBoard: {
          boardId: "stale-linear-board",
          nodes: [{ id: "node-wr-sl-scaffold" }, { id: "node-mystery" }],
          choiceSets: [],
        },
      },
      activeSessionPlanByDomain: {
        spelling: {
          planId: "compiled-spelling-board",
          adventureBoard: {
            boardId: "compiled-route-board",
            nodes: [
              { id: "node-wr-sl-scaffold" },
              { id: "choose-path" },
              { id: "node-sc-sl-probe" },
              { id: "node-sc-hfw-probe" },
            ],
            choiceSets: [{
              id: "baseline-route-options",
              kind: "baseline-route",
              options: [
                { id: "choice-node-sc-sl-probe", nodeId: "node-sc-sl-probe", label: "Silent Spell" },
                { id: "choice-node-sc-hfw-probe", nodeId: "node-sc-hfw-probe", label: "Sight Spell" },
              ],
            }],
          },
        },
      },
    } as never);

    expect(packet.activeSessionPlan?.planId).toBe("compiled-spelling-board");
    expect(packet.activeSessionPlan?.adventureBoard?.boardId).toBe("compiled-route-board");
    expect(packet.activeSessionPlan?.adventureBoard?.nodes.map((node) => node.id)).toContain("choose-path");
    expect(packet.activeSessionPlan?.adventureBoard?.choiceSets?.map((set) => set.id)).toContain("baseline-route-options");
  });

  it("restores completed direct-board nodes from engagement evidence after reload", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-direct-progress-"));
    recordChoiceEvent({
      eventName: "activity_completed",
      choiceSetId: "post_activity:direct-plan:gearlock",
      childId: "reina",
      sessionId: "direct-plan",
      nodeId: "gearlock",
      context: "homework_required",
      domain: "math",
      shownOptions: [{ optionId: "gearlock:generated-baseline", activityId: "generated-baseline", label: "Gearlock", purposeLabel: "back_to_map" }],
      selectedOptionId: "gearlock:generated-baseline",
      skippedOptionIds: [],
      source: "child_choice",
      completed: true,
      postActivityAction: "back_to_map",
      createdAt: "2026-07-16T12:00:00.000Z",
    }, { rootDir });

    const packet = buildChildExperiencePacket({
      childId: "reina",
      rootDir,
      identity: { displayName: "Reina" },
      companion: { presetId: "elli", displayName: "Elli", config: {} },
      companionCare: {}, economy: {}, adventureMapProfile: {},
      homework: { selectedDomain: "math" },
      activeSessionPlan: {
        planId: "direct-plan",
        activeHomeworkId: "hw-math",
        adventureBoard: {
          schemaVersion: 1,
          boardId: "direct-board",
          planId: "direct-plan",
          childId: "reina",
          domain: "math",
          title: "Math",
          theme: { background: { type: "color", value: "#000" }, palette: { path: "#fff", completed: "#0f0", available: "#00f", locked: "#777", current: "#f90", preview: "#aaa", text: "#fff", panel: "#000" } },
          layout: { preset: "horizontal-adventure-spine" },
          plannerRationale: { agencyDesign: "choice", evidenceDesign: "practice", layoutChoice: "routes" },
          nodes: [{ id: "gearlock", kind: "activity", label: "Gearlock", state: "available", action: { type: "launch-activity", payloadId: "gearlock" } }],
          edges: [],
          companion: { id: "elli", name: "Elli" },
          progress: { completedNodeIds: [] },
        },
      },
    } as never);

    expect(packet.activeSessionPlan?.adventureBoard?.nodes[0]?.state).toBe("completed");
    expect(packet.activeSessionPlan?.adventureBoard?.nodes[0]?.action?.type).toBe("launch-activity");
    expect(packet.activeSessionPlan?.adventureBoard?.progress?.completedNodeIds).toContain("gearlock");
  });

  it("projects a concise gated agency choice with real route previews", () => {
    const board = {
      schemaVersion: 1,
      boardId: "direct:hw-fractions",
      planId: "fractions-plan",
      childId: "reina",
      domain: "math",
      title: "Fractions",
      theme: { background: { type: "color", value: "#000" }, palette: { path: "#fff", completed: "#0f0", available: "#00f", locked: "#777", current: "#f90", preview: "#aaa", text: "#fff", panel: "#000" } },
      layout: { preset: "horizontal-adventure-spine", routeChoiceBehavior: "parallel" },
      plannerRationale: { agencyDesign: "compare routes", evidenceDesign: "held constant", layoutChoice: "fork" },
      nodes: [
        { id: "start", kind: "start", label: "Start", state: "completed" },
        { id: "N1", kind: "activity", label: "Teach", state: "available" },
        { id: "N2", kind: "activity", label: "Guided", state: "available" },
        { id: "choose-path", kind: "choice-gate", label: "Long generated question", state: "available", choiceSetId: "direct-route-choice" },
        { id: "N3A", kind: "activity", label: "Map Maker", state: "available", thumbnailUrl: "/generated/direct-math/N3A-dedicated.jpeg" },
        { id: "N3B", kind: "activity", label: "Slice Sprint", state: "available", thumbnailUrl: "/generated/direct-math/N3B-dedicated.jpeg" },
        { id: "quest", kind: "quest", label: "Quest", state: "locked" },
        { id: "boss", kind: "boss", label: "Boss", state: "locked" },
      ],
      edges: [],
      choiceSets: [{
        id: "direct-route-choice",
        kind: "baseline-route",
        title: "A generated paragraph that should never become the heading",
        options: [
          { id: "route-a", label: "Map Maker", description: "Build fair shares with your own hands — no clock, only sharp eyes, and a wax seal when the cut is true.", state: "available", nodeId: "N3A", thumbnailUrl: "/generated/direct-math/N3A-dedicated.jpeg" },
          { id: "route-b", label: "Slice Sprint", description: "Spot the bigger fair slice before the gull swoops — fast eyes win the crowd, but the bird never steals your turn.", state: "available", nodeId: "N3B", thumbnailUrl: "/generated/direct-math/N3B-dedicated.jpeg" },
        ],
      }],
      companion: { id: "elli", name: "Elli" },
      progress: { completedNodeIds: ["start"] },
    };
    const packet = buildChildExperiencePacket({
      childId: "reina",
      identity: { displayName: "Reina" },
      companion: { presetId: "elli", displayName: "Elli", config: {} },
      companionCare: {}, economy: {}, adventureMapProfile: {},
      homework: { selectedDomain: "math" },
      activeSessionPlan: {
        planId: "fractions-plan",
        activeHomeworkId: "hw-fractions",
        nodePlan: [
          { id: "N1", locked: true },
          { id: "N2", locked: true },
          { id: "N3A", locked: true },
          { id: "N3B", locked: true },
          { id: "quest", locked: true },
          { id: "boss", locked: true },
        ],
        adventureBoard: board,
      },
      learningCycle: {
        homeworkId: "hw-fractions",
        lifecycle: "baseline_active",
        revision: 4,
        agencyExperiment: {
          experimentId: "agency-1",
          sharedNodeIds: ["N1", "N2"],
          routes: [
            { routeId: "route-a", nodeIds: ["N3A"] },
            { routeId: "route-b", nodeIds: ["N3B"] },
          ],
        },
        routeSelection: {
          experimentId: "agency-1",
          selectedRouteId: "route-a",
          selectedAt: "2026-08-02T12:00:00.000Z",
          choiceEventId: "choice-a",
          history: [{ routeId: "route-a", selectedAt: "2026-08-02T12:00:00.000Z", choiceEventId: "choice-a" }],
        },
        nodes: [
          { nodeId: "N1", state: "completed" },
          { nodeId: "N2", state: "completed" },
          { nodeId: "N3A", state: "ready" },
          { nodeId: "N3B", state: "locked" },
          { nodeId: "quest", state: "locked" },
          { nodeId: "boss", state: "locked" },
        ],
      },
    } as never);

    const projected = packet.activeSessionPlan!.adventureBoard!;
    expect(projected.layout?.routeChoiceBehavior).toBe("exclusive");
    expect(projected.choiceSets?.[0]?.title).toBe("Choose your path");
    expect(projected.nodes.find((node) => node.id === "choose-path")?.label).toBe("Change Path");
    expect(projected.nodes.find((node) => node.id === "N3A")?.state).toBe("current");
    expect(projected.nodes.find((node) => node.id === "N3B")?.state).toBe("locked");
    expect(packet.activeSessionPlan?.nodePlan.find((node) => node.id === "N3A")?.locked).toBe(false);
    expect(packet.activeSessionPlan?.nodePlan.find((node) => node.id === "N3B")?.locked).toBe(true);
    expect(projected.choiceSets?.[0]?.options.map((option) => option.thumbnailUrl)).toEqual([
      "/generated/direct-math/N3A-dedicated.jpeg",
      "/generated/direct-math/N3B-dedicated.jpeg",
    ]);
    expect(projected.nodes.find((node) => node.id === "N3A")?.thumbnailUrl).toBe("/generated/direct-math/N3A-dedicated.jpeg");
    expect(projected.nodes.find((node) => node.id === "N3B")?.thumbnailUrl).toBe("/generated/direct-math/N3B-dedicated.jpeg");
    expect(projected.choiceSets?.[0]?.options.map((option) => option.description)).toEqual([
      "Build fair shares with your own hands",
      "Spot the bigger fair slice before the gull swoops",
    ]);
  });

  it("never promotes a blocked first agency node to current", () => {
    const packet = buildChildExperiencePacket({
      childId: "ila",
      identity: { displayName: "Ila" },
      companion: { presetId: "elli", displayName: "Elli", config: {} },
      companionCare: {}, economy: {}, adventureMapProfile: {},
      homework: { selectedDomain: "math" },
      activeSessionPlan: {
        planId: "clock-plan",
        activeHomeworkId: "hw-clock",
        nodePlan: [{ id: "gear-secret", locked: true }],
        adventureBoard: {
          schemaVersion: 1,
          boardId: "clock-board",
          planId: "clock-plan",
          childId: "ila",
          domain: "math",
          title: "Clock",
          theme: { background: { type: "color", value: "#000" }, palette: { path: "#fff", completed: "#0f0", available: "#00f", locked: "#777", current: "#f90", preview: "#aaa", text: "#fff", panel: "#000" } },
          layout: { preset: "horizontal-adventure-spine" },
          plannerRationale: { agencyDesign: "choice", evidenceDesign: "practice", layoutChoice: "route" },
          nodes: [
            { id: "start", kind: "start", label: "Start", state: "completed", action: { type: "none" } },
            { id: "gear-secret", kind: "activity", label: "The Gear Secret", state: "locked", action: { type: "show-locked-reason", payloadId: "gear-secret" }, lock: { reason: "generation-needs-attention", label: "Parent help needed" } },
          ],
          edges: [],
          companion: { id: "elli", name: "Elli" },
          progress: { completedNodeIds: ["start"] },
        },
      },
      learningCycle: {
        homeworkId: "hw-clock",
        lifecycle: "board_ready",
        revision: 8,
        agencyExperiment: {
          experimentId: "clock-agency",
          sharedNodeIds: ["gear-secret"],
          routes: [
            { routeId: "route-a", nodeIds: ["route-a-node"] },
            { routeId: "route-b", nodeIds: ["route-b-node"] },
          ],
        },
        nodes: [
          { nodeId: "gear-secret", state: "blocked" },
          { nodeId: "route-a-node", state: "generating" },
          { nodeId: "route-b-node", state: "generating" },
        ],
      },
    } as never);

    const board = packet.activeSessionPlan!.adventureBoard!;
    expect(board.nodes.find((node) => node.id === "gear-secret")).toMatchObject({
      state: "locked",
      lock: { reason: "generation-needs-attention" },
    });
    expect(packet.activeSessionPlan!.nodePlan.find((node) => node.id === "gear-secret")?.locked).toBe(true);
    expect(board.progress?.currentNodeId).toBeUndefined();
  });
});
