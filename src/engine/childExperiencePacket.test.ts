import { describe, expect, it } from "vitest";
import { buildChildExperiencePacket } from "../profiles/childExperiencePacket";

describe("buildChildExperiencePacket", () => {
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
});
