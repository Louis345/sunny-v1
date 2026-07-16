import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { recordChoiceEvent } from "./choiceEvents";
import { buildChildExperiencePacket } from "../profiles/childExperiencePacket";

describe("buildChildExperiencePacket", () => {
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
});
