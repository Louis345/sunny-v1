import { useEffect, useState } from "react";
import type { TamagotchiState } from "../../../src/shared/vrrTypes";

export interface TamagotchiSheetProps {
  open: boolean;
  tamagotchi: TamagotchiState;
  companionName: string;
  inventory?: { id: string; label: string }[];
  onFeed?: (foodId: string) => void;
  onClose: () => void;
}

const PANEL_MS = 320;

/** Bottom sheet for meters + backpack (stub body — expand in Phase 4+). */
export function TamagotchiSheet({
  open,
  tamagotchi,
  companionName,
  inventory = [],
  onFeed,
  onClose,
}: TamagotchiSheetProps) {
  const [rendered, setRendered] = useState(open);
  const [slideIn, setSlideIn] = useState(open);

  useEffect(() => {
    if (open) {
      setRendered(true);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setSlideIn(true));
      });
      return () => cancelAnimationFrame(id);
    }
    setSlideIn(false);
    const t = window.setTimeout(() => setRendered(false), PANEL_MS);
    return () => clearTimeout(t);
  }, [open]);

  const bar = (v: number) => (
    <div
      style={{
        height: 8,
        borderRadius: 4,
        background: "#e5e7eb",
        overflow: "hidden",
        flex: 1,
      }}
    >
      <div
        style={{
          width: `${Math.round(v * 100)}%`,
          height: "100%",
          background: "#6366f1",
        }}
      />
    </div>
  );

  if (!rendered) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 11000,
        pointerEvents: slideIn ? "auto" : "none",
      }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          border: "none",
          padding: 0,
          margin: 0,
          background: slideIn ? "rgba(0,0,0,0.45)" : "transparent",
          cursor: "pointer",
          transition: `background ${PANEL_MS}ms ease`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: "70vh",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          background: "#0f172a",
          color: "#fff",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          padding: 16,
          paddingTop: 20,
          boxShadow: "0 -8px 32px rgba(0,0,0,0.35)",
          overflowY: "auto",
          transform: slideIn ? "translateY(0)" : "translateY(100%)",
          transition: `transform ${PANEL_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
        }}
        role="dialog"
        aria-modal="true"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{
            position: "absolute",
            top: 12,
            right: 16,
            width: 36,
            height: 36,
            borderRadius: 999,
            border: "1px solid #475569",
            background: "#1e293b",
            color: "#e2e8f0",
            fontSize: 20,
            lineHeight: 1,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            zIndex: 2,
          }}
        >
          ×
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 48,
            height: 5,
            borderRadius: 3,
            background: "#475569",
            margin: "0 auto 12px",
            border: "none",
            padding: 0,
            cursor: "pointer",
            flexShrink: 0,
          }}
        />
        <div style={{ fontWeight: 700, marginBottom: 12, paddingRight: 44 }}>
          {companionName} · care
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            ["🍎", "Hunger", tamagotchi.hunger],
            ["😊", "Happy", tamagotchi.happiness],
            ["💛", "Bond", tamagotchi.bond],
            ["🧠", "Intellect", tamagotchi.intellect],
          ].map(([icon, label, v]) => (
            <div key={String(label)} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 28 }}>{icon}</span>
              <span style={{ width: 72, fontSize: 12 }}>{label}</span>
              {bar(Number(v))}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, fontSize: 13, opacity: 0.8 }}>Your backpack</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {inventory.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => onFeed?.(it.id)}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #334155",
                background: "#1e293b",
                color: "#e2e8f0",
                fontSize: 12,
              }}
            >
              {it.label}
            </button>
          ))}
          {inventory.length === 0 && (
            <span style={{ fontSize: 12, opacity: 0.6 }}>No snacks yet.</span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 16,
            width: "100%",
            padding: 10,
            borderRadius: 8,
            border: "1px solid #334155",
            background: "transparent",
            color: "#94a3b8",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
