import { useEffect, useState } from "react";
import {
  Apple,
  Backpack,
  Brain,
  Candy,
  CircleHelp,
  Coins,
  Soup,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { CompanionCareView } from "../../../src/shared/companionCareTypes";
import type { TamagotchiState } from "../../../src/shared/vrrTypes";

export interface TamagotchiSheetProps {
  open: boolean;
  tamagotchi?: TamagotchiState;
  companionCare?: CompanionCareView;
  companionName: string;
  /** Shop coins — shown at bottom of this panel when set. */
  companionCurrency?: number;
  inventory?: { id: string; label: string }[];
  onFeed?: (foodId: string) => void;
  isFeeding?: boolean;
  onClose: () => void;
}

const PANEL_MS = 320;

const FOOD_ICONS: Record<string, LucideIcon> = {
  apple_bite: Apple,
  brain_berry: Brain,
  cozy_soup: Soup,
  star_candy: Candy,
  mystery_snack: Sparkles,
};

function rarityStyle(rarity?: string): { border: string; background: string; accent: string } {
  if (rarity === "rare") {
    return {
      border: "#facc15",
      background: "linear-gradient(135deg, #2e1065, #581c87 52%, #713f12)",
      accent: "#fde68a",
    };
  }
  if (rarity === "uncommon") {
    return {
      border: "#38bdf8",
      background: "linear-gradient(135deg, #0f172a, #164e63)",
      accent: "#bae6fd",
    };
  }
  return {
    border: "#334155",
    background: "linear-gradient(135deg, #111827, #1e293b)",
    accent: "#cbd5e1",
  };
}

function careStatus(care?: CompanionCareView): {
  label: string;
  background: string;
  color: string;
  border: string;
} {
  if (!care) {
    return {
      label: "Ready",
      background: "#172554",
      color: "#dbeafe",
      border: "#1d4ed8",
    };
  }
  if (care.readiness.highEnergyReluctance || care.moodLabel === "hungry" || care.moodLabel === "tired") {
    return {
      label: "Needs care",
      background: "#431407",
      color: "#fed7aa",
      border: "#9a3412",
    };
  }
  if (care.moodLabel === "bright") {
    return {
      label: "Bright",
      background: "#052e16",
      color: "#bbf7d0",
      border: "#15803d",
    };
  }
  return {
    label: "Steady",
    background: "#172554",
    color: "#dbeafe",
    border: "#1d4ed8",
  };
}

/** Bottom sheet for meters + backpack (stub body — expand in Phase 4+). */
export function TamagotchiSheet({
  open,
  tamagotchi,
  companionCare,
  companionName,
  companionCurrency,
  inventory = [],
  onFeed,
  isFeeding = false,
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

  const careVitals = companionCare?.vitals;
  const careInventory = companionCare?.inventory.food ?? inventory;
  const coins = companionCurrency ?? companionCare?.economy.coins;
  const status = careStatus(companionCare);
  const vitals: Array<[string, string, number]> = careVitals
    ? [
        ["🍎", "Hunger", careVitals.hunger],
        ["😊", "Mood", careVitals.mood],
        ["💛", "Bond", careVitals.bond],
        ["⚡", "Energy", careVitals.energy],
        ["🧭", "Help", careVitals.usefulness],
        ["🧠", "Thoughts", careVitals.thoughtClarity],
      ]
    : [
        ["🍎", "Hunger", tamagotchi?.hunger ?? 0],
        ["😊", "Happy", tamagotchi?.happiness ?? 0],
        ["💛", "Bond", tamagotchi?.bond ?? 0],
        ["🧠", "Intellect", tamagotchi?.intellect ?? 0],
      ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 11000,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 16,
          bottom: 16,
          width: 440,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "min(500px, calc(100vh - 120px))",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          background: "#0f172a",
          color: "#fff",
          borderRadius: 14,
          padding: 16,
          paddingTop: 28,
          boxShadow: "0 14px 44px rgba(0,0,0,0.42)",
          overflow: "hidden",
          pointerEvents: slideIn ? "auto" : "none",
          transform: slideIn ? "translateY(0) scale(1)" : "translateY(16px) scale(0.98)",
          opacity: slideIn ? 1 : 0,
          transition: `transform ${PANEL_MS}ms cubic-bezier(0.32, 0.72, 0, 1), opacity ${PANEL_MS}ms ease`,
        }}
        role="dialog"
        aria-modal="false"
      >
        <div
          data-testid="bookbag-sticky-header"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 3,
            margin: "-28px -16px 12px",
            padding: "18px 16px 12px",
            background: "rgba(15, 23, 42, 0.96)",
            backdropFilter: "blur(10px)",
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
            borderBottom: "1px solid rgba(148, 163, 184, 0.18)",
          }}
        >
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
              display: "block",
            }}
          />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#172554",
                  color: "#dbeafe",
                  border: "1px solid #1d4ed8",
                }}
              >
                <Backpack size={20} aria-hidden="true" />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{companionName}'s bookbag</div>
                <div style={{ marginTop: 2, fontSize: 12, color: "#cbd5e1" }}>
                  Companion care
                </div>
              </div>
              <div
                style={{
                  marginLeft: "auto",
                  borderRadius: 999,
                  border: `1px solid ${status.border}`,
                  background: status.background,
                  color: status.color,
                  padding: "5px 9px",
                  fontSize: 12,
                  fontWeight: 900,
                  whiteSpace: "nowrap",
                }}
              >
                {status.label}
              </div>
            </div>
          </div>
        </div>
        <div
          data-testid="bookbag-scroll-body"
          style={{
            minHeight: 0,
            overflowY: "auto",
            paddingRight: 2,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {vitals.map(([icon, label, v]) => (
              <div key={String(label)} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 28 }}>{icon}</span>
                <span style={{ width: 72, fontSize: 12 }}>{label}</span>
                {bar(Number(v))}
              </div>
            ))}
          </div>
          {companionCare?.readiness.highEnergyReluctance ? (
            <div
              style={{
                marginTop: 12,
                borderRadius: 8,
                border: "1px solid #7c2d12",
                background: "#431407",
                color: "#fed7aa",
                padding: 10,
                fontSize: 12,
                lineHeight: 1.4,
              }}
            >
              {companionName} is low-energy. Feed, warm up, or continue gently.
            </div>
          ) : null}
          <div style={{ marginTop: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 800 }}>Food pouch</div>
              {coins !== undefined ? (
                <div
                  aria-label={`${coins} companion coins`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 9px",
                    borderRadius: 999,
                    background: "#f8fafc",
                    color: "#92400e",
                    fontSize: 12,
                    fontWeight: 900,
                  }}
                >
                  <Coins size={14} aria-hidden="true" />
                  {coins}
                </div>
              ) : null}
            </div>
            <div style={{ marginTop: 3, fontSize: 12, color: "#94a3b8" }}>
              Earn more food by finishing map nodes.
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 10,
              marginTop: 10,
            }}
          >
            {careInventory.map((it) => {
            const quantity = "quantity" in it ? Number(it.quantity) : 1;
            const disabled = isFeeding || quantity <= 0;
            const Icon = FOOD_ICONS[it.id] ?? CircleHelp;
            const styles = rarityStyle("rarity" in it ? String(it.rarity) : undefined);
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => {
                  onFeed?.(it.id);
                  onClose();
                }}
                aria-label={`Feed ${it.label}`}
                disabled={disabled}
                style={{
                  minHeight: 96,
                  padding: 12,
                  borderRadius: 8,
                  border: `1px solid ${styles.border}`,
                  background: styles.background,
                  color: "#f8fafc",
                  textAlign: "left",
                  opacity: disabled ? 0.5 : 1,
                  cursor: disabled ? "not-allowed" : "pointer",
                  display: "grid",
                  gridTemplateColumns: "44px 1fr",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <span
                  aria-label={`${it.label} icon`}
                  role="img"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(255,255,255,0.12)",
                    color: styles.accent,
                  }}
                >
                  <Icon size={24} aria-hidden="true" />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 900 }}>
                    {it.label}
                  </span>
                  <span
                    style={{
                      display: "block",
                      marginTop: 4,
                      color: styles.accent,
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    x{Math.max(0, Math.floor(quantity))} left
                  </span>
                  {"description" in it ? (
                    <span
                      style={{
                        display: "block",
                        marginTop: 4,
                        color: "#cbd5e1",
                        fontSize: 11,
                        lineHeight: 1.25,
                      }}
                    >
                      {String(it.description)}
                    </span>
                  ) : null}
                </span>
              </button>
            );
            })}
            {careInventory.length === 0 && (
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
    </div>
  );
}
