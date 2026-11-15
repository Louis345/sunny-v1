/**
 * The real weather where the kiosk is (owner 2026-11-15: "if it's snowing out, Sunny's snowing"). Shared by the
 * server, which fetches it, the start screen, which paints it, and the companions, who may mention it.
 */
export type LiveWeatherCondition = "clear" | "partly_cloudy" | "cloudy" | "fog" | "rain" | "snow" | "storm";

export type LiveWeather = {
  condition: LiveWeatherCondition;
  temperatureF: number;
  isDay: boolean;
  observedAt: string;
};

/** WMO weather codes (Open-Meteo) as what a child would see outside. Drizzle and showers read as rain. */
function conditionForCode(code: number): LiveWeatherCondition | null {
  if (code === 0 || code === 1) return "clear";
  if (code === 2) return "partly_cloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95 && code <= 99) return "storm";
  return null;
}

/** Open-Meteo's `current` block as LiveWeather, or null when the reply is not one. */
export function weatherFromOpenMeteo(body: unknown, now: Date = new Date()): LiveWeather | null {
  const current = (body as { current?: Record<string, unknown> } | null)?.current;
  if (!current || typeof current !== "object") return null;
  const code = current.weather_code;
  const temperature = current.temperature_2m;
  if (typeof code !== "number" || typeof temperature !== "number" || !Number.isFinite(temperature)) return null;
  const condition = conditionForCode(code);
  if (!condition) return null;
  return { condition, temperatureF: Math.round(temperature), isDay: current.is_day !== 0, observedAt: now.toISOString() };
}

/** A LiveWeather sent over the wire, checked; anything else is no weather. */
export function readLiveWeather(value: unknown): LiveWeather | null {
  const candidate = value as Partial<LiveWeather> | null;
  if (!candidate || typeof candidate !== "object") return null;
  const conditions: LiveWeatherCondition[] = ["clear", "partly_cloudy", "cloudy", "fog", "rain", "snow", "storm"];
  if (!conditions.includes(candidate.condition as LiveWeatherCondition)) return null;
  if (typeof candidate.temperatureF !== "number" || !Number.isFinite(candidate.temperatureF)) return null;
  return {
    condition: candidate.condition as LiveWeatherCondition,
    temperatureF: candidate.temperatureF,
    isDay: candidate.isDay !== false,
    observedAt: typeof candidate.observedAt === "string" ? candidate.observedAt : "",
  };
}
