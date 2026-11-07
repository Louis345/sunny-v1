import { useEffect, useState, useCallback, useRef } from "react";
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
  /** Three soft color clouds that drift slowly behind everything, so the background itself moves. */
  clouds: [string, string, string];
};

export const START_SKIES: Record<StartSky["name"], StartSky> = {
  sunrise: { name: "sunrise", clouds: ["rgba(255,196,170,0.55)", "rgba(214,180,230,0.5)", "rgba(255,226,180,0.5)"], lights: "motes", text: "#4a3340", subtext: "#7a5a66",
    gradient: "linear-gradient(180deg, #b9b3d6 0%, #e3b9c0 48%, #f1cfae 100%)", glow: "rgba(255,190,140,0.45)" },
  day: { name: "day", clouds: ["rgba(255,255,255,0.6)", "rgba(206,224,240,0.6)", "rgba(240,234,224,0.55)"], lights: "motes", text: "#33404d", subtext: "#5f6e7c",
    gradient: "linear-gradient(180deg, #cddbe7 0%, #dfe5ea 60%, #e8e4de 100%)", glow: null },
  golden: { name: "golden", clouds: ["rgba(255,200,140,0.5)", "rgba(220,170,190,0.45)", "rgba(250,220,170,0.45)"], lights: "motes", text: "#45322a", subtext: "#735a4c",
    gradient: "linear-gradient(180deg, #c7c0cf 0%, #e0c2a8 55%, #d9a882 100%)", glow: "rgba(230,160,100,0.35)" },
  twilight: { name: "twilight", clouds: ["rgba(150,110,200,0.35)", "rgba(220,120,150,0.3)", "rgba(90,110,200,0.35)"], lights: "stars", text: "#f1eaf6", subtext: "#c7bdd6",
    gradient: "linear-gradient(180deg, #2a2d55 0%, #4a3f6e 60%, #8a5e78 100%)", glow: "rgba(220,130,120,0.25)" },
  night: { name: "night", clouds: ["rgba(90,80,170,0.32)", "rgba(60,110,170,0.28)", "rgba(140,80,150,0.25)"], lights: "stars", text: "#efe9f7", subtext: "#b9b1cc",
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
  if (minutes >= sunrise - 30 && minutes < sunrise + 60) return START_SKIES.sunrise;
  if (minutes >= sunset - 60 && minutes < sunset) return START_SKIES.golden;
  if (minutes >= sunset && minutes < sunset + 40) return START_SKIES.twilight;
  if (minutes >= sunrise + 60 && minutes < sunset - 60) return START_SKIES.day;
  return START_SKIES.night;
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

/** One full turn of the night sky every five minutes: visibly moving, still calm (owner, 2026-11-07). */
const STARFIELD_TURN_MS = 300_000;
export function starfieldRotation(elapsedMs: number): number {
  return ((elapsedMs % STARFIELD_TURN_MS) / STARFIELD_TURN_MS) * Math.PI * 2;
}

/** A fixed starfield around a pole above the top-right corner (same every load). Radius and angle are unit values. */
export const STARFIELD = Array.from({ length: 1400 }, (_, index) => {
  const random = (salt: number) => { const x = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453; return x - Math.floor(x); };
  const bright = random(4) > 0.93;
  return {
    radius: Math.sqrt(random(1)),
    angle: random(2) * Math.PI * 2,
    size: bright ? 1.8 + random(3) * 1.2 : 0.6 + random(3) * 0.9,
    low: 0.3 + random(5) * 0.25,
    high: bright ? 1 : 0.65 + random(6) * 0.35,
    twinkleMs: 2500 + random(7) * 4000,
    phase: random(8) * Math.PI * 2,
    bright,
    sparkleOffsetMs: random(9) * 9000,
  };
});
const SPARKLE_PERIOD_MS = 9000;
const SPARKLE_MS = 1100;

function drawStarfield(canvas: HTMLCanvasElement, elapsedMs: number): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const poleX = width * 0.82;
  const poleY = -height * 0.15;
  const reach = Math.hypot(poleX, height - poleY) * 1.05;
  const turn = starfieldRotation(elapsedMs);
  for (const star of STARFIELD) {
    const angle = star.angle + turn;
    const x = poleX + Math.cos(angle) * star.radius * reach;
    const y = poleY + Math.sin(angle) * star.radius * reach;
    if (x < -10 || y < -10 || x > width + 10 || y > height + 10) continue;
    const twinkle = 0.5 + 0.5 * Math.sin((elapsedMs / star.twinkleMs) * Math.PI * 2 + star.phase);
    context.globalAlpha = star.low + (star.high - star.low) * twinkle;
    context.fillStyle = "#fff8e6";
    context.beginPath();
    context.arc(x, y, star.size, 0, Math.PI * 2);
    context.fill();
    if (!star.bright) continue;
    const inSparkle = (elapsedMs + star.sparkleOffsetMs) % SPARKLE_PERIOD_MS;
    if (inSparkle > SPARKLE_MS) continue;
    const glint = Math.sin((inSparkle / SPARKLE_MS) * Math.PI);
    const arm = 11 * glint;
    context.globalAlpha = glint;
    context.strokeStyle = "#fffaeb";
    context.lineWidth = 1.2;
    context.save();
    context.translate(x, y);
    context.rotate((inSparkle / SPARKLE_MS) * (Math.PI / 2));
    context.beginPath();
    context.moveTo(-arm, 0); context.lineTo(arm, 0);
    context.moveTo(0, -arm); context.lineTo(0, arm);
    context.stroke();
    context.restore();
  }
  context.globalAlpha = 1;
}

/** The turning night sky. One canvas, one animation loop that stops when the screen closes; still for reduced motion. */
function TurningStarfield() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      drawStarfield(canvas, now - started);
      frame = window.requestAnimationFrame(tick);
    };
    if (still) drawStarfield(canvas, 0);
    else frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return <canvas ref={canvasRef} data-starfield className="absolute inset-0 h-full w-full" />;
}

