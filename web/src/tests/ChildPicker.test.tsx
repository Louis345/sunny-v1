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

// Owner, 2026-11-07: the sunrise sky was too bright; the sky follows the kiosk's local time, softly.
import { skyForHour } from "../components/ChildPicker";
it("follows the local time of day with a soft sky", () => {
  expect(skyForHour(8).name).toBe("morning");
  expect(skyForHour(13).name).toBe("day");
  expect(skyForHour(17).name).toBe("evening");
  expect(skyForHour(21).name).toBe("night");
  expect(skyForHour(3).name).toBe("night");
  expect(skyForHour(21).lights).toBe("stars");
  expect(skyForHour(21).text).not.toBe(skyForHour(13).text);
});
