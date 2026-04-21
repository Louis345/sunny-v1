import type { TamagotchiState } from "../../../src/shared/vrrTypes";

export interface TamagotchiStripProps {
  tamagotchi: TamagotchiState;
  hidden?: boolean;
  onOpenSheet?: () => void;
}

/** Minimal 4-bar strip at bottom of map (tap opens sheet). */
export function TamagotchiStrip({
  tamagotchi,
  hidden,
  onOpenSheet,
}: TamagotchiStripProps) {
  if (hidden) return null;
  const cell = (icon: string, v: number, pulse?: boolean) => (
    <button
      type="button"
      key={icon}
      onClick={() => onOpenSheet?.()}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        background: "transparent",
        border: "none",
        cursor: onOpenSheet ? "pointer" : "default",
        padding: 4,
      }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      <div
        style={{
          width: "100%",
          maxWidth: 56,
          height: 6,
          borderRadius: 3,
          background: "#27272a",
          overflow: "hidden",
          boxShadow:
            pulse && v < 0.3 ? "0 0 8px rgba(248,113,113,0.9)" : undefined,
        }}
      >
        <div
          style={{
            width: `${Math.round(v * 100)}%`,
            height: "100%",
            background:
              v < 0.3 ? "#f87171" : v > 0.85 ? "#fbbf24" : "#a78bfa",
          }}
        />
      </div>
    </button>
  );
  return (
    <div
      style={{
        position: "absolute",
        left: 8,
        right: 8,
        bottom: 6,
        height: 36,
        display: "flex",
        gap: 6,
        zIndex: 50,
        pointerEvents: "auto",
      }}
    >
      {cell("🍎", tamagotchi.hunger, true)}
      {cell("😊", tamagotchi.happiness)}
      {cell("💛", tamagotchi.bond)}
      {cell("🧠", tamagotchi.intellect)}
    </div>
  );
}
