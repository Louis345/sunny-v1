import type { AdventureMapProfile } from "../context/schemas/learningProfile";
import type { ChildChart } from "./childChart";
import type { CompanionConfig } from "../shared/companionTypes";

export type ChildExperiencePacket = {
  childChart: {
    childId: string;
    identity: ChildChart["identity"];
    companion: {
      id: string;
      displayName: string;
      config: CompanionConfig;
    };
    companionCare: ChildChart["companionCare"];
    economy: ChildChart["economy"];
    adventureMapProfile: AdventureMapProfile;
  };
  activeSessionPlan: ChildChart["activeSessionPlan"];
};

export function buildChildExperiencePacket(chart: ChildChart): ChildExperiencePacket {
  return {
    childChart: {
      childId: chart.childId,
      identity: chart.identity,
      companion: {
        id: chart.companion.presetId,
        displayName: chart.companion.displayName,
        config: chart.companion.config,
      },
      companionCare: chart.companionCare,
      economy: chart.economy,
      adventureMapProfile: chart.adventureMapProfile,
    },
    activeSessionPlan: chart.activeSessionPlan,
  };
}
