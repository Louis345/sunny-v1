import { motion } from "framer-motion";
import { useEffect, useState, type CSSProperties } from "react";
import type { NodeConfig } from "../../../src/shared/adventureTypes";
import { NODE_DISPLAY_LABELS } from "../../../src/shared/nodeRegistry";

export function NodeCard({
  node,
  position,
  thumbnail,
  onClick,
  isActive,
  onHoverChange,
  onLockedClick,
  customStyle,
  allowReplayWhenCompleted = false,
  /** When true, node renders/taps as locked even if `node.isLocked` is false (quest ceremony). */
  forceLocked = false,
  /** Replaces default lock glyph in the locked circle (e.g. ⚡ during quest unlock). */
  lockGlyphOverride = null,
}: {
  node: NodeConfig;
  position: { x: number; y: number };
  thumbnail?: string | null;
  onClick: () => void;
  isActive: boolean;
  onHoverChange?: (hovering: boolean) => void;
  /** Fired when the learner taps a locked node (voice session can react). */
  onLockedClick?: () => void;
  customStyle?: CSSProperties;
  /**
   * When true (diag unlock-map), completed nodes remain interactive so games can replay.
   * Normal sessions keep completed nodes non-interactive.
   */
  allowReplayWhenCompleted?: boolean;
  forceLocked?: boolean;
  lockGlyphOverride?: string | null;
}) {
  const isGoal = node.isGoal;
  const isMystery = node.type === "mystery";
  const isLocked = node.isLocked || forceLocked;
  const isDone = node.isCompleted;
  const doneButReplayable = isDone && allowReplayWhenCompleted;
  const interactionLocked = isDone && !doneButReplayable;
  const typeLabel = NODE_DISPLAY_LABELS[node.type] ?? node.type;
  const size = isGoal ? 120 : 88;
  const borderColor = isGoal ? "#FCD34D" : "white";
  const borderWidth = isGoal ? 5 : 4;
  const [failedThumbnail, setFailedThumbnail] = useState<string | null>(null);
  const showThumbnail = Boolean(thumbnail && thumbnail !== failedThumbnail && !isLocked);

  useEffect(() => {
    setFailedThumbnail(null);
  }, [thumbnail]);

  const baseShadow = isGoal
    ? "0 10px 28px rgba(0,0,0,0.35), 0 0 0 1px rgba(252,211,77,0.35)"
    : "0 8px 24px rgba(0,0,0,0.25)";

  return (
    <motion.div
      role="button"
      tabIndex={isLocked ? -1 : 0}
      onPointerEnter={() => {
        if (!isLocked && (!isDone || doneButReplayable)) onHoverChange?.(true);
      }}
      onPointerLeave={() => {
        onHoverChange?.(false);
      }}
      onClick={() => {
        if (interactionLocked) return;
        if (isLocked) {
          onLockedClick?.();
          return;
        }
        onClick();
      }}
      onKeyDown={(e) => {
        if (interactionLocked) return;
        if (isLocked) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onLockedClick?.();
          }
          return;
        }
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        position: "absolute",
        left: position.x,
        top: position.y,
        /* Center with margins so Motion `scale` does not clobber translate(-50%,-50%). */
        marginLeft: -size / 2,
        marginTop: -size / 2,
        zIndex: isGoal ? 4 : 3,
        width: size,
        height: size,
        borderRadius: "50%",
        border: `${borderWidth}px solid ${borderColor}`,
        boxShadow: baseShadow,
        cursor: isLocked || interactionLocked ? "default" : "pointer",
        filter: isLocked ? "grayscale(0.6)" : "none",
        ...customStyle,
      }}
      whileHover={
        isActive && !isLocked && (!isDone || doneButReplayable)
          ? { scale: isGoal ? 1.06 : 1.12 }
          : undefined
      }
      animate={
        isMystery
          ? false
          : isActive && !isLocked && (!isDone || doneButReplayable)
          ? isGoal
            ? {
                scale: [1, 1.05, 1],
                boxShadow: [
                  "0 10px 28px rgba(0,0,0,0.35), 0 0 24px 6px rgba(252,211,77,0.45)",
                  "0 12px 36px rgba(0,0,0,0.4), 0 0 40px 12px rgba(250,204,21,0.35)",
                  "0 10px 28px rgba(0,0,0,0.35), 0 0 24px 6px rgba(252,211,77,0.45)",
                ],
              }
            : {
                scale: [1, 1.06, 1],
                boxShadow: [
                  "0 8px 24px rgba(0,0,0,0.25)",
                  "0 8px 32px rgba(255,255,255,0.6)",
                  "0 8px 24px rgba(0,0,0,0.25)",
                ],
              }
          : false
      }
      transition={
        isMystery
          ? { duration: 0 }
          : isActive && !isLocked && (!isDone || doneButReplayable)
          ? { repeat: Infinity, duration: isGoal ? 2.2 : 2 }
          : { duration: 0 }
      }
    >
      {isGoal && isActive && !isLocked && (!isDone || doneButReplayable) && (
        <motion.div
          aria-hidden
          animate={{ rotate: [0, 18, -12, 0], opacity: [0.55, 0.85, 0.55] }}
          transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
          style={{
            position: "absolute",
            inset: -28,
            borderRadius: "50%",
            background:
              "conic-gradient(from 0deg, transparent 0deg, rgba(252,211,77,0.25) 40deg, transparent 80deg, rgba(250,204,21,0.2) 120deg, transparent 160deg, rgba(252,211,77,0.22) 200deg, transparent 240deg, rgba(254,243,199,0.2) 280deg, transparent 320deg)",
            pointerEvents: "none",
            zIndex: -1,
          }}
        />
      )}
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: "50%",
          overflow: "hidden",
          position: "relative",
          background: "#f1f5f9",
        }}
      >
        {isDone ? (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: isGoal ? "#FEF3C7" : "#D1FAE5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: isGoal ? 42 : 36,
              color: isGoal ? "#92400E" : "#065F46",
            }}
          >
            {"\u2713"}
          </div>
        ) : showThumbnail ? (
          <img
            src={thumbnail ?? ""}
            alt=""
            onError={() => setFailedThumbnail(thumbnail ?? null)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : isLocked ? (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: "#CBD5E1",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: isGoal ? 34 : 28,
            }}
          >
            {lockGlyphOverride && lockGlyphOverride.length > 0
              ? lockGlyphOverride
              : "\u{1F512}"}
          </div>
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: isGoal ? "linear-gradient(145deg, #FCD34D 0%, #D97706 100%)" : "#7C3AED",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: isGoal ? 40 : 24,
              fontWeight: 700,
            }}
          >
            {isGoal ? "★" : (typeLabel[0]?.toUpperCase() ?? "?")}
          </div>
        )}
      </div>
      <div
        style={{
          position: "absolute",
          top: "100%",
          left: "50%",
          transform: "translateX(-50%)",
          marginTop: 6,
          fontSize: isGoal ? 13 : 11,
          fontWeight: isGoal ? 700 : 600,
          color: isGoal ? "#FCD34D" : "white",
          whiteSpace: "nowrap",
          textShadow: isGoal
            ? "0 0 12px rgba(0,0,0,0.85), 0 2px 8px rgba(0,0,0,0.6)"
            : "0 1px 4px rgba(0,0,0,0.6)",
          pointerEvents: "none",
        }}
      >
        {isGoal ? (isMystery ? typeLabel : "BOSS") : typeLabel}
      </div>
    </motion.div>
  );
}
