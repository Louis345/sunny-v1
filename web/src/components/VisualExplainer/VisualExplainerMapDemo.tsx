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

  return (
    <>
      <AdventureMap
        childId="creator"
        mapSession={mapSession}
        previewMode="free"
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
        speechBubbleText={
          launchedNode?.type === "visual-explainer"
            ? "I am watching the model with you."
            : null
        }
      />
    </>
  );
}
