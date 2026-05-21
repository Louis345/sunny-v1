import { motion } from "framer-motion";
import type { CSSProperties } from "react";
import type { CompanionManifestEntry } from "../companion/companions.generated";

type SlotName = "prev" | "current" | "next" | "hidden";

const CRYSTAL_FONT = "Lexend, system-ui, sans-serif";

function slotLeftPercent(slot: SlotName, soleFlankPair: boolean): string {
  if (slot === "current") return "50%";
  if (slot === "prev") return soleFlankPair ? "24%" : "16%";
  if (slot === "next") return soleFlankPair ? "76%" : "84%";
  return "50%";
}

function slotHueDeg(entry: CompanionManifestEntry): number {
  return (
    (entry.id.split("").reduce((total, char) => total + char.charCodeAt(0), 0) *
      37) %
    360
  );
}

function safeGradientId(prefix: string, entry: CompanionManifestEntry) {
  return `${prefix}-${entry.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export function CrystalSpotlight() {
  return (
    <div
      aria-hidden
      data-crystal-spotlight
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 2,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          width: 440,
          height: "84%",
          transform: "translateX(-50%)",
          background:
            "linear-gradient(180deg, rgba(255,247,237,0.95) 0%, rgba(253,230,138,0.44) 35%, rgba(253,230,138,0.12) 72%, transparent 100%)",
          filter: "blur(2.5px)",
          clipPath: "polygon(36% 0%, 64% 0%, 92% 100%, 8% 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "32%",
          transform: "translate(-50%, 0)",
          width: 430,
          height: 360,
          borderRadius: "50%",
          background:
            "radial-gradient(50% 50% at 50% 50%, rgba(76,52,160,0.34) 0%, rgba(124,92,255,0.2) 45%, transparent 78%)",
          filter: "blur(8px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "8%",
          transform: "translateX(-50%)",
          width: 320,
          height: 72,
          borderRadius: "50%",
          background:
            "radial-gradient(60% 60% at 50% 50%, rgba(46,32,110,0.44) 0%, rgba(46,32,110,0.16) 50%, transparent 80%)",
          filter: "blur(6px)",
        }}
      />
    </div>
  );
}

export function CrystalPedestal({
  entry,
  slot,
  soleFlankPair = false,
  slotFrameStyle,
  visible,
}: {
  entry: CompanionManifestEntry;
  slot: SlotName;
  soleFlankPair?: boolean;
  slotFrameStyle?: CSSProperties;
  visible: boolean;
}) {
  if (slot === "hidden") return null;

  const active = slot === "current";
  const hue = slotHueDeg(entry);
  const color = `hsl(${hue}, 75%, ${active ? 65 : 58}%)`;
  const colorDeep = `hsl(${hue}, 70%, ${active ? 45 : 40}%)`;
  const topId = safeGradientId("crystal-top", entry);
  const frontId = safeGradientId("crystal-front", entry);
  const pedestalWidth = active
    ? "clamp(180px, 12vw, 240px)"
    : "clamp(112px, 7.4vw, 150px)";
  const pedestalHeight = active
    ? "clamp(56px, 4vw, 80px)"
    : "clamp(38px, 2.5vw, 50px)";
  const pedestalBottom = active
    ? "clamp(16px, calc(16px + (100vw - 1024px) * 0.019), 36px)"
    : "clamp(10px, calc(10px + (100vw - 1024px) * 0.014), 24px)";
  const anchorStyle = slotFrameStyle ?? fallbackSlotFrameStyle(slot, soleFlankPair);
  const targetOpacity = resolvePedestalOpacity(anchorStyle, active ? 1 : 0.42);

  return (
    <motion.div
      aria-hidden
      data-crystal-pedestal={slot}
      initial={false}
      animate={{ opacity: visible ? targetOpacity : 0 }}
      transition={{ duration: 0.32 }}
      style={{
        ...anchorStyle,
        opacity: targetOpacity,
        pointerEvents: "none",
        zIndex: active ? 2 : 1,
        filter: active ? "none" : "saturate(0.7)",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: pedestalBottom,
          transform: "translateX(-50%)",
          width: pedestalWidth,
          height: pedestalHeight,
          pointerEvents: "none",
        }}
      >
        <svg
          viewBox="0 0 240 80"
          width="100%"
          height="100%"
          style={{ overflow: "visible" }}
        >
          <defs>
            <linearGradient id={topId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="rgba(255,255,255,0.85)" />
              <stop offset="1" stopColor="rgba(255,255,255,0.18)" />
            </linearGradient>
            <linearGradient id={frontId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity={active ? 0.65 : 0.4} />
              <stop offset="1" stopColor={colorDeep} stopOpacity={active ? 0.95 : 0.65} />
            </linearGradient>
          </defs>
          <polygon
            points="56,18 184,18 214,42 120,58 26,42"
            fill={`url(#${topId})`}
            stroke="rgba(255,255,255,0.8)"
            strokeWidth="1.2"
          />
          <polygon
            points="26,42 120,58 120,76 26,58"
            fill={`url(#${frontId})`}
            stroke="rgba(255,255,255,0.6)"
            strokeWidth="1"
          />
          <polygon
            points="120,58 214,42 214,58 120,76"
            fill={`url(#${frontId})`}
            stroke="rgba(255,255,255,0.6)"
            strokeWidth="1"
            opacity="0.92"
          />
          <polygon
            points="56,18 184,18 184,22 56,22"
            fill="rgba(255,255,255,0.55)"
          />
          {active && <ellipse cx="120" cy="40" rx="70" ry="8" fill={color} opacity="0.55" />}
        </svg>
      </div>
    </motion.div>
  );
}

