import { useEffect, useState } from "react";
import type { BlackboardState } from "../hooks/useSession";

interface Props {
  blackboard: BlackboardState;
}

export function BlackboardContent({ blackboard }: Props) {
  const [visible, setVisible] = useState(false);
  const nunito = {
    fontFamily: "'Nunito', sans-serif",
    fontWeight: 900,
  };

  // Flash: show for duration then auto-hide
  // flashKey incrementing re-triggers this effect
  useEffect(() => {
    if (blackboard.gesture === "flash" && blackboard.word) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
      }, blackboard.duration ?? 3000);
      return () => clearTimeout(timer);
    }
    if (blackboard.gesture === "reveal" && blackboard.word) {
      setVisible(true);
    }
    if (blackboard.gesture === "mask" && blackboard.maskedWord) {
      setVisible(true);
    }
    if (blackboard.gesture === "clear") {
      setVisible(false);
    }
  }, [
    blackboard.gesture,
    blackboard.flashKey,
    blackboard.word,
    blackboard.maskedWord,
    blackboard.duration,
  ]);

  if (!visible) return null;
  if (blackboard.gesture === "clear") return null;

  // mask gesture — render word with _ styled differently
  if (blackboard.gesture === "mask" && blackboard.maskedWord) {
    const chars = blackboard.maskedWord.split("");
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          flexWrap: "nowrap",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: "4px",
          ...nunito,
        }}
      >
        {chars.map((char: string, i: number) => (
          <span
            key={i}
            style={{
              fontSize: "clamp(3rem, 10vw, 7rem)",
              lineHeight: 1,
              color: char === "_" ? "#EF9F27" : "#1a1a2e",
              borderBottom:
                char === "_" ? "6px solid #EF9F27" : "6px solid transparent",
              paddingBottom: "4px",
              minWidth: "0.6em",
              textAlign: "center",
              transition: "color 0.2s",
            }}
          >
            {char === "_" ? "_" : char}
          </span>
        ))}
      </div>
    );
  }

  // flash and reveal — show full word large
  const word = blackboard.word ?? "";
  return (
    <div
      style={{
        ...nunito,
        fontSize: "clamp(4rem, 12vw, 9rem)",
        color: "#1a1a2e",
        letterSpacing: "0.05em",
        userSelect: "none",
        animation:
          blackboard.gesture === "flash"
            ? "wordPop 0.3s ease-out"
            : undefined,
      }}
    >
      {word}
    </div>
  );
}
