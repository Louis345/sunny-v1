import type { CSSProperties } from "react";
import type { LiveWeather } from "../../../src/shared/liveWeather";
import type { Season } from "../../../src/shared/skyClock";

/**
 * The real weather on the start screen (owner 2026-11-15): rain when it rains, snow when it snows, leaves on a clear
 * autumn day. Pictures and motion only, no words (Ila is dyslexic). Unknown weather falls back to the season.
 */
export type StartScreenWeatherLook = {
  falling: "rain" | "snow" | "leaves" | "petals" | "none";
  veil: "none" | "grey" | "dark" | "fog";
  temperature: { icon: string; degrees: number } | null;
};

const ICONS: Record<LiveWeather["condition"], [day: string, night: string]> = {
  clear: ["☀️", "🌙"],
  partly_cloudy: ["⛅", "☁️"],
  cloudy: ["☁️", "☁️"],
  fog: ["🌫️", "🌫️"],
  rain: ["🌧️", "🌧️"],
  snow: ["❄️", "❄️"],
  storm: ["⛈️", "⛈️"],
};

function seasonFalling(season: Season): StartScreenWeatherLook["falling"] {
  if (season === "autumn" || season === "halloween") return "leaves";
  if (season === "spring") return "petals";
  return "none";
}

export function startScreenWeatherLook(weather: LiveWeather | null, season: Season): StartScreenWeatherLook {
  if (!weather) {
    return { falling: season === "winter" || season === "holiday" ? "snow" : seasonFalling(season), veil: "none", temperature: null };
  }
  const temperature = { icon: ICONS[weather.condition][weather.isDay ? 0 : 1], degrees: Math.round(weather.temperatureF) };
  switch (weather.condition) {
    case "rain":
      return { falling: "rain", veil: "grey", temperature };
    case "storm":
      return { falling: "rain", veil: "dark", temperature };
    case "snow":
      return { falling: "snow", veil: "grey", temperature };
    case "fog":
      return { falling: "none", veil: "fog", temperature };
    case "cloudy":
      return { falling: seasonFalling(season), veil: "grey", temperature };
    default:
      return { falling: seasonFalling(season), veil: "none", temperature };
  }
}

const PARTICLES: Record<Exclude<StartScreenWeatherLook["falling"], "none">, number> = { rain: 70, snow: 45, leaves: 16, petals: 16 };
const LEAF_COLORS = ["#d9772b", "#c4512a", "#e2a33a", "#a8562a"];
const VEILS: Record<StartScreenWeatherLook["veil"], string | null> = {
  none: null,
  grey: "linear-gradient(180deg, rgba(110,118,130,0.42) 0%, rgba(150,156,166,0.22) 100%)",
  dark: "linear-gradient(180deg, rgba(50,54,70,0.62) 0%, rgba(90,96,112,0.35) 100%)",
  fog: "linear-gradient(180deg, rgba(230,232,236,0.35) 0%, rgba(240,242,245,0.7) 100%)",
};

/**
 * A fixed scatter so the screen is the same on every render (no Math.random in render). A hash, not a step: a linear
 * step put every flake on one diagonal line (2026-11-15 render).
 */
const spread = (index: number, salt: number) => {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

function particleStyle(falling: Exclude<StartScreenWeatherLook["falling"], "none">, index: number): CSSProperties {
  const left = `${(spread(index, 1) * 104 - 2).toFixed(2)}%`;
  const delay = `${(-spread(index, 2) * 12).toFixed(2)}s`;
  if (falling === "rain") {
    return { left, top: "-12%", width: 2, height: 22 + spread(index, 3) * 18, borderRadius: 2, background: "rgba(200,220,245,0.75)",
      animation: `sunny-weather-rain ${(0.7 + spread(index, 4) * 0.5).toFixed(2)}s linear ${delay} infinite` };
  }
  if (falling === "snow") {
    const size = 4 + spread(index, 3) * 6;
    return { left, top: "-5%", width: size, height: size, borderRadius: "50%", background: "rgba(255,255,255,0.92)",
      animation: `sunny-weather-snow ${(8 + spread(index, 4) * 7).toFixed(2)}s linear ${delay} infinite` };
  }
  const size = 12 + spread(index, 3) * 10;
  return { left, top: "-6%", width: size, height: size * 0.7,
    borderRadius: falling === "leaves" ? "80% 0 80% 0" : "60% 40% 60% 40%",
    background: falling === "leaves" ? LEAF_COLORS[index % LEAF_COLORS.length] : "#f7bcd2", opacity: 0.88,
    animation: `sunny-weather-leaf ${(9 + spread(index, 4) * 8).toFixed(2)}s ease-in-out ${delay} infinite` };
}

export function StartScreenWeather({ weather, season, reducedMotion = false }: { weather: LiveWeather | null; season: Season; reducedMotion?: boolean }) {
  const look = startScreenWeatherLook(weather, season);
  const veil = VEILS[look.veil];
  const count = look.falling === "none" || reducedMotion ? 0 : PARTICLES[look.falling];
  return (
    <>
      <div data-testid="start-screen-weather" data-falling={look.falling} data-veil={look.veil} aria-hidden="true"
        style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <style>{`@keyframes sunny-weather-rain { from { transform: translate(0, 0) rotate(12deg); } to { transform: translate(-12vw, 125vh) rotate(12deg); } }
          @keyframes sunny-weather-snow { 0% { transform: translate(0, 0); } 50% { transform: translate(3vw, 55vh); } 100% { transform: translate(-1vw, 112vh); } }
          @keyframes sunny-weather-leaf { 0% { transform: translate(0, 0) rotate(0deg); } 33% { transform: translate(6vw, 38vh) rotate(160deg); } 66% { transform: translate(-3vw, 74vh) rotate(300deg); } 100% { transform: translate(4vw, 112vh) rotate(420deg); } }`}</style>
        {veil && <div style={{ position: "absolute", inset: 0, background: veil, transition: "background 2s ease" }} />}
        {Array.from({ length: count }, (_, index) => (
          <span key={`${look.falling}-${index}`} data-testid="start-screen-weather-particle"
            style={{ position: "absolute", ...particleStyle(look.falling as Exclude<StartScreenWeatherLook["falling"], "none">, index) }} />
        ))}
      </div>
      {look.temperature && (
        <div data-testid="start-screen-temperature" aria-label={`${look.temperature.degrees} degrees`}
          style={{ position: "absolute", top: 16, right: 20, display: "flex", alignItems: "center", gap: 6, padding: "6px 14px",
            borderRadius: 999, background: "rgba(255,255,255,0.55)", color: "#2f3a46", fontSize: 26, fontWeight: 600,
            boxShadow: "0 2px 10px rgba(0,0,0,0.08)", pointerEvents: "none" }}>
          <span>{look.temperature.icon}</span>{look.temperature.degrees}°
        </div>
      )}
    </>
  );
}
