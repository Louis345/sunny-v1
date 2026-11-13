import { useState } from "react";
import type { TamagotchiState } from "../../../src/shared/vrrTypes";
import { useCompanionCareOptional } from "../context/CompanionCareContext";
import { TamagotchiSheet } from "./TamagotchiSheet";
import { TamagotchiStrip } from "./TamagotchiStrip";

export interface CompanionCareHudProps {
  companionName: string;
  fallbackTamagotchi: TamagotchiState;
  activityActive?: boolean;
}

export function CompanionCareHud({
  companionName,
  fallbackTamagotchi,
  activityActive = false,
}: CompanionCareHudProps) {
  const careContext = useCompanionCareOptional();
  const [sheetOpen, setSheetOpen] = useState(false);
  const care = careContext?.care ?? null;

  return (
    <>
      <TamagotchiStrip
        tamagotchi={fallbackTamagotchi}
        companionCare={care}
        hidden={activityActive || !care}
        onOpenSheet={() => setSheetOpen(true)}
      />
      <TamagotchiSheet
        open={sheetOpen && !activityActive}
        tamagotchi={fallbackTamagotchi}
        companionCare={care ?? undefined}
        companionName={companionName}
        companionCurrency={care?.economy.coins}
        onFeed={(itemId) => {
          void careContext?.feed(itemId);
        }}
        isFeeding={careContext?.isFeeding === true}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}
