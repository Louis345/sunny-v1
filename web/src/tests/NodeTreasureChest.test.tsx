import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NodeTreasureChest, CHEST_OPEN_MS, chestFromServer } from "../components/NodeTreasureChest";

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

it("shows the server's saved chest: its kind, real odds, coins and bonus call minutes", () => {
  const props = chestFromServer({ kind: "mystery", rarity: "epic", coins: 60, bonusChance: 0.5, bonus: { kind: "call_minutes", minutes: 10 } });
  expect(props).toEqual({ rarity: "mystery", bonusChance: 0.5, loot: { coins: 60, rarity: "epic", item: { name: "10 call minutes", rarity: "epic", icon: "🎥" } } });
  expect(chestFromServer({ kind: "common", rarity: "common", coins: 25, bonusChance: 0.1 }).loot).toEqual({ coins: 25, rarity: "common" });
});

it("reveals a mystery chest's rolled rarity even when it held no bonus", () => {
  render(<NodeTreasureChest rarity="mystery" loot={{ coins: 35, rarity: "rare" }} onCollect={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /tap to open/i }));
  act(() => { vi.advanceTimersByTime(CHEST_OPEN_MS); });
  expect(screen.getByText("Rare chest")).toBeTruthy();
});

it("the board shows the chest the server saved when a stop finishes", async () => {
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const app = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
  expect(app).toContain("if (completion?.nodeChest) setNodeChest(completion.nodeChest);");
  // Inside the "nice work" panel, never its own overlay: Back to map must stay reachable (caught by the
  // browser acceptance runs, 2026-11-06, when a separate chest overlay covered it).
  expect(app.match(/<NodeTreasureChest compact \{\.\.\.chestFromServer\(nodeChest\)\}/g)?.length).toBe(2);
  expect(app).not.toContain("node-chest-overlay");
});

it("inside the panel it opens on a tap and needs no Collect: the panel's own buttons move her on", () => {
  render(<NodeTreasureChest compact rarity="common" loot={{ coins: 25 }} onCollect={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /tap to open/i }));
  act(() => { vi.advanceTimersByTime(CHEST_OPEN_MS); });
  expect(screen.getByText("+25 coins")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /collect/i })).toBeNull();
});

it("shows a dropped collection item with its catalog name, icon and rarity", () => {
  const props = chestFromServer({ homeworkId: "hw", nodeId: "n1", kind: "rare", rarity: "rare", coins: 35, bonusChance: 0.25, bonus: { kind: "item", itemId: "outfit:comet-hoodie" } });
  expect(props.loot.item).toEqual({ name: "Comet Hoodie", rarity: "rare", icon: "🧥" });
});

it("tells the board once when she opens the chest, so her companion can react", () => {
  const onOpened = vi.fn();
  render(<NodeTreasureChest rarity="rare" loot={{ coins: 35 }} onOpened={onOpened} onCollect={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /tap to open/i }));
  act(() => { vi.advanceTimersByTime(CHEST_OPEN_MS); });
  expect(onOpened).toHaveBeenCalledTimes(1);
});

it("the board names the opened chest to the server and never what it held", async () => {
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const app = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
  expect(app).toMatch(/sendMessage\("reward_drop", \{ homeworkId: nodeChest\.homeworkId, nodeId: nodeChest\.nodeId \}\)/);
});
