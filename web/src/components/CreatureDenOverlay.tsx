import { useEffect, useState } from "react";
import type { DenState } from "../../../src/shared/creatureDenRules";
import { CreatureDen } from "./CreatureDen";
import { fetchCreatures, sendDenAction } from "../utils/creatureApi";

/** The Den button on her map (owner, 2026-11-08): shown once she has caught a creature. */
export function DenButton({ creatureCount, onOpen }: { creatureCount: number; onOpen: () => void }) {
  if (creatureCount <= 0) return null;
  return (
    <button
      type="button"
      data-testid="den-button"
      onClick={onOpen}
      className="fixed left-4 top-3 z-40 rounded-full bg-black/60 px-4 py-2 text-sm font-black text-white shadow-lg"
    >
      <span aria-hidden="true">🌳 </span>
      {`Den · ${creatureCount}`}
    </button>
  );
}

/** Her den, loaded from and saved to the server: every change is one den action on her companion plan. */
export function CreatureDenOverlay({ childId, onClose }: { childId: string; onClose: () => void }) {
  const [den, setDen] = useState<DenState | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCreatures(childId)
      .then((snapshot) => {
        if (!cancelled) setDen(snapshot.den);
      })
      .catch((error: unknown) => console.error(` 🎮 [creatures] [den] [load-failed] child=${childId}`, error));
    return () => {
      cancelled = true;
    };
  }, [childId]);

  return (
    <div className="fixed inset-0 z-[125]" data-testid="creature-den-overlay">
      {den ? (
        <CreatureDen
          state={den}
          onChange={setDen}
          onAction={(action) => {
            void sendDenAction(childId, action)
              .then((result) => {
                if (result.ok && result.den) setDen(result.den);
                else if (!result.ok) console.warn(` 🎮 [creatures] [den] [refused] child=${childId} action=${action.action} reason=${result.reason ?? "unknown"}`);
              })
              .catch((error: unknown) => console.error(` 🎮 [creatures] [den] [save-failed] child=${childId} action=${action.action}`, error));
          }}
        />
      ) : (
        <div className="flex h-full items-center justify-center bg-[#0b0820] font-bold text-white">Opening your den…</div>
      )}
      <button
        type="button"
        onClick={onClose}
        className="fixed bottom-5 left-1/2 z-[126] -translate-x-1/2 rounded-full bg-white px-6 py-3 text-base font-black text-slate-900 shadow-xl"
      >
        Back to my map
      </button>
    </div>
  );
}
