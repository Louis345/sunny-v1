import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

export interface SessionLoadingOverlayProps {
  childName: string;
  avatarImagePath?: string | null;
  accentColor?: string;
  accentBg?: string;
  voiceReady: boolean;
  mapReady: boolean;
  assetsReady: boolean;
  paletteSeed?: string | null;
  paletteCycleMs?: number;
  safetyReleaseMs?: number;
  hardReleaseMs?: number;
  onSafetyRelease?: () => void;
  onHardRelease?: () => void;
}

const STAGE_PALETTES = [
  {
    name: "rose-gold",
    curtainA: "#7f1d1d",
    curtainB: "#be123c",
    accentA: "#facc15",
    accentB: "#38bdf8",
    wash: "rgba(244, 63, 94, 0.24)",
  },
  {
    name: "ocean-pop",
    curtainA: "#0f766e",
    curtainB: "#0284c7",
    accentA: "#67e8f9",
    accentB: "#fef08a",
    wash: "rgba(14, 165, 233, 0.24)",
  },
  {
    name: "orchid-spark",
    curtainA: "#6d28d9",
    curtainB: "#db2777",
    accentA: "#f0abfc",
    accentB: "#fde047",
    wash: "rgba(168, 85, 247, 0.24)",
  },
  {
    name: "jungle-lime",
    curtainA: "#166534",
    curtainB: "#65a30d",
    accentA: "#bef264",
    accentB: "#22d3ee",
    wash: "rgba(34, 197, 94, 0.22)",
  },
] as const;

function seedToIndex(seed: string | null | undefined): number {
  const s = seed?.trim() ?? "";
  if (!s) return 0;
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    n = (n + s.charCodeAt(i) * (i + 1)) % STAGE_PALETTES.length;
  }
  return n;
}

function pct(ready: boolean[]): number {
  if (ready.length === 0) return 100;
  const complete = ready.filter(Boolean).length;
  return Math.round((complete / ready.length) * 100);
}

function firstInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function SessionLoadingOverlay({
  childName,
  avatarImagePath,
  accentColor = "#f59e0b",
  accentBg = "#fff7ed",
  voiceReady,
  mapReady,
  assetsReady,
  paletteSeed,
  paletteCycleMs = 2800,
  safetyReleaseMs = 14000,
  hardReleaseMs = 30_000,
  onSafetyRelease,
  onHardRelease,
}: SessionLoadingOverlayProps) {
  const [paletteStep, setPaletteStep] = useState(0);
  const [safetyReleased, setSafetyReleased] = useState(false);
  const baseProgress = pct([voiceReady, mapReady, assetsReady]);
  const ready = baseProgress === 100 || safetyReleased;
  const progress = ready ? 100 : baseProgress;
  const lastProgressRef = useRef<number | null>(null);
  const safetyReleaseRef = useRef(onSafetyRelease);
  const hardReleaseRef = useRef(onHardRelease);
  const displayName = childName.trim() || "Sunny";
  const palette =
    STAGE_PALETTES[
      (seedToIndex(paletteSeed ?? displayName) + paletteStep) %
        STAGE_PALETTES.length
    ]!;

  const statusItems = useMemo(
    () => [
      {
        label: voiceReady ? "Voice is warmed up" : "Warming up voice",
        ready: voiceReady,
      },
      {
        label: mapReady ? "Map is ready" : "Painting the adventure map",
        ready: mapReady,
      },
      {
        label: assetsReady ? "Magic images are ready" : "Magic images are setting",
        ready: assetsReady,
      },
    ],
    [assetsReady, mapReady, voiceReady],
  );

  useEffect(() => {
    safetyReleaseRef.current = onSafetyRelease;
  }, [onSafetyRelease]);

  useEffect(() => {
    hardReleaseRef.current = onHardRelease;
  }, [onHardRelease]);

  useEffect(() => {
    if (ready) return;
    const id = window.setInterval(() => {
      setPaletteStep((step) => (step + 1) % STAGE_PALETTES.length);
    }, Math.max(600, paletteCycleMs));
    return () => window.clearInterval(id);
  }, [paletteCycleMs, ready]);

  useEffect(() => {
    setSafetyReleased(false);
  }, [displayName]);

  useEffect(() => {
    if (baseProgress === 100 || safetyReleased) return;
    const id = window.setTimeout(() => {
      setSafetyReleased(true);
      console.warn(" 🎮 [loading-screen] safety release", {
        childName: displayName,
        voiceReady,
        mapReady,
        assetsReady,
      });
      safetyReleaseRef.current?.();
    }, Math.max(3000, safetyReleaseMs));
    return () => window.clearTimeout(id);
  }, [
    assetsReady,
    baseProgress,
    displayName,
    mapReady,
    safetyReleaseMs,
    safetyReleased,
    voiceReady,
  ]);

  useEffect(() => {
    if (baseProgress === 100) return;
    const id = window.setTimeout(() => {
      console.warn(" 🎮 [loading-screen] hard release", {
        childName: displayName,
        voiceReady,
        mapReady,
        assetsReady,
      });
      hardReleaseRef.current?.();
    }, Math.max(3000, hardReleaseMs));
    return () => window.clearTimeout(id);
  }, [
    assetsReady,
    baseProgress,
    displayName,
    hardReleaseMs,
    mapReady,
    voiceReady,
  ]);

  useEffect(() => {
    if (lastProgressRef.current === progress) return;
    lastProgressRef.current = progress;
    console.log(` 🎮 [loading-screen] readiness ${progress}%`, {
      childName: displayName,
      voiceReady,
      mapReady,
      assetsReady,
    });
  }, [assetsReady, displayName, mapReady, progress, voiceReady]);

  return (
    <div
      data-testid="session-loading-overlay"
      data-ready={ready ? "true" : "false"}
      data-safety-released={safetyReleased ? "true" : "false"}
      data-palette-name={palette.name}
      className="fixed inset-0 z-[9000] overflow-hidden"
      style={
        {
          "--loading-accent": accentColor,
          "--loading-bg": accentBg,
          "--stage-curtain-a": palette.curtainA,
          "--stage-curtain-b": palette.curtainB,
          "--stage-accent-a": palette.accentA,
          "--stage-accent-b": palette.accentB,
          "--stage-wash": palette.wash,
        } as CSSProperties
      }
    >
      <div className="sunny-stage-backdrop" />
      <div className="sunny-stage-lights" aria-hidden />
      <div
        className={`sunny-curtain sunny-curtain-left ${ready ? "sunny-curtain-open-left" : ""}`}
        aria-hidden
      />
      <div
        className={`sunny-curtain sunny-curtain-right ${ready ? "sunny-curtain-open-right" : ""}`}
        aria-hidden
      />
      <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/55 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/50 to-transparent" />

      <div className="relative z-10 flex h-full w-full items-center justify-center px-6">
        <div className="sunny-stage-card">
          <div className="sunny-marquee" aria-hidden>
            {Array.from({ length: 18 }).map((_, i) => (
              <span key={i} />
            ))}
          </div>

          <div className="sunny-avatar-wrap">
            <div className="sunny-avatar-halo" aria-hidden />
            <div className="sunny-avatar">
              {avatarImagePath ? (
                <img src={avatarImagePath} alt={`${displayName} avatar`} />
              ) : (
                <span>{firstInitial(displayName)}</span>
              )}
            </div>
          </div>

          <div className="text-center">
            <p className="text-xs font-black uppercase tracking-[0.26em] text-white/70">
              {safetyReleased
                ? "Opening the curtain..."
                : ready
                  ? "Curtain up!"
                  : "The adventure is almost ready"}
            </p>
            <h1 className="mt-2 text-3xl font-black text-white sm:text-5xl">
              {displayName}
            </h1>
          </div>

          <div className="w-full max-w-sm">
            <div className="mb-2 flex items-center justify-between text-sm font-bold text-white">
              <span>Getting everything set</span>
              <span>{progress}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-white/20 shadow-inner">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${progress}%`,
                  background:
                    "linear-gradient(90deg, var(--stage-accent-a), var(--loading-accent), var(--stage-accent-b))",
                  boxShadow: "0 0 18px color-mix(in srgb, var(--loading-accent), white 30%)",
                }}
              />
            </div>
          </div>

          <div className="grid w-full max-w-lg gap-2 sm:grid-cols-3">
            {statusItems.map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-white/18 bg-white/10 px-3 py-2 text-center text-xs font-bold text-white shadow-sm backdrop-blur"
              >
                <span
                  className="mx-auto mb-1 block h-2.5 w-2.5 rounded-full"
                  style={{
                    background: item.ready ? "var(--loading-accent)" : "rgba(255,255,255,0.4)",
                    boxShadow: item.ready
                      ? "0 0 14px var(--loading-accent)"
                      : "none",
                  }}
                />
                {item.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .sunny-stage-backdrop {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 50% 42%, rgba(255,255,255,0.28), transparent 28%),
            radial-gradient(circle at 24% 18%, var(--stage-wash), transparent 30%),
            radial-gradient(circle at 78% 82%, color-mix(in srgb, var(--stage-accent-b), transparent 68%), transparent 32%),
            linear-gradient(135deg, rgba(15,23,42,0.9), rgba(2,6,23,0.98));
          transition: background 800ms ease;
        }
        .sunny-stage-lights {
          position: absolute;
          inset: 0;
          background:
            conic-gradient(from 210deg at 22% 0%, transparent 0 24deg, color-mix(in srgb, var(--stage-accent-a), transparent 66%) 28deg 38deg, transparent 42deg),
            conic-gradient(from 132deg at 78% 0%, transparent 0 24deg, color-mix(in srgb, var(--stage-accent-b), transparent 68%) 28deg 38deg, transparent 42deg);
          animation: sunny-lights 4.5s ease-in-out infinite alternate;
        }
        .sunny-curtain {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 53%;
          z-index: 2;
          background:
            repeating-linear-gradient(90deg, rgba(0,0,0,0.22) 0 10px, transparent 10px 22px),
            linear-gradient(135deg, var(--stage-curtain-a), var(--stage-curtain-b) 48%, var(--stage-curtain-a));
          box-shadow: inset 0 0 46px rgba(0,0,0,0.42);
          transition:
            transform 950ms cubic-bezier(.2,.8,.2,1),
            background 800ms ease;
        }
        .sunny-curtain-left {
          left: 0;
          transform-origin: left center;
        }
        .sunny-curtain-right {
          right: 0;
          transform-origin: right center;
        }
        .sunny-curtain-open-left {
          transform: translateX(-86%) skewY(-1deg);
        }
        .sunny-curtain-open-right {
          transform: translateX(86%) skewY(1deg);
        }
        .sunny-stage-card {
          position: relative;
          display: flex;
          min-height: min(74vh, 640px);
          width: min(92vw, 720px);
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 24px;
          border: 1px solid rgba(255,255,255,0.22);
          border-radius: 22px;
          background: linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.06));
          box-shadow: 0 24px 90px rgba(0,0,0,0.36);
          padding: 34px 22px;
          backdrop-filter: blur(16px);
        }
        .sunny-marquee {
          position: absolute;
          left: 22px;
          right: 22px;
          top: 18px;
          display: flex;
          justify-content: space-between;
        }
        .sunny-marquee span {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: var(--stage-accent-a);
          box-shadow: 0 0 16px var(--stage-accent-a);
          animation: sunny-marquee 1.4s ease-in-out infinite;
        }
        .sunny-marquee span:nth-child(even) {
          animation-delay: .35s;
        }
        .sunny-avatar-wrap {
          position: relative;
          width: clamp(136px, 24vw, 210px);
          height: clamp(136px, 24vw, 210px);
        }
        .sunny-avatar-halo {
          position: absolute;
          inset: -14px;
          border-radius: 999px;
          background: conic-gradient(from 0deg, var(--stage-accent-a), var(--loading-accent), var(--stage-accent-b), var(--stage-accent-a));
          filter: blur(4px);
          animation: sunny-spin 6s linear infinite;
        }
        .sunny-avatar {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          overflow: hidden;
          border: 6px solid rgba(255,255,255,0.86);
          border-radius: 999px;
          background: var(--loading-bg);
          box-shadow: 0 18px 40px rgba(0,0,0,0.28);
          animation: sunny-float 2.8s ease-in-out infinite;
        }
        .sunny-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .sunny-avatar span {
          color: var(--loading-accent);
          font-size: clamp(4rem, 12vw, 7rem);
          font-weight: 900;
        }
        @keyframes sunny-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes sunny-float {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-8px) scale(1.025); }
        }
        @keyframes sunny-marquee {
          0%, 100% { opacity: .45; transform: scale(.8); }
          50% { opacity: 1; transform: scale(1.12); }
        }
        @keyframes sunny-lights {
          from { opacity: .74; filter: hue-rotate(0deg); }
          to { opacity: 1; filter: hue-rotate(18deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .sunny-stage-lights,
          .sunny-marquee span,
          .sunny-avatar-halo,
          .sunny-avatar {
            animation: none;
          }
          .sunny-curtain {
            transition-duration: 1ms;
          }
        }
      `}</style>
    </div>
  );
}
