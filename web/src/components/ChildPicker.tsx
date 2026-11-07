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

/** The start screen's sky follows the kiosk's local time (owner, 2026-11-07): soft and muted, never bright. */
export type StartSky = {
  name: "morning" | "day" | "evening" | "night";
  gradient: string;
  glow: string | null;
  lights: "motes" | "stars";
  text: string;
  subtext: string;
};

export function skyForHour(hour: number): StartSky {
  if (hour >= 6 && hour < 11) return { name: "morning", lights: "motes", text: "#4a3a33", subtext: "#7a645a",
    gradient: "linear-gradient(180deg, #e9dccf 0%, #e4dde6 55%, #d9e1ea 100%)", glow: "rgba(240,200,160,0.35)" };
  if (hour >= 11 && hour < 16) return { name: "day", lights: "motes", text: "#33404d", subtext: "#5f6e7c",
    gradient: "linear-gradient(180deg, #d5e1ea 0%, #e2e7eb 60%, #e8e4de 100%)", glow: null };
  if (hour >= 16 && hour < 19) return { name: "evening", lights: "motes", text: "#3b2f45", subtext: "#65566f",
    gradient: "linear-gradient(180deg, #c9b8c9 0%, #d8bfae 55%, #c9a68f 100%)", glow: "rgba(214,150,110,0.3)" };
  return { name: "night", lights: "stars", text: "#efe9f7", subtext: "#b9b1cc",
    gradient: "linear-gradient(180deg, #1c2038 0%, #262a48 55%, #34304f 100%)", glow: null };
}

const SKY_LIGHTS = [
  { left: "8%", top: "14%", size: 4, delay: 0, duration: 9 },
  { left: "18%", top: "32%", size: 3, delay: 2.5, duration: 11 },
  { left: "31%", top: "9%", size: 5, delay: 1, duration: 13 },
  { left: "47%", top: "22%", size: 3, delay: 4, duration: 10 },
  { left: "62%", top: "12%", size: 4, delay: 0.5, duration: 12 },
  { left: "74%", top: "36%", size: 3, delay: 3, duration: 9.5 },
  { left: "86%", top: "18%", size: 5, delay: 1.8, duration: 14 },
  { left: "94%", top: "40%", size: 3, delay: 5, duration: 10.5 },
];

function StartScreenSky({ sky }: { sky: StartSky }) {
  return (
    <div
      data-testid="start-screen-sky"
      data-sky={sky.name}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ background: sky.gradient, transition: "background 2s ease" }}
    >
      {sky.glow && (
        <div
          className="absolute rounded-full"
          style={{ width: 560, height: 560, left: "50%", bottom: -340, transform: "translateX(-50%)",
            background: `radial-gradient(circle, ${sky.glow} 0%, rgba(0,0,0,0) 70%)` }}
        />
      )}
      {SKY_LIGHTS.map((light) => sky.lights === "stars" ? (
        <motion.span
          key={light.left}
          className="absolute rounded-full motion-reduce:hidden"
          style={{ left: light.left, top: light.top, width: light.size, height: light.size, background: "rgba(255,248,230,0.9)" }}
          animate={{ opacity: [0.25, 0.9, 0.25] }}
          transition={{ duration: light.duration / 3, delay: light.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : (
        <motion.span
          key={light.left}
          className="absolute rounded-full motion-reduce:hidden"
          style={{ left: light.left, bottom: -20, width: light.size * 2, height: light.size * 2, background: "rgba(255,255,255,0.55)" }}
          animate={{ y: [0, -900], opacity: [0, 0.6, 0.6, 0] }}
          transition={{ duration: light.duration * 1.5, delay: light.delay, repeat: Infinity, ease: "linear" }}
        />
      ))}
    </div>
  );
}

/** The local hour, rechecked every ten minutes so a long-open kiosk drifts from day into night. */
function useLocalHour(): number {
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const timer = window.setInterval(() => setHour(new Date().getHours()), 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);
  return hour;
}

export function ChildPicker({ onSelect }: Props) {
  const showDevTools = devToolsVisible();
  const sky = skyForHour(useLocalHour());
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
      <StartScreenSky sky={sky} />
      <div className="text-center relative">
        <h1 className="text-3xl font-medium" style={{ color: sky.text }}>
          Who's learning today?
        </h1>
        <p className="text-sm mt-1" style={{ color: sky.subtext }}>Tap your name to start</p>
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

      <div className="absolute bottom-3 text-xs" style={{ color: sky.subtext }}>
        Project Sunny
      </div>
    </div>
  );
}