function fallbackSlotFrameStyle(
  slot: SlotName,
  soleFlankPair: boolean,
): CSSProperties {
  const active = slot === "current";
  return {
    position: "absolute",
    top: active ? "5%" : "8%",
    left: slotLeftPercent(slot, soleFlankPair),
    width: active ? "min(36vw, 360px)" : "min(24vw, 260px)",
    height: "min(66vh, 560px)",
    minWidth: active ? 230 : 150,
    minHeight: 300,
    transform: `translateX(-50%) scale(${active ? 1 : soleFlankPair ? 0.78 : 0.76})`,
  };
}

function resolvePedestalOpacity(
  slotFrameStyle: CSSProperties,
  fallback: number,
): number {
  const opacity = slotFrameStyle.opacity;
  if (typeof opacity === "number") return opacity;
  if (typeof opacity === "string") {
    const parsed = Number(opacity);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function CrystalIdentityBlock({
  companion,
  roleNumber,
}: {
  companion: CompanionManifestEntry;
  roleNumber: number;
}) {
  const role = companion.showroom?.role ?? "your companion";
  const traits = companion.personality.slice(0, 3);

  return (
    <div
      data-crystal-identity
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        textAlign: "center",
        whiteSpace: "nowrap",
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.32em",
          color: "rgba(59,47,122,0.62)",
          fontWeight: 800,
          fontFamily: CRYSTAL_FONT,
        }}
      >
        NO. {String(roleNumber).padStart(2, "0")} / {role.toUpperCase()}
      </div>
      <h1
        style={{
          margin: 0,
          fontSize: 42,
          fontWeight: 800,
          letterSpacing: "0",
          color: "#1a1340",
          fontFamily: CRYSTAL_FONT,
          lineHeight: 1,
        }}
      >
        {companion.name}
      </h1>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
        {traits.map((tag) => (
          <span
            key={tag}
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 999,
              background: "rgba(124,92,255,0.16)",
              color: "#3b2f7a",
              letterSpacing: "0.04em",
              fontFamily: CRYSTAL_FONT,
            }}
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

export function CrystalPrimaryButton({
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
        border: 0,
        borderRadius: 999,
        background: "linear-gradient(135deg, #7c5cff 0%, #5b3ee0 100%)",
        color: "#fff",
        padding: "14px 28px",
        fontWeight: 800,
        fontSize: 16,
        fontFamily: CRYSTAL_FONT,
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled ? 0.7 : 1,
        letterSpacing: "0.01em",
        boxShadow:
          "0 0 0 1px rgba(255,255,255,0.4) inset, 0 14px 32px rgba(124,92,255,0.45)",
      }}
    >
      Meet {companionName}
    </motion.button>
  );
}

export function CrystalSignatureButton({
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
        border: "1px solid rgba(167,139,250,0.5)",
        borderRadius: 999,
        background: "rgba(255,255,255,0.72)",
        color: "#3b2f7a",
        padding: "12px 20px",
        fontWeight: 800,
        fontSize: 13,
        fontFamily: CRYSTAL_FONT,
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled ? 0.7 : 1,
        letterSpacing: "0.04em",
        backdropFilter: "blur(10px)",
      }}
    >
      {name}
    </motion.button>
  );
}

export function CrystalDotNav({
  total,
  activeIndex,
  onPick,
  disabled,
}: {
  total: number;
  activeIndex: number;
  onPick: (index: number) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Companions"
      data-crystal-dot-nav
      style={{
        display: "inline-flex",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.6)",
        border: "1px solid rgba(167,139,250,0.3)",
        backdropFilter: "blur(12px)",
      }}
    >
      {Array.from({ length: total }).map((_, index) => {
        const isActive = index === activeIndex;
        return (
          <button
            key={index}
            type="button"
            aria-label={`Show companion ${index + 1}`}
            aria-current={isActive ? "true" : undefined}
            onClick={() => onPick(index)}
            disabled={disabled}
            style={{
              width: isActive ? 22 : 8,
              height: 8,
              borderRadius: 999,
              border: 0,
              padding: 0,
              background: isActive ? "#7c5cff" : "rgba(60,40,140,0.32)",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.6 : 1,
              transition: "width 200ms",
            }}
          />
        );
      })}
    </div>
  );
}