/** Daytime clouds float across the screen and loop around; each starts partway so the sky is never empty. */
const CLOUD_CROSSING = [
  { top: "-12%", seconds: 95, startAt: -20 },
  { top: "18%", seconds: 120, startAt: -75 },
  { top: "48%", seconds: 140, startAt: -40 },
];

function StartScreenSky({ sky }: { sky: StartSky }) {
  const starry = sky.lights === "stars";
  return (
    <div
      data-testid="start-screen-sky"
      data-sky={sky.name}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ background: sky.gradient, transition: "background 2s ease" }}
    >
      <style>{`@keyframes sunny-sky-cross { from { transform: translateX(-75vw); } to { transform: translateX(110vw); } }
        @keyframes sunny-sky-swirl { 0% { transform: translate(0,0) scale(1); } 50% { transform: translate(6vw,4vh) scale(1.15); } 100% { transform: translate(0,0) scale(1); } }
        @media (prefers-reduced-motion: reduce) { [data-drift-cloud] { animation: none !important; } }`}</style>
      {sky.clouds.map((color, index) => (
        <div
          key={`${sky.name}-cloud-${index}`}
          data-drift-cloud
          className="absolute rounded-full"
          style={{ width: "70vmax", height: starry ? "50vmax" : "30vmax", left: starry ? ["-20%", "40%", "5%"][index] : 0,
            top: starry ? ["-15%", "10%", "45%"][index] : CLOUD_CROSSING[index].top,
            background: `radial-gradient(ellipse at center, ${color} 0%, rgba(0,0,0,0) 65%)`,
            animation: starry
              ? `sunny-sky-swirl ${[40, 52, 60][index]}s ease-in-out ${-[5, 20, 35][index]}s infinite`
              : `sunny-sky-cross ${CLOUD_CROSSING[index].seconds}s linear ${CLOUD_CROSSING[index].startAt}s infinite` }}
        />
      ))}
      {sky.glow && (
        <div
          className="absolute rounded-full"
          style={{ width: 560, height: 560, left: "50%", bottom: -340, transform: "translateX(-50%)",
            background: `radial-gradient(circle, ${sky.glow} 0%, rgba(0,0,0,0) 70%)` }}
        />
      )}
      {starry && <TurningStarfield />}
      {starry && (
        <motion.span
          data-shooting-star
          className="absolute motion-reduce:hidden"
          style={{ top: "8%", left: "70%", width: 140, height: 2, borderRadius: 2, rotate: -28, transformOrigin: "right center",
            background: "linear-gradient(90deg, rgba(255,250,235,0) 0%, rgba(255,250,235,0.95) 100%)" }}
          initial={{ x: 0, y: 0, opacity: 0 }}
          animate={{ x: [0, -520], y: [0, 280], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.4, times: [0, 0.15, 0.7, 1], repeat: Infinity, repeatDelay: 9, delay: 3, ease: "easeIn" }}
        />
      )}
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
