import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  normalizeCompanionConfig,
  type CompanionThemeConfig,
  type CompanionThemeResponse,
} from "../../../src/shared/companionTheme";

interface Props {
  /** `diagKiosk` uses child=creator + Charlotte on the server (diagnostic prompt). */
  onSelect: (childName: string, options?: { diagKiosk?: boolean }) => void;
}

function requestCompanionRows(): Promise<CompanionThemeResponse[]> {
  return fetch("/api/companions").then((r) => {
    if (!r.ok) throw new Error("Could not load companions");
    return r.json() as Promise<CompanionThemeResponse[]>;
  });
}

/** Grown-up tools (the creator profile, diagnostic mode) appear only on the dev address, never for the kids. */
function devToolsVisible(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("dev") === "1";
}

/** Soft glowing motes drifting up a sunrise sky (owner, 2026-11-07): warm and inviting, decoration only. */
const SKY_MOTES = [
  { left: "8%", size: 14, delay: 0, duration: 9 },
  { left: "18%", size: 8, delay: 2.5, duration: 11 },
  { left: "31%", size: 18, delay: 1, duration: 13 },
  { left: "47%", size: 10, delay: 4, duration: 10 },
  { left: "62%", size: 16, delay: 0.5, duration: 12 },
  { left: "74%", size: 9, delay: 3, duration: 9.5 },
  { left: "86%", size: 20, delay: 1.8, duration: 14 },
  { left: "94%", size: 11, delay: 5, duration: 10.5 },
];

function StartScreenSky() {
  return (
    <div
      data-testid="start-screen-sky"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ background: "linear-gradient(180deg, #ffe9c7 0%, #ffd9b0 32%, #fbe3d2 62%, #f3ecff 100%)" }}
    >
      <div
        className="absolute rounded-full"
        style={{ width: 520, height: 520, left: "50%", bottom: -300, transform: "translateX(-50%)",
          background: "radial-gradient(circle, rgba(255,201,120,0.75) 0%, rgba(255,201,120,0) 70%)" }}
      />
      {SKY_MOTES.map((mote) => (
        <motion.span
          key={mote.left}
          className="absolute rounded-full motion-reduce:hidden"
          style={{ left: mote.left, bottom: -30, width: mote.size, height: mote.size,
            background: "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,226,170,0.6) 55%, rgba(255,226,170,0) 100%)" }}
          animate={{ y: [0, -900], opacity: [0, 0.9, 0.9, 0] }}
          transition={{ duration: mote.duration, delay: mote.delay, repeat: Infinity, ease: "linear" }}
        />
      ))}
    </div>
  );
}

export function ChildPicker({ onSelect }: Props) {
  const showDevTools = devToolsVisible();
  const [companions, setCompanions] = useState<CompanionThemeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    requestCompanionRows()
      .then((rows) => {
        if (!cancelled) setCompanions(rows.map(normalizeCompanionConfig));
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? "Something went wrong");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refetchCompanions = useCallback(() => {
    setLoading(true);
    setError(null);
    requestCompanionRows()
      .then((rows) => setCompanions(rows.map(normalizeCompanionConfig)))
      .catch((err) => setError(err?.message ?? "Something went wrong"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-white">
        <div className="animate-pulse text-4xl">🌟</div>
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-white">
        <p className="text-red-600 text-center">{error}</p>
        <button
          onClick={refetchCompanions}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          Try again
        </button>
      </div>
    );
  }

  if (companions.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-white">
        <p className="text-gray-600 text-center">No companions available.</p>
        <button
          onClick={refetchCompanions}
          className="px-4 py-2 text-blue-600 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-8 relative overflow-hidden">
      <StartScreenSky />
      <div className="text-center relative">
        <h1 className="text-3xl font-medium" style={{ color: "#5b3a1e" }}>
          Who's learning today?
        </h1>
        <p className="text-sm mt-1" style={{ color: "#8a5a32" }}>Tap your name to start</p>
      </div>

      <div className="relative flex flex-wrap justify-center items-start gap-8 max-w-5xl px-4">
        {companions.filter((c) => showDevTools || c.childName.trim().toLowerCase() !== "creator").map((c) => {
          const childId = c.childName.trim().toLowerCase();
          return (
            <motion.button
              key={c.childName}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onSelect(c.childName)}
              aria-label={`${c.childName} with ${c.companionName}`}
              data-child-id={childId}
              data-profile-child-id={childId}
              className="w-60 h-64 rounded-xl border-2 border-gray-200 bg-gray-50 
                         flex flex-col items-center justify-center gap-3
                         hover:border-blue-400 transition-colors"
              style={{
                background: c.accentBg,
                color: c.accentColor,
              }}
            >
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold select-none overflow-hidden shrink-0"
                style={{
                  border: `3px solid ${c.accentColor}`,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                  background: "rgba(255,255,255,0.35)",
                }}
                aria-hidden
              >
                {c.avatarImagePath ? (
                  <img
                    src={c.avatarImagePath}
                    alt=""
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: "50%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  c.childName.trim().charAt(0).toUpperCase() || "?"
                )}
              </div>

              <div className="text-center">
                <div className="text-2xl font-medium" style={{ color: c.accentColor }}>
                  {c.childName}
                </div>
                <div className="text-sm mt-0.5" style={{ color: c.accentColor }}>
                  with {c.companionName}
                </div>
              </div>
            </motion.button>
          );
        })}

        {showDevTools && <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelect("creator", { diagKiosk: true })}
          aria-label="Creator diagnostic mode"
          data-child-id="creator"
          data-profile-child-id="creator"
          className="relative w-52 h-56 rounded-xl border-2 border-amber-400/90
                     bg-gradient-to-b from-[#1a1528] via-[#231d35] to-[#2e2645]
                     flex flex-col items-center justify-center gap-2 px-3
                     shadow-[0_0_0_1px_rgba(251,191,36,0.25),0_8px_24px_rgba(0,0,0,0.35)]
                     hover:border-amber-300 transition-colors"
        >
          <span
            className="absolute top-2 right-2 rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200 border border-amber-400/50"
            aria-hidden
          >
            ⚡ Dev
          </span>
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-amber-50 select-none opacity-95"
            style={{
              border: "3px solid rgba(251, 191, 36, 0.85)",
              boxShadow: "0 0 16px rgba(251, 191, 36, 0.25)",
              background: "rgba(0,0,0,0.2)",
            }}
            aria-hidden
          >
            ⚡
          </div>
          <div className="text-center mt-1">
            <div
              className="text-xl font-semibold text-amber-50"
              style={{ fontFamily: "'Lexend', sans-serif" }}
            >
              Creator
            </div>
            <div
              className="text-sm text-amber-200/85 mt-0.5"
              style={{ fontFamily: "'Lexend', sans-serif" }}
            >
              Diagnostic mode
            </div>
          </div>
        </motion.button>}
      </div>

      <div className="absolute bottom-3 text-xs" style={{ color: "#a77b55" }}>
        Project Sunny
      </div>
    </div>
  );
}
