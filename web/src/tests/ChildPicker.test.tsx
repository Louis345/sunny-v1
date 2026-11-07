import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChildPicker } from "../components/ChildPicker";

// Owner, 2026-11-07: the kids' start screen shows only the kids. The creator profile and the diagnostic
// mode are grown-up tools; they stay reachable on the grown-up address (?dev=1), never on the kids' screen.
const rows = [
  { childName: "Ila", companionName: "Elli" },
  { childName: "Reina", companionName: "Matilda" },
  { childName: "creator", companionName: "Charlotte" },
];
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => rows })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

it("shows only the kids on the start screen", async () => {
  render(<ChildPicker onSelect={vi.fn()} />);
  await waitFor(() => expect(screen.getByRole("button", { name: /Ila with Elli/ })).toBeTruthy());
  expect(screen.getByRole("button", { name: /Reina with Matilda/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /creator/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /diagnostic/i })).toBeNull();
});

it("keeps the grown-up tools on the dev address", async () => {
  window.history.replaceState(null, "", "/?dev=1");
  render(<ChildPicker onSelect={vi.fn()} />);
  await waitFor(() => expect(screen.getByRole("button", { name: /Creator diagnostic mode/ })).toBeTruthy());
  expect(screen.getByRole("button", { name: /creator with Charlotte/ })).toBeTruthy();
});

it("opens on a warm, decorative sky that never takes a tap", async () => {
  render(<ChildPicker onSelect={vi.fn()} />);
  await waitFor(() => expect(screen.getByRole("button", { name: /Ila with Elli/ })).toBeTruthy());
  const sky = screen.getByTestId("start-screen-sky");
  expect(sky.getAttribute("aria-hidden")).toBe("true");
  expect(sky.className).toContain("pointer-events-none");
});

// Owner, 2026-11-07: the sky follows the real sun where the kiosk is, from its timezone only (no location).
import { skyForTime } from "../components/ChildPicker";
const eastern = (iso: string, offsetHours: number) => ({ at: new Date(iso), utcOffsetMinutes: offsetHours * 60, standardOffsetMinutes: -300 });
it("follows the real sun: dark after an early November sunset, sunrise colors at dawn", () => {
  expect(skyForTime(eastern("2026-11-07T23:00:00Z", -5)).name).toBe("night");    // 6:00 pm, sun set ~4:40
  expect(skyForTime(eastern("2026-11-07T21:50:00Z", -5)).name).toBe("twilight"); // 4:50 pm
  expect(skyForTime(eastern("2026-11-07T21:10:00Z", -5)).name).toBe("golden");   // 4:10 pm
  expect(skyForTime(eastern("2026-11-07T11:40:00Z", -5)).name).toBe("sunrise");  // 6:40 am
  expect(skyForTime(eastern("2026-11-07T17:00:00Z", -5)).name).toBe("day");      // noon
  expect(skyForTime(eastern("2026-06-21T23:00:00Z", -4)).name).toBe("day");      // 7:00 pm in June, still light
  expect(skyForTime(eastern("2026-11-07T23:00:00Z", -5)).lights).toBe("stars");
});

it("fills a night sky with many stars", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 7, 21, 0));
  render(<ChildPicker onSelect={vi.fn()} />);
  await waitFor(() => expect(screen.getByTestId("start-screen-sky").getAttribute("data-sky")).toBe("night"));
  expect(screen.getByTestId("start-screen-sky").querySelectorAll("[data-star]").length).toBeGreaterThanOrEqual(60);
  vi.useRealTimers();
});

it("gives the night sky depth and a shooting star", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 7, 21, 0));
  render(<ChildPicker onSelect={vi.fn()} />);
  await waitFor(() => expect(screen.getByTestId("start-screen-sky").getAttribute("data-sky")).toBe("night"));
  const sky = screen.getByTestId("start-screen-sky");
  expect(sky.querySelectorAll("[data-star-layer]").length).toBe(2);
  expect(sky.querySelector("[data-shooting-star]")).not.toBeNull();
  vi.useRealTimers();
});
