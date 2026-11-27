import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TryOnTray, type TryOnEntry } from "../components/TryOnTray";
import { REWARD_CATALOG } from "../../../src/shared/rewardCatalog";

// Owner 2026-11-15 (mock approved): one row, every circle she can tap does something, locked things show their chest.
const item = (id: string) => REWARD_CATALOG.find(row => row.id === id)!;
const entries: TryOnEntry[] = [
  { item: item("outfit:sky-ribbon-dress"), owned: true, fits: true, tint: "#7cc8ff", worn: true },
  { item: item("outfit:cat-ears"), owned: true, fits: false, worn: false },
  { item: item("outfit:rose-ribbon-dress"), owned: false, fits: true, chest: "legendary", worn: false },
  { item: item("game:asteroid"), owned: true, fits: true, worn: false },
];

it("shows one circle per wearable thing in its real colour, and hides what does not fit or is not clothing", () => {
  render(<TryOnTray entries={entries} onWear={() => {}} onOriginal={() => {}} onClose={() => {}} companionName="Princess" />);
  const sky = screen.getByTestId("try-on-outfit:sky-ribbon-dress");
  expect(sky.style.backgroundColor).toBe("rgb(124, 200, 255)");
  expect(sky.getAttribute("data-worn")).toBe("true");
  expect(screen.queryByTestId("try-on-outfit:cat-ears")).toBeNull();
  expect(screen.queryByTestId("try-on-game:asteroid")).toBeNull();
  expect(screen.getByTestId("try-on-outfit:rose-ribbon-dress").getAttribute("data-chest")).toBe("legendary");
});

it("wears on one tap, and every circle does something", () => {
  const onWear = vi.fn(), onLocked = vi.fn(), onOriginal = vi.fn(), onClose = vi.fn();
  render(<TryOnTray entries={entries} onWear={onWear} onLocked={onLocked} onOriginal={onOriginal} onClose={onClose} companionName="Princess" />);
  fireEvent.click(screen.getByTestId("try-on-outfit:sky-ribbon-dress"));
  expect(onWear).toHaveBeenCalledWith(item("outfit:sky-ribbon-dress"));
  fireEvent.click(screen.getByTestId("try-on-outfit:rose-ribbon-dress"));
  expect(onLocked).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Her own clothes" }));
  expect(onOriginal).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
