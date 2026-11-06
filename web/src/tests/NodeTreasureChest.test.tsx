import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NodeTreasureChest, CHEST_OPEN_MS } from "../components/NodeTreasureChest";

beforeEach(() => { vi.useFakeTimers(); vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("shows the chest's rarity and its odds before she opens it, and nothing inside", () => {
  render(<NodeTreasureChest rarity="epic" bonusChance={0.15} loot={{ coins: 40, item: { name: "Comet Cape", rarity: "epic" } }} onCollect={() => {}} />);
  expect(screen.getByText("Epic chest")).toBeTruthy();
  expect(screen.getByText("15% bonus")).toBeTruthy();
  expect(screen.getByRole("button", { name: /tap to open/i })).toBeTruthy();
  expect(screen.queryByText("Comet Cape")).toBeNull();
});

it("opens on a tap, pays coins and the item, and collects once", () => {
  const onCollect = vi.fn();
  render(<NodeTreasureChest rarity="legendary" loot={{ coins: 120, item: { name: "Star Crown", rarity: "legendary" } }} onCollect={onCollect} />);
  fireEvent.click(screen.getByRole("button", { name: /tap to open/i }));
  act(() => { vi.advanceTimersByTime(CHEST_OPEN_MS); });
  expect(screen.getByText("+120 coins")).toBeTruthy();
  expect(screen.getByText("Star Crown")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /collect/i }));
  fireEvent.click(screen.getByRole("button", { name: /collect/i }));
  expect(onCollect).toHaveBeenCalledTimes(1);
});

it("keeps a mystery chest's rarity hidden until it opens", () => {
  render(<NodeTreasureChest rarity="mystery" loot={{ coins: 25, item: { name: "Ribbon Bow", rarity: "rare" } }} onCollect={() => {}} />);
  expect(screen.getByText("Mystery chest")).toBeTruthy();
  expect(screen.queryByText(/rare/i)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /tap to open/i }));
  act(() => { vi.advanceTimersByTime(CHEST_OPEN_MS); });
  expect(screen.getByText("Rare")).toBeTruthy();
  expect(screen.getByText("Ribbon Bow")).toBeTruthy();
});
