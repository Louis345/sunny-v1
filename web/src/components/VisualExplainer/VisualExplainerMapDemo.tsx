import { useState } from "react";
import { VisualExplainerDemo } from "./VisualExplainerDemo";
import type { FlowGameSendMessage } from "../../utils/flowGameEvents";

type VisualLearnerMapDemoMode = "child" | "parent" | "playthrough";

function readInitialDemoMode(): VisualLearnerMapDemoMode {
  if (typeof window === "undefined") return "child";
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("chrome") || params.get("mode") || "";
  if (raw === "parent") return "parent";
  if (raw === "playthrough") return "playthrough";
  return "child";
}

function updateDemoModeUrl(mode: VisualLearnerMapDemoMode): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("chrome", mode);
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export function VisualExplainerMapDemo(): React.ReactElement {
  const [demoMode, setDemoMode] = useState<VisualLearnerMapDemoMode>(() =>
    readInitialDemoMode(),
  );
  const visualLearnerFlowMode =
    demoMode === "playthrough" ? "playthrough" : "pause-for-question";
  const mapMode = demoMode === "child";

  const sendMessage: FlowGameSendMessage = (type, payload) => {
    if (type !== "game_event") return;
    const event = payload?.event;
    if (!event || typeof event !== "object") return;
    const e = event as { type?: string; payload?: unknown };
    if (e.type === "game_state_update") {
      console.log("  🎮 [VisualExplainerDemo] game_state_update", e.payload);
      return;
    }
    if (e.type === "attempt_event") {
      console.log("  🎮 [VisualExplainerDemo] attempt_event", e.payload);
      return;
    }
    if (e.type === "game_complete") {
      console.log("  🎮 [VisualExplainerDemo] game_complete", e.payload);
    }
  };

  const changeDemoMode = (next: VisualLearnerMapDemoMode) => {
    if (next === demoMode) return;
    console.log("  🎮 [VisualExplainerDemo] mode_changed", {
      from: demoMode,
      to: next,
    });
    setDemoMode(next);
    updateDemoModeUrl(next);
  };

  return (
    <div
      data-testid="visual-learner-map-shell"
      data-flow-mode={visualLearnerFlowMode}
      className="min-h-screen bg-slate-950"
    >
      <div
        data-testid="visual-learner-map-mode-switcher"
        style={{
          position: "fixed",
          top: 14,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10050,
          display: "flex",
          gap: 6,
          alignItems: "center",
          padding: "7px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.92)",
          border: "1px solid rgba(15,34,55,0.16)",
          boxShadow: "0 10px 28px rgba(15,34,55,0.18)",
          backdropFilter: "blur(10px)",
        }}
      >
        {[
          ["child", "Child"],
          ["parent", "Parent"],
          ["playthrough", "Playthrough"],
        ].map(([mode, label]) => {
          const active = demoMode === mode;
          return (
            <button
              key={mode}
              type="button"
              aria-pressed={active}
              onClick={() => changeDemoMode(mode as VisualLearnerMapDemoMode)}
              style={{
                border: 0,
                borderRadius: 999,
                padding: "8px 13px",
                fontWeight: 850,
                cursor: "pointer",
                color: active ? "#ffffff" : "#17324d",
                background: active
                  ? "linear-gradient(135deg,#6d5ef5,#8b5cf6)"
                  : "transparent",
                boxShadow: active
                  ? "0 8px 18px rgba(109,94,245,0.28)"
                  : "none",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <VisualExplainerDemo
        childId="creator"
        mapNodeId="demo-erosion-treatment"
        mapMode={mapMode}
        sendMessage={sendMessage}
        onComplete={(event) => {
          console.log("  🎮 [VisualExplainerDemo] complete", event);
        }}
      />
    </div>
  );
}
