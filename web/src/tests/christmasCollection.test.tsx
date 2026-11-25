import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RewardCollection } from "../components/RewardCollection";
import { TryOnTray, type TryOnEntry } from "../components/TryOnTray";
import { CHRISTMAS_2026, REWARD_CATALOG } from "../../../src/shared/rewardCatalog";

// Christmas drop 2026, S5 (owner, 2026-11-25): the Christmas set shows as greyed-out shapes, filling in as she wins
// them, with no text she needs to read (F4).

const christmas = REWARD_CATALOG.filter(item => item.season === CHRISTMAS_2026.id);
const IN = "2026-12-10T17:00:00.000Z";

describe("the Christmas set in her collection", () => {
  it("has its own row with every item, greyed until won", () => {
    render(<RewardCollection ownedIds={[christmas[0]!.id]} nowIso={IN} />);
    const row = screen.getByTestId("reward-section-christmas");
    for (const item of christmas) expect(within(row).getByTestId(`reward-tile-${item.id}`).getAttribute("data-locked")).toBe(item === christmas[0] ? "false" : "true");
  });
});

describe("the Christmas set in the try-on closet", () => {
  const entries: TryOnEntry[] = christmas.map((item, index) => ({ item, owned: index === 0, fits: true, worn: false, chest: item.rarity }));
  it("shows a second row of shapes: won ones wearable, the rest greyed shapes of themselves, not padlocks", () => {
    render(<TryOnTray entries={entries} onWear={vi.fn()} onOriginal={vi.fn()} onClose={vi.fn()} companionName="Elli" />);
    const row = screen.getByTestId("try-on-season-row");
    expect(within(row).getByTestId(`try-on-${christmas[0]!.id}`).getAttribute("aria-label")).toBe(`Wear ${christmas[0]!.name}`);
    const locked = within(row).getByTestId(`try-on-${christmas[1]!.id}`);
    expect(locked.getAttribute("data-shape")).toBe("greyed");
    expect(locked.textContent).toBe(christmas[1]!.icon);
    expect(row.textContent).not.toMatch(/[a-z]{3,}/i);
  });
});

// S4: a legendary reveal looks and sounds different from a common one; a Christmas item opens with snow.
describe("the tier reveal", () => {
  it("a legendary item bursts in gold with the legendary sound; a common one does neither", async () => {
    vi.useFakeTimers();
    const sfx = await import("../utils/gameSfx");
    const play = vi.spyOn(sfx, "playLootSfx").mockImplementation(() => true);
    const { NodeTreasureChest, CHEST_OPEN_MS, chestFromServer } = await import("../components/NodeTreasureChest");
    const { act, fireEvent, cleanup } = await import("@testing-library/react");
    const tiara = christmas.find(item => item.rarity === "legendary")!;
    const legendary = chestFromServer({ kind: "legendary", rarity: "legendary", coins: 60, bonusChance: 1, bonus: { kind: "item", itemId: tiara.id } });
    const view = render(<NodeTreasureChest {...legendary} onCollect={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /tap to open/i }));
    act(() => { vi.advanceTimersByTime(CHEST_OPEN_MS); });
    expect(view.container.querySelector(".node-chest__burst")).toBeTruthy();
    expect(view.container.querySelector(".node-chest__snow")).toBeTruthy();
    expect(play).toHaveBeenLastCalledWith("legendary");
    cleanup();
    const hat = christmas.find(item => item.rarity === "common")!;
    const common = chestFromServer({ kind: "common", rarity: "common", coins: 8, bonusChance: 0.45, bonus: { kind: "item", itemId: hat.id } });
    const plain = render(<NodeTreasureChest {...common} onCollect={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /tap to open/i }));
    act(() => { vi.advanceTimersByTime(CHEST_OPEN_MS); });
    expect(plain.container.querySelector(".node-chest__burst")).toBeNull();
    expect(plain.container.querySelector(".node-chest__snow")).toBeTruthy();
    expect(play).toHaveBeenLastCalledWith("common");
    vi.useRealTimers();
  });
});
