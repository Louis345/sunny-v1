import React from "react";
import type { ChildExperiencePacket } from "../../../src/profiles/childExperiencePacket";
import type {
  AdventureBoardNode,
  AdventureChoiceOption,
  AdventureChoiceSet,
} from "../../../src/shared/adventureBoardJson";
import type { CompanionBehavior } from "../context/companionCareBehavior";
import { AdventureBoard, type UnlockCeremonyEvent } from "./AdventureBoard";
import { CompanionLayer } from "./CompanionLayer";

export type AdventureBoardExperienceProps = {
  packet: ChildExperiencePacket;
  showCompanion?: boolean;
  idlePose?: "flank" | "center";
  companionBehavior?: CompanionBehavior | null;
  completedNodeIds?: readonly string[];
  parentPreview?: boolean;
  showParentPreviewBanner?: boolean;
  onNodeClick?: (node: AdventureBoardNode) => void;
  onChoiceClick?: (option: AdventureChoiceOption, choiceSet: AdventureChoiceSet) => void;
  onUnlockCeremony?: (event: UnlockCeremonyEvent) => void;
};

export function AdventureBoardExperience({
  packet,
  showCompanion = true,
  idlePose = "center",
  companionBehavior = null,
  completedNodeIds,
  parentPreview = false,
  showParentPreviewBanner = true,
  onNodeClick,
  onChoiceClick,
  onUnlockCeremony,
}: AdventureBoardExperienceProps): React.ReactElement | null {
  const board = packet.activeSessionPlan?.adventureBoard;
  if (!board) return null;

  const companionConfig = packet.childChart.companion.config;
  const companionSlot = packet.childChart.adventureMapProfile.companionSlot;
  const shouldRenderCompanion = showCompanion && companionSlot !== "none";

  return (
    <>
      {parentPreview && showParentPreviewBanner ? (
        <div className="fixed left-1/2 top-3 z-[110] -translate-x-1/2 rounded-full bg-slate-950/90 px-5 py-2 text-sm font-black text-amber-200 shadow-xl">
          Parent preview — progress will not save
        </div>
      ) : null}
      <AdventureBoard
        board={board}
        completedNodeIds={completedNodeIds}
        inspectBaselineNodes={parentPreview}
        onNodeClick={onNodeClick}
        onChoiceClick={onChoiceClick}
        onUnlockCeremony={onUnlockCeremony}
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
