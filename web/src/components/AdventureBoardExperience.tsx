import React from "react";
import type { ChildExperiencePacket } from "../../../src/profiles/childExperiencePacket";
import type {
  AdventureBoardNode,
  AdventureChoiceOption,
  AdventureChoiceSet,
} from "../../../src/shared/adventureBoardJson";
import type { CompanionBehavior } from "../context/companionCareBehavior";
import { AdventureBoard } from "./AdventureBoard";
import { CompanionLayer } from "./CompanionLayer";

export type AdventureBoardExperienceProps = {
  packet: ChildExperiencePacket;
  showCompanion?: boolean;
  idlePose?: "flank" | "center";
  companionBehavior?: CompanionBehavior | null;
  onNodeClick?: (node: AdventureBoardNode) => void;
  onChoiceClick?: (option: AdventureChoiceOption, choiceSet: AdventureChoiceSet) => void;
};

export function AdventureBoardExperience({
  packet,
  showCompanion = true,
  idlePose = "center",
  companionBehavior = null,
  onNodeClick,
  onChoiceClick,
}: AdventureBoardExperienceProps): React.ReactElement | null {
  const board = packet.activeSessionPlan?.adventureBoard;
  if (!board) return null;

  const companionConfig = packet.childChart.companion.config;
  const companionSlot = packet.childChart.adventureMapProfile.companionSlot;
  const shouldRenderCompanion = showCompanion && companionSlot !== "none";

  return (
    <>
      <AdventureBoard
        board={board}
        onNodeClick={onNodeClick}
        onChoiceClick={onChoiceClick}
      />
      {shouldRenderCompanion ? (
        <CompanionLayer
          childId={packet.childChart.childId}
          companion={companionConfig}
          toggledOff={companionConfig.toggledOff}
          mode="full"
          idlePose={idlePose}
          companionCare={packet.childChart.companionCare.view}
          companionBehavior={companionBehavior}
        />
      ) : null}
    </>
  );
}
