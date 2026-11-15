import { weatherFromOpenMeteo, type LiveWeather } from "../shared/liveWeather";

/**
 * The real weather where the kiosk is, from Open-Meteo (free, no key). Screens and companions read the cache; it is
 * refreshed in the background at most every thirty minutes, so nothing ever waits for the weather. The location is a
 * town-level point from the kiosk's own .env (SUNNY_WEATHER_LATITUDE / SUNNY_WEATHER_LONGITUDE), never from the code
 * (public repo). No location: no request and no weather.
 */
export type WeatherLocation = { latitude: number; longitude: number };

const REFRESH_EVERY_MS = 30 * 60 * 1000;
const STALE_AFTER_MS = 3 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 4000;

/** Rounded to a tenth of a degree (about 10 km): enough for the weather, not an address. */
export function weatherLocationFromEnv(env: Record<string, string | undefined> = process.env): WeatherLocation | null {
  const latitude = Number(env.SUNNY_WEATHER_LATITUDE);
  const longitude = Number(env.SUNNY_WEATHER_LONGITUDE);
  if (!env.SUNNY_WEATHER_LATITUDE?.trim() || !env.SUNNY_WEATHER_LONGITUDE?.trim()) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const tenth = (value: number) => Math.round(value * 10) / 10;
  return { latitude: tenth(latitude), longitude: tenth(longitude) };
}

export function createLiveWeather(input: {
  location: WeatherLocation | null;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  now?: () => Date;
}) {
  const fetchImpl = input.fetchImpl ?? ((url: string, init?: RequestInit) => fetch(url, init));
  const now = input.now ?? (() => new Date());
  let latest: LiveWeather | null = null;
  let lastAttemptAt = 0;
  let inFlight: Promise<void> | null = null;

  function current(): LiveWeather | null {
    if (!latest) return null;
    const age = now().getTime() - new Date(latest.observedAt).getTime();
    return age <= STALE_AFTER_MS ? latest : null;
  }

  async function fetchOnce(location: WeatherLocation): Promise<void> {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}`
      + "&current=temperature_2m,weather_code,is_day&temperature_unit=fahrenheit&timezone=auto";
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`status_${response.status}`);
      const weather = weatherFromOpenMeteo(await response.json(), now());
      if (!weather) throw new Error("unreadable_reply");
      latest = weather;
      console.log(` 🎮 [live-weather] [refresh] [ok] condition=${weather.condition} temperatureF=${weather.temperatureF} day=${weather.isDay}`);
    } catch (error: unknown) {
      console.warn(` 🎮 [live-weather] [refresh] [failed] reason=${error instanceof Error ? error.message : String(error)} keeping=${current() ? "last" : "none"}`);
    }
  }

  /** Fetches when the cache is due; callers share one request. Never throws. */
  function refresh(): Promise<void> {
    const location = input.location;
    if (!location) return Promise.resolve();
    if (inFlight) return inFlight;
    if (lastAttemptAt && now().getTime() - lastAttemptAt < REFRESH_EVERY_MS) return Promise.resolve();
    lastAttemptAt = now().getTime();
    inFlight = fetchOnce(location).finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  return { current, refresh };
}

let kioskWeather: ReturnType<typeof createLiveWeather> | null = null;

/** The kiosk's one weather cache, located from its .env. */
export function kioskLiveWeather(): ReturnType<typeof createLiveWeather> {
  if (!kioskWeather) {
    const location = weatherLocationFromEnv();
    console.log(` 🎮 [live-weather] [setup] [${location ? "located" : "no_location"}]`);
    kioskWeather = createLiveWeather({ location });
  }
  return kioskWeather;
}
