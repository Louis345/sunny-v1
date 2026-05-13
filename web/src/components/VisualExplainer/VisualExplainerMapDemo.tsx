import { useMemo, useState } from "react";
import { AdventureMap } from "../AdventureMap";
import { CompanionLayer } from "../CompanionLayer";
import childrenCfg from "../../../../children.config.json";
import type {
  CompanionEventPayload,
} from "../../../../src/shared/companionTypes";
import {
  mergeCompanionConfigWithDefaults,
  type CompanionConfig,
} from "../../../../src/shared/companionTypes";
import type {
  MapState,
  NodeConfig,
  NodeResult,
  SessionTheme,
} from "../../../../src/shared/adventureTypes";
import { applyLocalNodeResult } from "../../../../src/shared/mapLocalProgress";
import type { useMapSession } from "../../hooks/useMapSession";
import type { FlowGameSendMessage } from "../../utils/flowGameEvents";

type VisualLearnerMapDemoMode = "child" | "parent" | "playthrough";

const visualExplainerNode: NodeConfig = {
  id: "demo-erosion-treatment",
  type: "visual-explainer",
  isLocked: false,
  isCompleted: false,
  isGoal: false,
  difficulty: 1,
  thumbnailUrl: "/thumbnails/mystery-fallback.svg",
  theme: "Erosion Treatment",
};

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

function previewModeForDemoMode(
  mode: VisualLearnerMapDemoMode,
): false | "free" {
  return mode === "child" ? false : "free";
}

function flowModeForDemoMode(
  mode: VisualLearnerMapDemoMode,
): "pause-for-question" | "playthrough" {
  return mode === "playthrough" ? "playthrough" : "pause-for-question";
}

const demoTheme: SessionTheme = {
  name: "Care Plan Hills",
  source: "palette",
  palette: {
    sky: "#79c7f2",
    ground: "#6bbf72",
    accent: "#0ea5e9",
    particle: "#facc15",
    glow: "#a7f3d0",
    cardBackground: "#ffffff",
  },
  ambient: {
    type: "sparkles",
    count: 16,
    speed: 0.4,
    color: "#fef3c7",
  },
  nodeStyle: "rounded",
  pathStyle: "dashed",
  castleVariant: "sunny",
  backgroundUrl: "/backgrounds/map-pastel-hills.png",
  castleUrl: null,
  nodeThumbnails: {
    "visual-explainer": "/thumbnails/mystery-fallback.svg",
    quest: "/thumbnails/mystery-fallback.svg",
    boss: null,
  },
  mapWaypoints: [
    { x: 0.12, y: 0.78 },
    { x: 0.33, y: 0.58 },
    { x: 0.55, y: 0.43 },
    { x: 0.76, y: 0.29 },
  ],
};

function createInitialMapState(): MapState {
  return {
    childId: "creator",
    sessionDate: "2026-05-08",
    currentNodeIndex: 1,
    completedNodes: ["map-intake"],
    xp: 25,
    level: 2,
    theme: demoTheme,
    nodes: [
      {
        id: "map-intake",
        type: "concept-check",
        isLocked: false,
        isCompleted: true,
        isGoal: false,
        difficulty: 1,
        thumbnailUrl: "/thumbnails/mystery-fallback.svg",
        theme: "Baseline Check",
      },
      visualExplainerNode,
      {
        id: "map-quest-after-care",
        type: "quest",
        isLocked: true,
        isCompleted: false,
        isGoal: false,
        difficulty: 2,
        thumbnailUrl: "/thumbnails/mystery-fallback.svg",
        theme: "Quest unlocks after evidence",
      },
      {
        id: "map-boss-transfer",
        type: "boss",
        isLocked: true,
        isCompleted: false,
        isGoal: true,
        difficulty: 3,
        theme: "Transfer Boss",
      },
    ],
  };
}

