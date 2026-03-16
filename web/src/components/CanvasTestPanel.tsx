import { useState } from "react";
import LottieRaw from "lottie-react";
import celebrationData from "../assets/celebrations.json";

const Lottie =
  (LottieRaw as unknown as { default: typeof LottieRaw }).default ?? LottieRaw;
interface Props {
  sendMessage: (type: string, payload?: Record<string, unknown>) => void;
}

const PRINCESS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150" width="140" height="175">
  <defs><linearGradient id="crown" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#FFD700"/><stop offset="100%" style="stop-color:#FFA500"/></linearGradient>
  <linearGradient id="dress" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#E91E63"/><stop offset="100%" style="stop-color:#AD1457"/></linearGradient></defs>
  <path d="M60 8 L72 38 L92 28 L82 52 L102 48 L68 58 L60 52 L52 58 L18 48 L38 52 L28 28 L48 38 Z" fill="url(#crown)" stroke="#B8860B" stroke-width="1"/>
  <circle cx="60" cy="82" r="36" fill="#FFE4C4"/>
  <circle cx="48" cy="76" r="4" fill="#333"/>
  <circle cx="72" cy="76" r="4" fill="#333"/>
  <path d="M44 98 Q60 108 76 98" stroke="#E63946" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M24 118 L60 98 L96 118 L88 152 L32 152 Z" fill="url(#dress)"/>
  <path d="M38 152 L52 128 L66 152 L80 128 L82 152" fill="#C2185B"/>
</svg>`;

const HITODAMA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150" width="140" height="175">
<style>@keyframes hitodama-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}@keyframes hitodama-sparkle{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(0.7)}}</style>
<g style="animation:hitodama-float 2s ease-in-out infinite">
<circle cx="60" cy="65" r="28" fill="#4FC3F7" stroke="#111" stroke-width="2"/>
<circle cx="52" cy="60" r="3" fill="#111"/>
<circle cx="68" cy="60" r="3" fill="#111"/>
<path d="M48 78 Q60 88 72 78" stroke="#111" stroke-width="2" fill="none"/>
<path d="M55 95 L60 135 L65 95 Z" fill="#4FC3F7" stroke="#111" stroke-width="2"/>
<circle cx="35" cy="55" r="4" fill="#FFEB3B" style="animation:hitodama-sparkle 0.8s ease-in-out infinite"/>
<circle cx="85" cy="55" r="4" fill="#FFEB3B" style="animation:hitodama-sparkle 0.8s ease-in-out 0.3s infinite"/>
<circle cx="60" cy="35" r="3" fill="#FFEB3B" style="animation:hitodama-sparkle 0.8s ease-in-out 0.15s infinite"/>
</g></svg>`;

const KODAMA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150" width="140" height="175">
<style>@keyframes kodama-glow{0%,100%{opacity:1}50%{opacity:0.7}}</style>
<circle cx="60" cy="75" r="35" fill="#F5F5F5" stroke="#111" stroke-width="2" style="animation:kodama-glow 1.5s ease-in-out infinite"/>
<circle cx="52" cy="70" r="3" fill="#111"/>
<circle cx="68" cy="70" r="3" fill="#111"/>
<circle cx="60" cy="82" r="5" fill="none" stroke="#111" stroke-width="2"/>
<rect x="54" y="38" width="12" height="14" fill="#81C784" stroke="#111" stroke-width="2"/>
</svg>`;

const TENGU_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150" width="140" height="175">
<style>@keyframes tengu-flap{0%,100%{transform:scaleX(1)}50%{transform:scaleX(0.8)}}</style>
<circle cx="60" cy="45" r="22" fill="#EF5350" stroke="#111" stroke-width="2"/>
<path d="M70 45 L95 50 L70 55 Z" fill="#EF5350" stroke="#111" stroke-width="2"/>
<path d="M48 55 Q60 62 72 55" stroke="#111" stroke-width="2" fill="none"/>
<rect x="42" y="65" width="36" height="50" fill="#1A237E" stroke="#111" stroke-width="2"/>
<rect x="15" y="70" width="12" height="35" fill="#ECEFF1" stroke="#111" stroke-width="2" style="animation:tengu-flap 0.4s ease-in-out infinite;transform-origin:21px 70px"/>
<rect x="93" y="70" width="12" height="35" fill="#ECEFF1" stroke="#111" stroke-width="2" style="animation:tengu-flap 0.4s ease-in-out infinite;transform-origin:99px 70px"/>
</svg>`;

const ONI_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150" width="140" height="175">
<style>@keyframes oni-shimmer{0%,100%{opacity:1}50%{opacity:0.5}}@keyframes oni-sparkle{0%,100%{opacity:1;transform:translateY(0) scale(1)}50%{opacity:0.4;transform:translateY(-8px) scale(1.2)}}</style>
<circle cx="60" cy="45" r="25" fill="#42A5F5" stroke="#111" stroke-width="2"/>
<path d="M45 25 L55 45 L45 35 Z" fill="#FFD600" stroke="#111" stroke-width="2"/>
<path d="M75 25 L65 45 L75 35 Z" fill="#FFD600" stroke="#111" stroke-width="2"/>
<path d="M48 42 L52 48 M68 42 L72 48" stroke="#111" stroke-width="2"/>
<path d="M42 55 Q60 68 78 55" stroke="#111" stroke-width="2" fill="none"/>
<rect x="42" y="68" width="36" height="28" fill="#42A5F5" stroke="#111" stroke-width="2"/>
<rect x="42" y="88" width="36" height="8" fill="#FFD600" stroke="#111" stroke-width="2"/>
<rect x="44" y="96" width="32" height="35" fill="#E53935" stroke="#111" stroke-width="2"/>
<circle cx="55" cy="115" r="5" fill="#111"/>
<circle cx="65" cy="115" r="5" fill="#111"/>
<rect x="25" y="75" width="14" height="35" fill="#FFD600" stroke="#111" stroke-width="2" style="animation:oni-shimmer 0.8s ease-in-out infinite"/>
<circle cx="35" cy="35" r="4" fill="#FFEB3B" style="animation:oni-sparkle 1s ease-in-out infinite"/>
<circle cx="85" cy="35" r="4" fill="#FFEB3B" style="animation:oni-sparkle 1s ease-in-out 0.1s infinite"/>
<circle cx="60" cy="18" r="3" fill="#FFEB3B" style="animation:oni-sparkle 1s ease-in-out 0.2s infinite"/>
</svg>`;

const KITSUNE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150" width="140" height="175">
<style>@keyframes kitsune-shimmer{0%,100%{opacity:1}50%{opacity:0.6}}</style>
<circle cx="60" cy="50" r="22" fill="#FFB300" stroke="#111" stroke-width="2"/>
<path d="M48 28 L55 45 L62 28 Z" fill="#FFB300" stroke="#111" stroke-width="2"/>
<path d="M58 28 L65 45 L72 28 Z" fill="#FFB300" stroke="#111" stroke-width="2"/>
<path d="M50 28 L55 35 L58 28" fill="#FF6F00" stroke="#111" stroke-width="1"/>
<path d="M62 28 L65 35 L70 28" fill="#FF6F00" stroke="#111" stroke-width="1"/>
<ellipse cx="52" cy="48" rx="2" ry="4" fill="#111"/>
<ellipse cx="68" cy="48" rx="2" ry="4" fill="#111"/>
<path d="M46 58 Q60 64 74 58" stroke="#111" stroke-width="1" fill="none"/>
<ellipse cx="60" cy="95" rx="22" ry="28" fill="#FFB300" stroke="#111" stroke-width="2"/>
<rect x="52" y="68" width="16" height="6" fill="#FF6F00" stroke="#111" stroke-width="1"/>
<path d="M38 95 L25 130 L45 105 Z" fill="#FFB300" stroke="#111" stroke-width="2" style="animation:kitsune-shimmer 1.2s ease-in-out infinite"/>
<path d="M60 95 L45 135 L65 110 Z" fill="#FFB300" stroke="#111" stroke-width="2" style="animation:kitsune-shimmer 1.2s ease-in-out 0.2s infinite"/>
<path d="M82 95 L95 130 L75 105 Z" fill="#FFB300" stroke="#111" stroke-width="2" style="animation:kitsune-shimmer 1.2s ease-in-out 0.4s infinite"/>
<path d="M25 130 L35 120 L45 130" fill="#FF6F00" stroke="#111" stroke-width="1"/>
<path d="M45 135 L55 125 L65 135" fill="#FF6F00" stroke="#111" stroke-width="1"/>
<path d="M75 130 L85 120 L95 130" fill="#FF6F00" stroke="#111" stroke-width="1"/>
<rect x="35" y="118" width="12" height="8" fill="#FFB300" stroke="#111" stroke-width="1"/>
<rect x="73" y="118" width="12" height="8" fill="#FFB300" stroke="#111" stroke-width="1"/>
</svg>`;

const PRESETS = [
  // Place Value
  {
    btn: "PV: full scaffold",
    mode: "place_value" as const,
    content: "",
    canvasLabel: "",
    placeValueData: { operandA: 743, operandB: 124, operation: "addition" as const, layout: "column" as const, scaffoldLevel: "full" as const },
  },
  {
    btn: "PV: hundreds",
    mode: "place_value" as const,
    content: "",
    canvasLabel: "",
    placeValueData: { operandA: 743, operandB: 124, operation: "addition" as const, layout: "column" as const, activeColumn: "hundreds" as const, scaffoldLevel: "full" as const },
  },
  {
    btn: "PV: tens",
    mode: "place_value" as const,
    content: "",
    canvasLabel: "",
    placeValueData: { operandA: 743, operandB: 124, operation: "addition" as const, layout: "column" as const, activeColumn: "tens" as const, scaffoldLevel: "full" as const, revealedColumns: ["hundreds" as const] },
  },
  {
    btn: "PV: ones",
    mode: "place_value" as const,
    content: "",
    canvasLabel: "",
    placeValueData: { operandA: 743, operandB: 124, operation: "addition" as const, layout: "column" as const, activeColumn: "ones" as const, scaffoldLevel: "full" as const, revealedColumns: ["hundreds" as const, "tens" as const] },
  },
  {
    btn: "PV: hint",
    mode: "place_value" as const,
    content: "",
    canvasLabel: "",
    placeValueData: { operandA: 743, operandB: 124, operation: "addition" as const, layout: "column" as const, activeColumn: "ones" as const, scaffoldLevel: "hint" as const },
  },
  {
    btn: "PV: minimal (Reina)",
    mode: "place_value" as const,
    content: "",
    canvasLabel: "",
    placeValueData: { operandA: 278, operandB: 465, operation: "addition" as const, layout: "column" as const, scaffoldLevel: "minimal" as const },
  },
  // Teaching
  {
    btn: "8 + 5",
    mode: "teaching" as const,
    content: "8 + 5",
    canvasLabel: "",
  },
  {
    btn: "12 − 7",
    mode: "teaching" as const,
    content: "12 − 7",
    canvasLabel: "Subtraction",
  },
  {
    btn: "cat",
    mode: "teaching" as const,
    content: "cat",
    canvasLabel: "Sound it out!",
  },
  {
    btn: "h-i-t",
    mode: "teaching" as const,
    content: "hit",
    canvasLabel: "Sound it out!",
    phonemeBoxes: [
      { position: "first", value: "h", highlighted: true },
      { position: "middle", value: "i", highlighted: false },
      { position: "last", value: "t", highlighted: false },
    ],
  },
  // Riddles
  {
    btn: "🕯️ Candle",
    mode: "riddle" as const,
    content: "I get shorter the more I work. What am I?",
    canvasLabel: "Riddle",
  },
  {
    btn: "🐔 Egg",
    mode: "riddle" as const,
    content: "I have to be broken before you use me. What am I?",
    canvasLabel: "Riddle",
  },
  // Rewards
  {
    btn: "3 in a row",
    mode: "reward" as const,
    content: "",
    canvasLabel: "3 in a row!",
    svg: HITODAMA_SVG,
  },
  {
    btn: "5 in a row",
    mode: "reward" as const,
    content: "",
    canvasLabel: "5 in a row! 🌟",
    svg: KODAMA_SVG,
  },
  {
    btn: "Correct!",
    mode: "reward" as const,
    content: "",
    canvasLabel: "Correct!",
    svg: TENGU_SVG,
  },
  {
    btn: "⭐ Star",
    mode: "reward" as const,
    content: "",
    canvasLabel: "Amazing!",
    lottieData: celebrationData as Record<string, unknown>,
  },
  // Championship
  {
    btn: "CHAMPION",
    mode: "championship" as const,
    content: "",
    canvasLabel: "CHAMPION!",
    svg: ONI_SVG,
  },
  {
    btn: "EPIC WIN",
    mode: "championship" as const,
    content: "",
    canvasLabel: "EPIC WIN! 🏆",
    svg: KITSUNE_SVG,
  },
  {
    btn: "🐉 Dragon",
    mode: "championship" as const,
    content: "",
    canvasLabel: "You did it! 🐉",
    svg: KITSUNE_SVG,
  },
  {
    btn: "👑 Princess",
    mode: "reward" as const,
    content: "",
    canvasLabel: "Princess!",
    svg: PRINCESS_SVG,
  },
];

export function CanvasTestOverlay({ sendMessage }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredPreset, setHoveredPreset] = useState<
    (typeof PRESETS)[0] | null
  >(null);
  const [mode, setMode] = useState<
    "teaching" | "riddle" | "reward" | "championship" | "place_value"
  >("teaching");
  const [content, setContent] = useState("");
  const [label, setLabel] = useState("");
  const [fired, setFired] = useState(false);

  const isDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (!isDev) return null;

  const fire = () => {
    sendMessage("tool_call", {
      tool: "showCanvas",
      args: { mode, content, label },
    });
    setFired(true);
    setTimeout(() => setFired(false), 800);
  };

  const firePreset = (p: (typeof PRESETS)[0]) => {
    const args: Record<string, unknown> = {
      mode: p.mode,
      content: p.content ?? "",
      label: p.canvasLabel ?? "",
    };
    if ("svg" in p && p.svg) args.svg = p.svg;
    if ("lottieData" in p && p.lottieData) args.lottieData = p.lottieData;
    if ("phonemeBoxes" in p && p.phonemeBoxes) args.phonemeBoxes = p.phonemeBoxes;
    if ("placeValueData" in p && p.placeValueData) args.placeValueData = p.placeValueData;
    sendMessage("tool_call", {
      tool: "showCanvas",
      args,
    });
    setMode(p.mode);
    setContent(p.content ?? "");
    setLabel(p.canvasLabel ?? "");
    setFired(true);
    setTimeout(() => setFired(false), 800);
  };

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed bottom-4 right-4 z-50 px-3 py-1.5 bg-gray-800 text-white text-xs rounded-lg shadow-lg hover:bg-gray-700"
      >
        Canvas Test
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700">Canvas Test</span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-gray-400 hover:text-gray-600 text-xs"
        >
          −
        </button>
      </div>
      <div className="space-y-2">
        <div className="flex gap-1 flex-wrap">
          {(["teaching", "riddle", "reward", "championship", "place_value"] as const).map(
            (m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-2 py-1 text-xs rounded ${
                  mode === m ? "bg-blue-500 text-white" : "bg-gray-100"
                }`}
              >
                {m}
              </button>
            ),
          )}
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
          onClick={fire}
          className="w-full py-1.5 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
        >
          {fired ? "✓" : "Fire"}
        </button>
        <div className="w-full h-32 bg-gray-50 rounded border border-gray-100 flex items-center justify-center overflow-hidden">
          {hoveredPreset && "lottieData" in hoveredPreset && hoveredPreset.lottieData ? (
            <Lottie
              animationData={hoveredPreset.lottieData}
              loop={true}
              autoplay={true}
              style={{ width: 120, height: 120 }}
            />
          ) : hoveredPreset && "svg" in hoveredPreset && hoveredPreset.svg ? (
            <div
              style={{
                transform: "scale(0.65)",
                transformOrigin: "center center",
              }}
              dangerouslySetInnerHTML={{ __html: hoveredPreset.svg }}
            />
          ) : (
            <span className="text-xs text-gray-300">hover a character</span>
          )}
        </div>
        <div className="flex gap-1 flex-wrap pt-1 border-t border-gray-100">
          {PRESETS.map((p) => (
            <button
              key={p.btn}
              onClick={() => firePreset(p)}
              onMouseEnter={() => setHoveredPreset(p)}
              onMouseLeave={() => setHoveredPreset(null)}
              className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
            >
              {p.btn}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
