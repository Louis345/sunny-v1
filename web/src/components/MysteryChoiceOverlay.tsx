import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import type { MysteryChoiceOption, NodeConfig } from "../../../src/shared/adventureTypes";
import type { MapPreviewMode } from "./AdventureMap";

const ACCENTS: Record<string, string> = {
  "monster-stampede": "#E83A5C",
  pronunciation: "#0EA5E9",
  karaoke: "#5B3FCB",
  "bubble-pop": "#10B981",
  "word-radar": "#7C3AED",
  "spell-check": "#F472B6",
  "letter-rush": "#F59E0B",
  wordle: "#0F766E",
  asteroid: "#E83A5C",
  "space-invaders": "#5B3FCB",
  "space-frogger": "#0EA5E9",
  "wheel-of-fortune": "#FCD34D",
  quest: "#FCD34D",
};

function accentFor(option: MysteryChoiceOption): string {
  return ACCENTS[option.activityId] ?? "#7C3AED";
}

function displayLabelFor(option: MysteryChoiceOption): string {
  if (option.activityId === "pronunciation") return "Say it out loud";
  if (option.activityId === "karaoke") return "Tiny story";
  if (option.activityId === "asteroid") return "Asteroids";
  if (option.activityId === "space-invaders") return "Space Invaders";
  if (option.activityId === "space-frogger") return "Space Frogger";
  if (option.activityId === "wheel-of-fortune") return "Wheel of Fortune";
  return option.label;
}

