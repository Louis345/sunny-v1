import { afterEach, describe, expect, it, vi } from "vitest";
import { weatherFromOpenMeteo } from "../shared/liveWeather";
import { createLiveWeather, weatherLocationFromEnv } from "./liveWeather";

// Owner 2026-11-15: "I want Sunny to reflect what's going on in the world. If it's snowing out, Sunny's snowing."
// The weather never blocks a screen: it is read from a cache, refreshed in the background, and simply absent when
// the kiosk has no location or the service is down.

const reply = (code: number, temperature = 41.4, isDay = 1) => ({
  current: { time: "2026-11-15T15:00", temperature_2m: temperature, weather_code: code, is_day: isDay },
});

describe("live weather", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads the weather service's codes as what a child would see outside", () => {
    expect(weatherFromOpenMeteo(reply(0), new Date("2026-11-15T20:00:00Z"))).toEqual({
      condition: "clear", temperatureF: 41, isDay: true, observedAt: "2026-11-15T20:00:00.000Z",
    });
    expect(weatherFromOpenMeteo(reply(3))?.condition).toBe("cloudy");
    expect(weatherFromOpenMeteo(reply(45))?.condition).toBe("fog");
    expect(weatherFromOpenMeteo(reply(53))?.condition).toBe("rain");
    expect(weatherFromOpenMeteo(reply(63))?.condition).toBe("rain");
    expect(weatherFromOpenMeteo(reply(81))?.condition).toBe("rain");
    expect(weatherFromOpenMeteo(reply(73))?.condition).toBe("snow");
    expect(weatherFromOpenMeteo(reply(86))?.condition).toBe("snow");
    expect(weatherFromOpenMeteo(reply(95))?.condition).toBe("storm");
    expect(weatherFromOpenMeteo(reply(2, 30, 0))).toMatchObject({ condition: "partly_cloudy", isDay: false });
    expect(weatherFromOpenMeteo({ current: { weather_code: "x" } })).toBeNull();
    expect(weatherFromOpenMeteo(null)).toBeNull();
  });

  it("uses only a rounded town-level location from the kiosk's own settings, never one in the code", () => {
    expect(weatherLocationFromEnv({})).toBeNull();
    expect(weatherLocationFromEnv({ SUNNY_WEATHER_LATITUDE: "abc", SUNNY_WEATHER_LONGITUDE: "-73.9" })).toBeNull();
    expect(weatherLocationFromEnv({ SUNNY_WEATHER_LATITUDE: "42.8712", SUNNY_WEATHER_LONGITUDE: "-73.9234" })).toEqual({
      latitude: 42.9, longitude: -73.9,
    });
  });

  it("asks the service at most once every thirty minutes and keeps the last good weather when it fails", async () => {
    let now = new Date("2026-11-15T20:00:00Z");
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(reply(71, 29.6))));
    const weather = createLiveWeather({ location: { latitude: 42.9, longitude: -73.9 }, fetchImpl, now: () => now });
    expect(weather.current()).toBeNull();
    await weather.refresh();
    expect(weather.current()).toMatchObject({ condition: "snow", temperatureF: 30 });
    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toContain("latitude=42.9");
    expect(url).toContain("longitude=-73.9");
    expect(url).toContain("temperature_unit=fahrenheit");
    await weather.refresh();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now = new Date("2026-11-15T20:31:00Z");
    fetchImpl.mockImplementationOnce(async () => { throw new Error("offline"); });
    await weather.refresh();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(weather.current()).toMatchObject({ condition: "snow" });
    // Weather older than three hours is no longer what is outside.
    now = new Date("2026-11-15T23:30:00Z");
    fetchImpl.mockImplementationOnce(async () => new Response("bad", { status: 500 }));
    await weather.refresh();
    expect(weather.current()).toBeNull();
  });

  it("never calls the service when the kiosk has no location", async () => {
    const fetchImpl = vi.fn();
    const weather = createLiveWeather({ location: null, fetchImpl, now: () => new Date() });
    await weather.refresh();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(weather.current()).toBeNull();
  });

  it("shares one request when several screens ask at once", async () => {
    let resolve!: (value: Response) => void;
    const fetchImpl = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    const weather = createLiveWeather({ location: { latitude: 42.9, longitude: -73.9 }, fetchImpl, now: () => new Date("2026-11-15T20:00:00Z") });
    const first = weather.refresh();
    const second = weather.refresh();
    resolve(new Response(JSON.stringify(reply(61))));
    await Promise.all([first, second]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(weather.current()?.condition).toBe("rain");
  });
});
