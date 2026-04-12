import { motion } from "framer-motion";

export function XPBar({
  level,
  xp,
  xpToNext,
  side = "left",
}: {
  level: number;
  xp: number;
  xpToNext: number;
  side?: "left" | "right";
}) {
  const safeNext = Math.max(1, xpToNext);
  const pct = Math.min(100, Math.round((xp / safeNext) * 100));

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: side === "left" ? 16 : undefined,
        right: side === "right" ? 16 : undefined,
        zIndex: 10,
        background: "rgba(255,255,255,0.95)",
        borderRadius: 12,
        padding: "10px 16px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        fontFamily: "system-ui, sans-serif",
        minWidth: 160,
      }}
    >
      <div style={{ fontSize: 13, color: "#7C3AED", fontWeight: 600 }}>
        ⭐ Level {level}
      </div>
      <div
        style={{
          marginTop: 6,
          height: 8,
          background: "#E9D5FF",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <motion.div
          style={{ height: "100%", background: "#7C3AED", borderRadius: 4 }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
      <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 3 }}>
        {xp} / {safeNext} XP
      </div>
    </div>
  );
}