function CardArt({ option }: { option: MysteryChoiceOption }) {
  const accent = accentFor(option);
  const common = {
    width: "100%",
    height: "100%",
    display: "block",
  };
  if (option.activityId === "monster-stampede" || option.activityId === "asteroid") {
    return (
      <svg viewBox="0 0 236 168" aria-hidden style={common}>
        <rect width="236" height="168" fill={accent} />
        <circle cx="49" cy="137" r="21" fill="#F8B283" opacity="0.85" />
        <circle cx="184" cy="27" r="33" fill="#F8B283" opacity="0.85" />
        <path
          d="M119 0 70 96h43l-18 75 72-103h-43L149 0z"
          fill="#FFF7E1"
          stroke="#1F0F2D"
          strokeLinejoin="round"
          strokeWidth="7"
        />
      </svg>
    );
  }
  if (option.activityId === "pronunciation") {
    return (
      <svg viewBox="0 0 236 168" aria-hidden style={common}>
        <rect width="236" height="168" fill={accent} />
        <rect x="95" y="34" width="46" height="73" rx="23" fill="#FCD34D" stroke="#1F0F2D" strokeWidth="6" />
        <path d="M67 76v25M169 76v25M91 98c0 31 54 31 54 0M118 130v35" fill="none" stroke="#FFF7E1" strokeWidth="8" strokeLinecap="round" />
        <path d="M48 91v18M188 91v18" fill="none" stroke="#FFF7E1" strokeWidth="8" strokeLinecap="round" opacity="0.9" />
      </svg>
    );
  }
  if (option.activityId === "karaoke" || option.activityId === "quest") {
    return (
      <svg viewBox="0 0 236 168" aria-hidden style={common}>
        <rect width="236" height="168" fill={accent} />
        <rect x="40" y="34" width="79" height="89" rx="8" fill="#FFF7E1" />
        <rect x="119" y="34" width="79" height="89" rx="8" fill="#FFF7E1" />
        <path d="M119 34v89" stroke="#1F0F2D" strokeWidth="5" />
        <path d="M56 61h41M56 80h41M56 99h41M139 61h41M139 80h41" stroke="#5B3FCB" strokeWidth="5" />
        <path d="m178 22 12 31 33 2-25 20 8 33-28-18-28 18 8-33-25-20 33-2z" fill="#FCD34D" stroke="#1F0F2D" strokeWidth="6" />
      </svg>
    );
  }
  if (option.activityId === "spell-check") {
    return (
      <svg viewBox="0 0 236 168" aria-hidden style={common}>
        <rect width="236" height="168" fill="#EAF2FB" />
        <rect x="0" y="0" width="70" height="168" fill="#2D7CC4" />
        <path d="m162 105 35 35 57-86" fill="none" stroke="#FFF18A" strokeWidth="29" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M112 25h82M92 102h93" stroke="#283F91" strokeWidth="20" strokeLinecap="round" />
      </svg>
    );
  }
  if (option.activityId === "word-radar") {
    return (
      <svg viewBox="0 0 236 168" aria-hidden style={common}>
        <rect width="236" height="168" fill={accent} />
        <circle cx="95" cy="74" r="43" fill="#FFF7E1" stroke="#1F0F2D" strokeWidth="7" />
        <path d="m127 106 52 42" stroke="#1F0F2D" strokeWidth="12" strokeLinecap="round" />
        <path d="M73 72h45M94 50v45" stroke="#7C3AED" strokeWidth="7" strokeLinecap="round" />
      </svg>
    );
  }
  if (option.activityId === "letter-rush" || option.activityId === "wordle") {
    return (
      <svg viewBox="0 0 236 168" aria-hidden style={common}>
        <rect width="236" height="168" fill={accent} />
        {["A", "B", "C"].map((letter, idx) => (
          <g key={letter} transform={`translate(${38 + idx * 55} ${44 + (idx % 2) * 18}) rotate(${idx === 1 ? -5 : 6})`}>
            <rect width="46" height="46" rx="8" fill="#FFF7E1" stroke="#1F0F2D" strokeWidth="5" />
            <text x="23" y="32" textAnchor="middle" fontFamily="Inter, system-ui" fontSize="25" fontWeight="900" fill="#1F0F2D">
              {letter}
            </text>
          </g>
        ))}
      </svg>
    );
  }
  if (option.activityId === "wheel-of-fortune") {
    return (
      <svg viewBox="0 0 236 168" aria-hidden style={common}>
        <rect width="236" height="168" fill="#FCD34D" />
        <circle cx="118" cy="83" r="59" fill="#FFF7E1" stroke="#1F0F2D" strokeWidth="8" />
        {Array.from({ length: 8 }).map((_, idx) => {
          const rotation = idx * 45;
          const fill = idx % 2 === 0 ? "#E83A5C" : "#5B3FCB";
          return (
            <path
              key={idx}
              d="M118 83 118 26 A57 57 0 0 1 158 43 Z"
              fill={fill}
              opacity="0.95"
              transform={`rotate(${rotation} 118 83)`}
            />
          );
        })}
        <circle cx="118" cy="83" r="16" fill="#FFF7E1" stroke="#1F0F2D" strokeWidth="6" />
        <path d="m118 10 13 25h-26z" fill="#10B981" stroke="#1F0F2D" strokeWidth="6" strokeLinejoin="round" />
        <rect x="67" y="137" width="102" height="17" rx="8" fill="#1F0F2D" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 236 168" aria-hidden style={common}>
      <rect width="236" height="168" fill={accent} />
      <circle cx="118" cy="84" r="48" fill="#FFF7E1" opacity="0.95" />
      <text x="118" y="104" textAnchor="middle" fontFamily="Fraunces, Georgia, serif" fontSize="74" fontWeight="700" fill="#1F0F2D">
        ?
      </text>
    </svg>
  );
}

/** @deprecated Legacy AdventureMap overlay. Live homework choices use AdventureChoiceModal. */
export function MysteryChoiceOverlay({
  node,
  open,
  previewMode,
  onSelect,
  onDismiss,
}: {
  node: NodeConfig | null;
  open: boolean;
  previewMode: MapPreviewMode;
  onSelect: (option: MysteryChoiceOption) => void;
  onDismiss: () => void;
}) {
  const autoLaunchedRef = useRef<string | null>(null);
  const mode = node?.mysteryMode ?? "choice_lab";
  const options = node?.choiceOptions ?? [];
  const surprise = node?.surpriseOption ?? options[0] ?? null;
  const previewShowsChoiceSet =
    Boolean(previewMode) && mode === "surprise_drop" && options.length > 1;
  const displayMode = previewShowsChoiceSet ? "choice_lab" : mode;
  const renderedOptions =
    displayMode === "surprise_drop" && surprise ? [surprise] : options;

  useEffect(() => {
    if (!open) {
      autoLaunchedRef.current = null;
      return undefined;
    }
    if (previewMode) return undefined;
    if (displayMode !== "surprise_drop" || !surprise) return undefined;
    const key = `${node?.id}:${surprise.optionId}`;
    if (autoLaunchedRef.current === key) return undefined;
    autoLaunchedRef.current = key;
    const timer = window.setTimeout(() => onSelect(surprise), 1100);
    return () => window.clearTimeout(timer);
  }, [displayMode, node?.id, onSelect, open, previewMode, surprise]);

  if (!node) return null;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          data-testid="mystery-choice-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background:
              "radial-gradient(circle at 25% 18%, rgba(255,247,225,0.22), transparent 18%), radial-gradient(circle at 54% 82%, rgba(232,58,92,0.2), transparent 35%), linear-gradient(135deg, #0B0820 0%, #1F0F2D 54%, #220A2A 100%)",
            color: "#FFF7E1",
            overflowY: "auto",
            overflowX: "hidden",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0.13,
              backgroundImage:
                "repeating-linear-gradient(27deg, rgba(255,247,225,.32) 0 1px, transparent 1px 9px)",
              mixBlendMode: "screen",
            }}
          />
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(90deg, rgba(255,247,225,.18), transparent 18%, transparent 82%, rgba(255,247,225,.11))",
              pointerEvents: "none",
            }}
          />
          {previewMode ? (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                height: 38,
                zIndex: 5,
                background: "#FCD34D",
                color: "#1F0F2D",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                borderBottom: "2px solid #1F0F2D",
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>o</span>
              <span>Preview - events log but do not persist</span>
            </div>
          ) : null}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Back to map"
            style={{
              position: "absolute",
              top: previewMode ? 39 : 18,
              left: 32,
              zIndex: 6,
              height: 32,
              borderRadius: 4,
              border: "2px solid rgba(255,247,225,.55)",
              background: "rgba(255,247,225,.08)",
              color: "#FFF7E1",
              padding: "0 18px",
              fontSize: 13,
              fontWeight: 900,
              cursor: "pointer",
              boxShadow: "0 2px 0 rgba(255,247,225,.22)",
            }}
          >
            {"<- Back to map"}
          </button>
          <div
            style={{
              position: "relative",
              zIndex: 2,
              minHeight: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: previewMode ? "58px 24px 42px" : "46px 24px 42px",
            }}
          >
            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              style={{
                marginTop: 0,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  color: "#FCD34D",
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: "0.34em",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                {displayMode === "surprise_drop" ? "SURPRISE DROP" : "THREE DOORS"}
              </div>
              <div
                style={{
                  fontFamily: "Fraunces, Georgia, serif",
                  fontSize: "clamp(38px, 6vw, 62px)",
                  lineHeight: 0.95,
                  fontWeight: 700,
                  letterSpacing: 0,
                  color: "#FFF7E1",
                }}
              >
                {displayMode === "surprise_drop" ? "Sunny found a surprise" : "Step through one"}
              </div>
            </motion.div>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "stretch",
                gap: "clamp(18px, 4vw, 40px)",
                flexWrap: "wrap",
                width: "min(100%, 820px)",
                marginTop: "clamp(30px, 7vh, 86px)",
              }}
            >
              {renderedOptions.map((option, idx) => {
                const accent = accentFor(option);
                const locked = option.locked === true;
                const displayLabel = displayLabelFor(option);
                return (
                  <motion.button
                    key={option.optionId}
                    type="button"
                    data-testid="mystery-choice-card"
                    disabled={locked}
                    aria-label={`${option.purposeLabel} - ${displayLabel}${locked && option.lockedReason ? ` - ${option.lockedReason}` : ""}`}
                    tabIndex={idx + 1}
                    initial={{
                      opacity: 0,
                      y: 150,
                      x: (1 - idx) * 46,
                      scale: 0.72,
                      rotate: -8 + idx * 7,
                    }}
                    animate={{
                      opacity: locked ? 0.62 : 1,
                      y: 0,
                      x: 0,
                      scale: 1,
                      rotate: 0,
                    }}
                    transition={{ delay: idx * 0.08, type: "spring", stiffness: 170, damping: 18 }}
                    whileHover={locked ? undefined : { y: -4, scale: 1.02 }}
                    onClick={() => {
                      if (!locked) onSelect(option);
                    }}
                    style={{
                      width: "clamp(160px, 24vw, 238px)",
                      height: "clamp(218px, 34vw, 326px)",
                      borderRadius: 8,
                      border: `3px solid ${locked ? "rgba(31,15,45,.55)" : "#1F0F2D"}`,
                      background: "#FFF7E1",
                      color: "#1F0F2D",
                      boxShadow: `0 10px 0 ${accent}, 0 22px 44px rgba(0,0,0,.34)`,
                      padding: 0,
                      textAlign: "left",
                      cursor: locked ? "default" : "pointer",
                      filter: locked ? "saturate(.42)" : "none",
                      position: "relative",
                      overflow: "visible",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <div
                      style={{
                        flex: "0 0 52%",
                        borderTopLeftRadius: 5,
                        borderTopRightRadius: 5,
                        overflow: "hidden",
                        background: accent,
                      }}
                    >
                      <CardArt option={option} />
                    </div>
                    <div
                      style={{
                        flex: 1,
                        padding: "clamp(16px, 2.7vw, 28px) clamp(10px, 1.7vw, 16px)",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        gap: "clamp(7px, 1.4vw, 11px)",
                      }}
                    >
                      <div
                        style={{
                          color: accent,
                          fontSize: "clamp(8px, 1.2vw, 10px)",
                          lineHeight: 1,
                          fontWeight: 900,
                          letterSpacing: "0.28em",
                          textTransform: "uppercase",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {option.purposeLabel}
                      </div>
                      <div
                        style={{
                          fontFamily: "Fraunces, Georgia, serif",
                          fontSize: "clamp(17px, 2.8vw, 24px)",
                          fontWeight: 700,
                          lineHeight: 1,
                          letterSpacing: 0,
                        }}
                      >
                        {displayLabel}
                      </div>
                      {locked ? (
                        <div
                          style={{
                            fontSize: "clamp(9px, 1.3vw, 11px)",
                            lineHeight: 1.2,
                            fontWeight: 800,
                            color: "#6B4B7A",
                          }}
                        >
                          Locked: {option.lockedReason ?? "Need a few warm-up rounds first"}
                        </div>
                      ) : null}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
