import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChildPicker } from "../components/ChildPicker";
import { StartScreenWeather, startScreenWeatherLook } from "../components/StartScreenWeather";
import type { LiveWeather } from "../../../src/shared/liveWeather";

// Owner 2026-11-15: "If it's snowing out, Sunny's snowing. If it's raining, it's raining." The start screen shows
// the real weather, with no words (pictures and motion, Ila is dyslexic), and never waits for it.

const weather = (condition: LiveWeather["condition"], temperatureF = 41, isDay = true): LiveWeather => ({
  condition, temperatureF, isDay, observedAt: "2026-11-15T20:00:00.000Z",
});

describe("start screen weather", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls what is really falling outside, and leaves in autumn when nothing is", () => {
    expect(startScreenWeatherLook(weather("rain"), "autumn")).toMatchObject({ falling: "rain", veil: "grey" });
    expect(startScreenWeatherLook(weather("storm"), "summer")).toMatchObject({ falling: "rain", veil: "dark" });
    expect(startScreenWeatherLook(weather("snow", 29), "autumn")).toMatchObject({ falling: "snow", veil: "grey" });
    expect(startScreenWeatherLook(weather("clear"), "autumn")).toMatchObject({ falling: "leaves", veil: "none" });
    expect(startScreenWeatherLook(weather("clear"), "winter")).toMatchObject({ falling: "none", veil: "none" });
    expect(startScreenWeatherLook(weather("fog"), "spring")).toMatchObject({ falling: "none", veil: "fog" });
  });

  it("uses the season alone when the weather is unknown, so the screen is never blank", () => {
    expect(startScreenWeatherLook(null, "autumn")).toMatchObject({ falling: "leaves", veil: "none", temperature: null });
    expect(startScreenWeatherLook(null, "holiday")).toMatchObject({ falling: "snow" });
    expect(startScreenWeatherLook(null, "summer")).toMatchObject({ falling: "none" });
  });

  it("shows the temperature as a picture and a number, nothing to read", () => {
    render(<StartScreenWeather weather={weather("snow", 29.6)} season="autumn" />);
    expect(screen.getByTestId("start-screen-weather").getAttribute("data-falling")).toBe("snow");
    expect(screen.getByTestId("start-screen-temperature").textContent).toBe("❄️30°");
    expect(screen.getAllByTestId("start-screen-weather-particle").length).toBeGreaterThan(10);
  });

  it("scatters the flakes instead of lining them up (2026-11-15 render: snow fell in one diagonal line)", () => {
    render(<StartScreenWeather weather={weather("snow")} season="autumn" />);
    const particles = screen.getAllByTestId("start-screen-weather-particle").slice(0, 30);
    const lefts = particles.map((particle) => parseFloat(particle.style.left));
    const delays = particles.map((particle) => parseFloat(particle.style.animation.match(/(-?[\d.]+)s linear (-?[\d.]+)s/)![2]));
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const [ml, md] = [mean(lefts), mean(delays)];
    const covariance = mean(lefts.map((left, index) => (left - ml) * (delays[index] - md)));
    const spread = (values: number[], m: number) => Math.sqrt(mean(values.map((value) => (value - m) ** 2)));
    expect(Math.abs(covariance / (spread(lefts, ml) * spread(delays, md)))).toBeLessThan(0.5);
    const rising = lefts.slice(1).filter((left, index) => left > lefts[index]).length;
    expect(rising).toBeGreaterThan(5);
    expect(rising).toBeLessThan(24);
  });

  it("keeps still for reduced motion: no falling particles, the temperature stays", () => {
    render(<StartScreenWeather weather={weather("rain")} season="autumn" reducedMotion />);
    expect(screen.queryAllByTestId("start-screen-weather-particle")).toHaveLength(0);
    expect(screen.getByTestId("start-screen-temperature").textContent).toBe("🌧️41°");
  });

  it("asks the kiosk for the weather without waiting for it, and carries on when it has none", async () => {
    const rows = [{ childName: "Ila", companionName: "Elli" }];
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/weather") return { ok: true, json: async () => ({ weather: weather("rain", 38) }) };
      return { ok: true, json: async () => rows };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ChildPicker onSelect={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("start-screen-temperature").textContent).toBe("🌧️38°"));
    expect(fetchMock).toHaveBeenCalledWith("/api/weather");
  });

  it("shows the season's weather when the kiosk has no weather", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url === "/api/weather" ? { ok: true, json: async () => ({ weather: null }) } : { ok: true, json: async () => [{ childName: "Ila", companionName: "Elli" }] }));
    render(<ChildPicker onSelect={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("start-screen-weather")).toBeTruthy());
    expect(screen.queryByTestId("start-screen-temperature")).toBeNull();
  });
});
