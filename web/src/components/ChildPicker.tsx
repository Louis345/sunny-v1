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

/** The start screen's sky follows the real sun where the kiosk is (owner, 2026-11-07): soft, muted moods. */
export type StartSky = {
  name: "sunrise" | "day" | "golden" | "twilight" | "night";
  gradient: string;
  glow: string | null;
  lights: "motes" | "stars";
  text: string;
  subtext: string;
};

const SKIES: Record<StartSky["name"], StartSky> = {
  sunrise: { name: "sunrise", lights: "motes", text: "#4a3340", subtext: "#7a5a66",
    gradient: "linear-gradient(180deg, #b9b3d6 0%, #e3b9c0 48%, #f1cfae 100%)", glow: "rgba(255,190,140,0.45)" },
  day: { name: "day", lights: "motes", text: "#33404d", subtext: "#5f6e7c",
    gradient: "linear-gradient(180deg, #cddbe7 0%, #dfe5ea 60%, #e8e4de 100%)", glow: null },
  golden: { name: "golden", lights: "motes", text: "#45322a", subtext: "#735a4c",
    gradient: "linear-gradient(180deg, #c7c0cf 0%, #e0c2a8 55%, #d9a882 100%)", glow: "rgba(230,160,100,0.35)" },
  twilight: { name: "twilight", lights: "stars", text: "#f1eaf6", subtext: "#c7bdd6",
    gradient: "linear-gradient(180deg, #2a2d55 0%, #4a3f6e 60%, #8a5e78 100%)", glow: "rgba(220,130,120,0.25)" },
  night: { name: "night", lights: "stars", text: "#efe9f7", subtext: "#b9b1cc",
    gradient: "linear-gradient(180deg, #161a30 0%, #1f2340 55%, #2b2846 100%)", glow: null },
};

/** No location is stored (public repo): longitude comes from the timezone, latitude is a mid-latitude guess. */
const SKY_LATITUDE_DEGREES = 41;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** Sunrise and sunset in local clock minutes, within about fifteen minutes; plenty for a mood. */
export function sunTimes(input: { at: Date; utcOffsetMinutes: number; standardOffsetMinutes: number }): { sunrise: number; sunset: number } {
  const start = Date.UTC(input.at.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((input.at.getTime() - start) / 86_400_000);
  const b = rad((360 / 365) * (dayOfYear - 81));
  const equationOfTime = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const declination = rad(23.44 * Math.sin(rad((360 / 365) * (284 + dayOfYear))));
  const latitude = rad(SKY_LATITUDE_DEGREES);
  const cosHourAngle = (Math.sin(rad(-0.833)) - Math.sin(latitude) * Math.sin(declination)) / (Math.cos(latitude) * Math.cos(declination));
  const halfDayMinutes = (Math.acos(Math.min(1, Math.max(-1, cosHourAngle))) * 180 / Math.PI) * 4;
  const solarNoon = 720 - equationOfTime + (input.utcOffsetMinutes - input.standardOffsetMinutes);
  return { sunrise: solarNoon - halfDayMinutes, sunset: solarNoon + halfDayMinutes };
}

export function skyForTime(input: { at: Date; utcOffsetMinutes: number; standardOffsetMinutes: number }): StartSky {
  const local = new Date(input.at.getTime() + input.utcOffsetMinutes * 60_000);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const { sunrise, sunset } = sunTimes(input);
  if (minutes >= sunrise - 30 && minutes < sunrise + 60) return SKIES.sunrise;
  if (minutes >= sunset - 60 && minutes < sunset) return SKIES.golden;
  if (minutes >= sunset && minutes < sunset + 40) return SKIES.twilight;
  if (minutes >= sunrise + 60 && minutes < sunset - 60) return SKIES.day;
  return SKIES.night;
}

/** The kiosk's own clock and timezone, rechecked every ten minutes so a long-open screen follows the sun. */
function useKioskSky(): StartSky {
  const read = () => {
    const at = new Date();
    const year = at.getFullYear();
    const standardOffsetMinutes = -Math.max(new Date(year, 0, 1).getTimezoneOffset(), new Date(year, 6, 1).getTimezoneOffset());
    return skyForTime({ at, utcOffsetMinutes: -at.getTimezoneOffset(), standardOffsetMinutes });
  };
  const [sky, setSky] = useState(read);
  useEffect(() => {
    const timer = window.setInterval(() => setSky(read()), 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);
  return sky;
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

/** A fixed scatter of stars (same every load): mostly tiny and dim, a few bright, denser toward the top. */
const STARS = Array.from({ length: 150 }, (_, index) => {
  const random = (salt: number) => { const x = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453; return x - Math.floor(x); };
  const bright = random(4) > 0.85;
  return {
    left: `${(random(1) * 100).toFixed(2)}%`,
    top: `${(Math.pow(random(2), 1.6) * 92).toFixed(2)}%`,
    size: bright ? 3.5 + random(3) * 2 : 1.6 + random(3) * 1.6,
    low: 0.35 + random(5) * 0.25,
    high: bright ? 1 : 0.7 + random(6) * 0.3,
    duration: 2.5 + random(7) * 4,
    delay: random(8) * 5,
  };
});

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
      {sky.lights === "stars" ? (
        <>
          {[0, 1].map((layer) => (
            <motion.div
              key={layer}
              data-star-layer
              className="absolute motion-reduce:!transform-none"
              style={{ inset: "-10% -15%" }}
              animate={{ x: layer === 0 ? [0, -40, 0] : [0, -90, 0], y: layer === 0 ? [0, 8, 0] : [0, 18, 0] }}
              transition={{ duration: layer === 0 ? 140 : 90, repeat: Infinity, ease: "easeInOut" }}
            >
              {STARS.filter((_, index) => index % 2 === layer).map((star, index) => (
                <motion.span
                  key={index}
                  data-star
                  className="absolute rounded-full"
                  style={{ left: star.left, top: star.top, width: star.size * (layer === 0 ? 0.85 : 1.1), height: star.size * (layer === 0 ? 0.85 : 1.1),
                    background: "rgba(255,248,230,1)", opacity: star.high, boxShadow: star.size > 3 ? "0 0 6px rgba(255,240,210,0.7)" : undefined }}
                  animate={{ opacity: [star.low, star.high, star.low] }}
                  transition={{ duration: star.duration, delay: star.delay, repeat: Infinity, ease: "easeInOut" }}
                />
              ))}
            </motion.div>
          ))}
          <motion.span
            data-shooting-star
            className="absolute motion-reduce:hidden"
            style={{ top: "8%", left: "70%", width: 140, height: 2, borderRadius: 2, rotate: -28, transformOrigin: "right center",
              background: "linear-gradient(90deg, rgba(255,250,235,0) 0%, rgba(255,250,235,0.95) 100%)" }}
            initial={{ x: 0, y: 0, opacity: 0 }}
            animate={{ x: [0, -520], y: [0, 280], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.4, times: [0, 0.15, 0.7, 1], repeat: Infinity, repeatDelay: 9, delay: 3, ease: "easeIn" }}
          />
        </>
      ) : SKY_LIGHTS.map((light) => (
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


export function ChildPicker({ onSelect }: Props) {
  const showDevTools = devToolsVisible();
  const sky = useKioskSky();
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
