import type { CSSProperties } from "react";
import { motion } from "framer-motion";
import type { CompanionManifestEntry } from "../companion/companions.generated";

type SlotName = "prev" | "current" | "next" | "hidden";

const PLAYFAIR = "'Playfair Display', 'Cormorant Garamond', Georgia, serif";
const BRASS_DARK = "#3b1f08";
const BRASS_LIGHT = "#fbeec1";

function slotLeftPercent(slot: SlotName, soleFlankPair: boolean): string {
  if (slot === "current") return "50%";
  if (slot === "prev") return soleFlankPair ? "24%" : "16%";
  if (slot === "next") return soleFlankPair ? "76%" : "84%";
  return "50%";
}

export function StorybookNameplate({
  entry,
  slot,
  soleFlankPair = false,
  visible,
}: {
  entry: CompanionManifestEntry;
  slot: SlotName;
  soleFlankPair?: boolean;
  visible: boolean;
}) {
  if (slot === "hidden") return null;
  const active = slot === "current";
  const role =
    entry.showroom?.role ??
    entry.showroom?.personality?.split(",")[0]?.trim() ??
    "your learning friend";

  const baseStyle: CSSProperties = {
    position: "absolute",
    bottom: active ? "6%" : "11%",
    left: slotLeftPercent(slot, soleFlankPair),
    transform: "translateX(-50%)",
    zIndex: 6,
    pointerEvents: "none",
    transition: "opacity 0.36s ease, bottom 0.36s ease",
  };

  const plateStyle: CSSProperties = {
    padding: active ? "11px 22px" : "6px 14px",
    borderRadius: 9,
    background: active
      ? "linear-gradient(180deg, #f7e3a3 0%, #d4a948 60%, #a17a2a 100%)"
      : "linear-gradient(180deg, #c8b27a 0%, #8d7236 100%)",
    border: "1px solid rgba(120,80,28,0.6)",
    boxShadow: active
      ? "inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -1px 0 rgba(70,40,5,0.45), 0 10px 22px rgba(0,0,0,0.4)"
      : "inset 0 1px 0 rgba(255,255,255,0.34), 0 4px 10px rgba(0,0,0,0.32)",
    textAlign: "center",
    minWidth: active ? 170 : 96,
    filter: active ? "none" : "saturate(0.78)",
  };

  return (
    <motion.div
      aria-hidden
      data-storybook-nameplate={slot}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 8 }}
      transition={{ duration: 0.36, ease: "easeOut" }}
      style={baseStyle}
    >
      <div style={plateStyle}>
        <div
          style={{
            fontFamily: PLAYFAIR,
            fontWeight: 700,
            fontSize: active ? 22 : 13,
            color: BRASS_DARK,
            letterSpacing: "0.02em",
            textShadow: "0 1px 0 rgba(255,255,255,0.45)",
            lineHeight: 1.1,
          }}
        >
          {entry.name}
        </div>
        {active && (
          <div
            style={{
              fontFamily: PLAYFAIR,
              fontStyle: "italic",
              fontSize: 11,
              color: "rgba(59,31,8,0.78)",
              marginTop: 2,
              letterSpacing: "0.06em",
            }}
          >
            {role}
          </div>
        )}
      </div>
    </motion.div>
  );
}

const DUST_SEEDS = [
  { left: "14%", top: "18%", size: 3, delay: "0s" },
  { left: "22%", top: "44%", size: 4, delay: "1.4s" },
  { left: "31%", top: "26%", size: 3, delay: "2.6s" },
  { left: "40%", top: "12%", size: 4, delay: "0.8s" },
  { left: "47%", top: "38%", size: 3, delay: "2.1s" },
  { left: "53%", top: "20%", size: 5, delay: "0.4s" },
  { left: "61%", top: "30%", size: 3, delay: "1.7s" },
  { left: "68%", top: "16%", size: 4, delay: "2.9s" },
  { left: "76%", top: "42%", size: 3, delay: "1.1s" },
  { left: "85%", top: "24%", size: 4, delay: "0.6s" },
  { left: "44%", top: "58%", size: 3, delay: "3.2s" },
  { left: "58%", top: "62%", size: 3, delay: "2.3s" },
  { left: "30%", top: "64%", size: 3, delay: "1.9s" },
];

export function StorybookSparkles() {
  return (
    <div
      aria-hidden
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }}
    >
      {DUST_SEEDS.map((dot) => (
        <span
          key={`${dot.left}-${dot.top}`}
          style={{
            position: "absolute",
            left: dot.left,
            top: dot.top,
            width: dot.size,
            height: dot.size,
            borderRadius: "50%",
            background: BRASS_LIGHT,
            boxShadow: `0 0 ${dot.size * 4}px rgba(251,238,193,0.95)`,
            opacity: 0.72,
            animation: `sunny-showroom-sparkle 4.6s ease-in-out ${dot.delay} infinite`,
          }}
        />
      ))}
    </div>
  );
}

export function StorybookFootlights() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        bottom: "14%",
        left: "10%",
        right: "10%",
        height: 18,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        zIndex: 3,
        pointerEvents: "none",
      }}
    >
      {Array.from({ length: 14 }).map((_, i) => (
        <span
          key={i}
          data-storybook-footlight
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 35% 35%, #fff8c1 0%, #ffce5e 50%, #c08a1a 100%)",
            boxShadow:
              "0 0 14px rgba(255,206,94,0.85), 0 0 28px rgba(255,206,94,0.45)",
          }}
        />
      ))}
    </div>
  );
}

export function StorybookPrimaryButton({
  companionName,
  onClick,
  disabled,
}: {
  companionName: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.025 }}
      whileTap={disabled ? undefined : { scale: 0.985 }}
      style={{
        border: "1.5px solid #f3d484",
        borderRadius: 999,
        background:
          "linear-gradient(180deg, #f7e3a3 0%, #d4a948 55%, #a17a2a 100%)",
        color: BRASS_DARK,
        padding: "16px 36px",
        fontWeight: 800,
        fontSize: 19,
        fontFamily: PLAYFAIR,
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled ? 0.7 : 1,
        letterSpacing: "0.02em",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -2px 0 rgba(70,40,5,0.4), 0 16px 40px rgba(212,169,72,0.4)",
      }}
    >
      Meet {companionName}
    </motion.button>
  );
}

export function StorybookSignatureButton({
  name,
  voiceLine,
  onClick,
  disabled,
}: {
  name: string;
  voiceLine?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <motion.button
      type="button"
      aria-label={`Play ${name}`}
      title={voiceLine}
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.025, y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.985 }}
      style={{
        border: "1.5px solid #c9a44a",
        borderRadius: 999,
        background: "rgba(43,16,32,0.42)",
        color: "#f3d484",
        padding: "13px 22px",
        fontWeight: 700,
        fontSize: 14,
        fontFamily: PLAYFAIR,
        fontStyle: "italic",
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled ? 0.7 : 1,
        letterSpacing: "0.04em",
        backdropFilter: "blur(6px)",
      }}
    >
      {name}
    </motion.button>
  );
}