export function VisualExplainerMapDemo(): React.ReactElement {
  const [mapState, setMapState] = useState<MapState>(() => createInitialMapState());
  const [launchedNode, setLaunchedNode] = useState<NodeConfig | null>(null);
  const [companionEvents, setCompanionEvents] = useState<CompanionEventPayload[]>([]);
  const [demoMode, setDemoMode] = useState<VisualLearnerMapDemoMode>(() =>
    readInitialDemoMode(),
  );
  const previewMode = previewModeForDemoMode(demoMode);
  const visualLearnerFlowMode = flowModeForDemoMode(demoMode);
  const companion = useMemo<CompanionConfig>(() => {
    const raw = childrenCfg.companions.matilda;
    return mergeCompanionConfigWithDefaults({
      companionId: raw.id,
      vrmUrl: raw.vrmUrl,
      expressions: raw.expressions,
      faceCamera: raw.faceCamera as CompanionConfig["faceCamera"],
      dopamineGames: raw.dopamineGames,
    });
  }, []);

  const mapSession = useMemo<ReturnType<typeof useMapSession>>(
    () => ({
      mapState,
      theme: mapState.theme,
      sessionId: "visual-explainer-map-demo",
      connectionStatus: "open",
      connectionError: null,
      onNodeClick: async (nodeId: string) =>
        mapState.nodes.find((node) => node.id === nodeId) ?? null,
      commitLaunchedNode: (node: NodeConfig) => {
        console.log("  🎮 [VisualExplainerMapDemo] node_launched", {
          nodeId: node.id,
          nodeType: node.type,
        });
        setLaunchedNode(node);
      },
      launchedNode,
      clearLaunchedNode: () => setLaunchedNode(null),
      sendNodeResult: async (result: NodeResult) => {
        console.log("  🎮 [VisualExplainerMapDemo] node_result", result);
        const next = applyLocalNodeResult(mapState, result);
        setMapState(next);
        setLaunchedNode(null);
        return next;
      },
      sendNodeRating: async () => {},
      companionEvents,
      companionCommands: [],
      forwardMapIframeCompanionEvent: (payload: CompanionEventPayload) => {
        setCompanionEvents((prev) => [...prev, payload]);
      },
      forwardMapIframeGameStateUpdate: () => {},
      forwardMapIframeCurrencyAward: async () => {},
      purchaseStoryMovie: async () => ({ balance: 0, cost: 0 }),
      liveMapCurrency: null,
      sessionStarted: true,
    }),
    [companionEvents, launchedNode, mapState],
  );

  const sendMessage: FlowGameSendMessage = (type, payload) => {
    if (type !== "game_event") return;
    const event = payload?.event;
    if (!event || typeof event !== "object") return;
    const e = event as { type?: string; payload?: unknown };
    if (e.type === "companion_event" && e.payload && typeof e.payload === "object") {
      setCompanionEvents((prev) => [...prev, e.payload as CompanionEventPayload]);
      return;
    }
    if (e.type === "game_state_update") {
      console.log("  🎮 [VisualExplainerMapDemo] game_state_update", e.payload);
      return;
    }
    if (e.type === "attempt_event") {
      console.log("  🎮 [VisualExplainerMapDemo] attempt_event", e.payload);
      return;
    }
    if (e.type === "game_complete") {
      console.log("  🎮 [VisualExplainerMapDemo] game_complete", e.payload);
    }
  };

  const changeDemoMode = (next: VisualLearnerMapDemoMode) => {
    if (next === demoMode) return;
    console.log("  🎮 [VisualExplainerMapDemo] mode_changed", {
      from: demoMode,
      to: next,
    });
    setLaunchedNode(null);
    setDemoMode(next);
    updateDemoModeUrl(next);
  };

  return (
    <>
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
      <AdventureMap
        key={demoMode}
        childId="creator"
        mapSession={mapSession}
        previewMode={previewMode}
        visualLearnerFlowMode={visualLearnerFlowMode}
        inspectAllMode
        companionMutedForMap
        mapCompanion={companion}
        companionCurrency={0}
        karaokeReadingForMapNode={{
          words: [],
          interimTranscript: "",
          sendMessage,
          companion,
          childId: "creator",
        }}
      />
      <CompanionLayer
        childId="creator"
        companion={companion}
        toggledOff={false}
        mode={launchedNode?.type === "visual-explainer" ? "portrait" : "full"}
        companionEvents={companionEvents}
        micMuted
        speechBubbleText={null}
      />
    </>
  );
}
