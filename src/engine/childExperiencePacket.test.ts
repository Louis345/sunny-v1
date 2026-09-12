import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { recordChoiceEvent } from "./choiceEvents";
import { buildChildExperiencePacket } from "../profiles/childExperiencePacket";

describe("buildChildExperiencePacket", () => {
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
});
