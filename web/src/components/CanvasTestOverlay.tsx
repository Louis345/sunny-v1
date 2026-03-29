import { useState } from "react";
import LottieRaw from "lottie-react";
import {
  CANVAS_REGISTRY,
  type CanvasCapabilityEntry,
  type CanvasCapabilityPreview,
} from "../../../src/server/canvas/registry";
import { CANVAS_TEST_PRESETS } from "../../../src/scripts/canvas-test-presets";

const Lottie =
  (LottieRaw as unknown as { default: typeof LottieRaw }).default ?? LottieRaw;

interface Props {
  sendMessage: (type: string, payload?: Record<string, unknown>) => void;
  /** When true (e.g. server DEBUG_CLAUDE), show overlay even off localhost. */
  forceVisible?: boolean;
}

export function CanvasTestOverlay({
  sendMessage,
  forceVisible = false,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredCapability, setHoveredCapability] =
    useState<CanvasCapabilityEntry | null>(null);
  const [hoveredPreview, setHoveredPreview] =
    useState<CanvasCapabilityPreview | null>(null);
  const [mode, setMode] = useState<
    | "teaching"
    | "riddle"
    | "reward"
    | "championship"
    | "place_value"
    | "spelling"
    | "word-builder"
  >("teaching");
  const [content, setContent] = useState("");
  const [label, setLabel] = useState("");
  const [fired, setFired] = useState(false);

  const isEnvDev =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.search.includes("debug=1") ||
    (typeof document !== "undefined" &&
      document.cookie.includes("sunny_debug=1"));
  if (!isEnvDev && !forceVisible) return null;

  function fireCapability(args: Record<string, unknown>) {
    const a = { ...args };
    if (a.type === "spelling") {
      if (a.spellingWord == null && a.word != null) {
        a.spellingWord = a.word;
      }
      if (a.spellingRevealed == null && a.revealed != null) {
        a.spellingRevealed = a.revealed;
      }
      delete a.word;
      delete a.revealed;
    }
    sendMessage("tool_call", { tool: "canvasShow", args: a });
    setFired(true);
    setTimeout(() => setFired(false), 800);
  }

  const fireManual = () => {
    const args: Record<string, unknown> = { mode, content, label };
    if (mode === "spelling" && content) {
      args.spellingWord = content;
      args.spellingRevealed = [];
    }
    sendMessage("tool_call", {
      tool: "showCanvas",
      args,
    });
    setFired(true);
    setTimeout(() => setFired(false), 800);
  };

  const fireCanvasHarnessPreset = (
    state: (typeof CANVAS_TEST_PRESETS)[number]["state"],
  ) => {
    sendMessage("canvas_draw", {
      mode: state.mode,
      gameUrl: state.gameUrl,
      gameWord: state.gameWord,
      gamePlayerName: state.gamePlayerName,
      wordBuilderRound: state.wordBuilderRound,
      wordBuilderMode: state.wordBuilderMode,
    });
    setMode(state.mode);
    setFired(true);
    setTimeout(() => setFired(false), 800);
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed bottom-4 right-4 z-50 px-3 py-1.5 bg-gray-800 text-white text-xs rounded-lg shadow-lg hover:bg-gray-700"
      >
        Canvas Test
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 max-h-[85vh] overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg p-3">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700">Canvas Test</span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="text-gray-400 hover:text-gray-600 text-xs"
        >
          −
        </button>
      </div>
      <div className="space-y-2">
        <div className="flex gap-1 flex-wrap">
          {(
            [
              "teaching",
              "riddle",
              "reward",
              "championship",
              "place_value",
              "spelling",
            ] as const
          ).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-2 py-1 text-xs rounded ${
                mode === m ? "bg-blue-500 text-white" : "bg-gray-100"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full px-2 py-1 text-sm border border-gray-200 rounded"
        />
        <input
          type="text"
          placeholder="Label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full px-2 py-1 text-sm border border-gray-200 rounded"
        />
        <button
          type="button"
          onClick={fireManual}
          className="w-full py-1.5 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
        >
          {fired ? "✓" : "Fire"}
        </button>

        <div className="w-full min-h-[8rem] bg-gray-50 rounded border border-gray-100 flex items-center justify-center overflow-hidden p-2">
          {hoveredPreview?.lottieData != null ? (
            <Lottie
              animationData={hoveredPreview.lottieData as object}
              loop
              autoplay
              style={{ width: 120, height: 120 }}
            />
          ) : hoveredPreview?.svg ? (
            <div
              style={{
                transform: "scale(0.65)",
                transformOrigin: "center center",
              }}
              dangerouslySetInnerHTML={{ __html: hoveredPreview.svg }}
            />
          ) : hoveredPreview?.text ? (
            <p className="text-xs text-gray-600 whitespace-pre-wrap text-center">
              {hoveredPreview.text}
            </p>
          ) : (
            <span className="text-xs text-gray-300">hover a preset</span>
          )}
        </div>
        {hoveredCapability ? (
          <p className="text-[10px] text-gray-500 leading-snug">
            {hoveredCapability.description}
          </p>
        ) : null}

        <div className="flex gap-1 flex-wrap pt-1 border-t border-gray-100">
          <span className="text-[10px] text-gray-500 w-full uppercase tracking-wide">
            Registry (canvasShow)
          </span>
          {Object.entries(CANVAS_REGISTRY).map(([type, cap]) => (
            <span key={type} className="flex flex-wrap gap-1 w-full">
              <button
                type="button"
                onMouseEnter={() => {
                  setHoveredCapability(cap);
                  setHoveredPreview(cap.preview ?? null);
                }}
                onMouseLeave={() => {
                  setHoveredCapability(null);
                  setHoveredPreview(null);
                }}
                onClick={() =>
                  fireCapability({ type, ...cap.example.params })
                }
                className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
              >
                {type}
              </button>
              {cap.variants?.map((v) => (
                <button
                  key={v.label}
                  type="button"
                  onMouseEnter={() =>
                    setHoveredPreview(v.preview ?? cap.preview ?? null)
                  }
                  onMouseLeave={() => setHoveredPreview(null)}
                  onClick={() => fireCapability({ type, ...v.args })}
                  className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                >
                  {v.label}
                </button>
              ))}
            </span>
          ))}
        </div>

        <div className="flex gap-1 flex-wrap pt-1 border-t border-gray-100">
          <span className="text-[10px] text-gray-500 w-full uppercase tracking-wide">
            Harness (no AI)
          </span>
          {CANVAS_TEST_PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => fireCanvasHarnessPreset(p.state)}
              className="px-2 py-1 text-xs bg-emerald-100 text-emerald-900 rounded hover:bg-emerald-200"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
