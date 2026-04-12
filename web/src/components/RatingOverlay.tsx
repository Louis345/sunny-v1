import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

export function RatingOverlay({
  onRate,
  nodeType,
}: {
  onRate: (rating: "like" | "dislike" | null) => void;
  nodeType: string;
}) {
  const onRateRef = useRef(onRate);
  onRateRef.current = onRate;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onRateRef.current(null);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      style={{
        position: "absolute",
        bottom: 32,
        right: 32,
        zIndex: 10,
        background: "rgba(255,255,255,0.96)",
        borderRadius: 16,
        padding: "14px 20px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
        minWidth: 200,
      }}
    >
      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10 }}>
        How was {nodeType}?
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          onClick={() => onRate("like")}
          style={{
            flex: 1,
            padding: "8px 0",
            borderRadius: 10,
            background: "#D1FAE5",
            border: "1px solid #6EE7B7",
            color: "#065F46",
            fontSize: 13,
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          👍 Loved it
        </button>
        <button
          type="button"
          onClick={() => onRate("dislike")}
          style={{
            flex: 1,
            padding: "8px 0",
            borderRadius: 10,
            background: "#FEF3C7",
            border: "1px solid #FCD34D",
            color: "#92400E",
            fontSize: 13,
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          😐 It was ok
        </button>
      </div>
    </motion.div>
  );
}
