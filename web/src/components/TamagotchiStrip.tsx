import type { TamagotchiState } from "../../../src/shared/vrrTypes";
import type { CompanionCareView } from "../../../src/shared/companionCareTypes";

export interface TamagotchiStripProps {
  tamagotchi: TamagotchiState;
  companionCare?: CompanionCareView | null;
  hidden?: boolean;
  onOpenSheet?: () => void;
}

/** Compact care HUD at bottom of map (tap opens bookbag). */
export function TamagotchiStrip({
  tamagotchi,
  companionCare,
  hidden,
  onOpenSheet,
}: TamagotchiStripProps) {
  if (hidden) return null;
  const cell = (icon: string, label: string, v: number, pulse?: boolean) => {
    const pct = Math.round(v * 100);
    const fillColor = v < 0.3 ? "#fb7185" : v > 0.85 ? "#facc15" : "#8b5cf6";
    return (
    <button
      type="button"
      key={label}
      onClick={() => onOpenSheet?.()}
      aria-label={`Open bookbag: ${label} ${pct}%`}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 5,
        background: "transparent",
        border: "none",
        cursor: onOpenSheet ? "pointer" : "default",
        padding: "3px 4px",
        minWidth: 0,
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          color: "#f8fafc",
          fontSize: 11,
          fontWeight: 800,
          lineHeight: 1,
          textShadow: "0 1px 2px rgba(0,0,0,0.35)",
        }}
      >
        <span style={{ fontSize: 15, lineHeight: 1 }}>{icon}</span>
        <span>{pct}%</span>
      </span>
      <div
        style={{
          width: "100%",
          height: 7,
          borderRadius: 999,
          background: "rgba(226,232,240,0.22)",
          overflow: "hidden",
          boxShadow:
            pulse && v < 0.3 ? "0 0 10px rgba(251,113,133,0.9)" : undefined,
        }}
      >
        <div
          style={{
            width: `${Math.round(v * 100)}%`,
            height: "100%",
            background: fillColor,
            boxShadow: `0 0 10px ${fillColor}`,
          }}
        />
      </div>
    </button>
  );
  };
  const bars: Array<[string, string, number, boolean?]> = companionCare?.vitals
    ? [
        ["🍎", "Hunger", companionCare.vitals.hunger, true],
        ["😊", "Mood", companionCare.vitals.mood],
        ["💛", "Bond", companionCare.vitals.bond],
        ["⚡", "Energy", companionCare.vitals.energy],
      ]
    : [
        ["🍎", "Hunger", tamagotchi.hunger, true],
        ["😊", "Mood", tamagotchi.happiness],
        ["💛", "Bond", tamagotchi.bond],
        ["🧠", "Intellect", tamagotchi.intellect],
      ];
  return (
    <div
      data-testid="map-care-strip"
      style={{
        position: "absolute",
        left: 16,
        bottom: 14,
        width: 360,
        maxWidth: "calc(100vw - 32px)",
        minHeight: 54,
        display: "flex",
        gap: 8,
        padding: "8px 10px",
        borderRadius: 8,
        background: "rgba(15,23,42,0.72)",
        border: "1px solid rgba(148,163,184,0.24)",
        boxShadow: "0 10px 26px rgba(0,0,0,0.24)",
        backdropFilter: "blur(10px)",
        zIndex: 80,
        pointerEvents: "auto",
      }}
    >
      {bars.map(([icon, label, value, pulse]) => cell(icon, label, value, pulse))}
    </div>
  );
}
