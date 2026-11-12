import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WardrobeStoreLab } from "../components/WardrobeStoreLab";
import {
  WARDROBE_STORE_CATALOG,
  createCompanionShoppingVisit,
  createInitialWardrobeStoreState,
  getCompatibleWardrobeItems,
} from "../lib/wardrobeStore";
import { rewardForWardrobeItem, walletShopItems, withServerWallet } from "../lib/wardrobeWallet";

// Owner, 2026-11-07: the outfit shop in the earned call spends her real coins (the one balance the chests
// fill), shows what she really owns, and never runs on browser-only demo coins.
const companion = { id: "elli", name: "Elli", modelUrl: "/companions/sample.vrm" };
const call = { talkPhase: "idle" as const, responseText: "", error: null, onAskVoice: vi.fn() };
type Server = { coins: number; owned: string[]; purchases: unknown[]; signals: Array<{ itemId: string; action: string; companionId: string }> };
function fakeServer(start: { coins: number; owned?: string[] }): Server {
  const server: Server = { coins: start.coins, owned: start.owned ?? [], purchases: [], signals: [] };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const json = (data: unknown) => ({ ok: true, json: async () => data });
    if (url === "/api/rewards/wallet/ila") return json({ coins: server.coins, ownedRewardIds: server.owned });
    if (url === "/api/child/ila/wardrobe-signal") { server.signals.push(JSON.parse(String(init?.body))); return json({ ok: true }); }
    if (url === "/api/rewards/purchase") {
      const body = JSON.parse(String(init?.body));
      server.purchases.push(body);
      const price = rewardForWardrobeItem(String(body.offer.itemId).replace("outfit:", ""))?.price ?? 0;
      return json({ ok: true, balance: server.coins - price, price, duplicate: false, callMinutes: 0 });
    }
    throw new Error(`unexpected ${url}`);
  }));
  return server;
}
// The seed the existing purchase test uses; Elli accepts at least one priced item on that visit.
const SEED = "purchase-flow";
function acceptedItem() {
  const items = getCompatibleWardrobeItems(WARDROBE_STORE_CATALOG, companion.modelUrl, companion.id);
  const visit = createCompanionShoppingVisit({ companionId: companion.id, items, state: createInitialWardrobeStoreState(), visitSeed: SEED });
  const item = items.find(row => visit.itemOpinions[row.id]?.companionConsentsToWear && rewardForWardrobeItem(row.id)?.price !== undefined);
  if (!item) throw new Error("no accepted priced item on this visit");
  return item;
}
const shop = (seed: string) => render(
  <WardrobeStoreLab companion={companion} companionPreview={<div />} call={call} onWardrobeChange={vi.fn()} onExit={vi.fn()} visitSeed={seed} wallet={{ childId: "ila" }} />,
);

beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("replaces demo coins with her saved coins and her saved closet", () => {
  const state = withServerWallet(createInitialWardrobeStoreState(), { coins: 40, ownedRewardIds: ["outfit:star-halo", "game:asteroid"] });
  expect(state.ledger.reduce((sum, row) => sum + row.amount, 0)).toBe(40);
  expect(state.ownedItemIds).toEqual(["star-halo"]);
});

it("offers only items with a coin price, plus what she already owns", () => {
  // Every real item is priced since 2026-11-12, so an unpriced one is synthetic here.
  const unpriced = { ...WARDROBE_STORE_CATALOG[0], id: "unpriced-test-item" };
  const ids = walletShopItems([...WARDROBE_STORE_CATALOG, unpriced], ["unpriced-test-item-owned"]).map(item => item.id);
  expect(ids).toContain("cat-ears");
  expect(ids).not.toContain("unpriced-test-item");
  const owned = { ...WARDROBE_STORE_CATALOG[0], id: "unpriced-test-item-owned" };
  expect(walletShopItems([owned], ["unpriced-test-item-owned"]).map(item => item.id)).toEqual(["unpriced-test-item-owned"]);
});

function buy(item: { name: string; price: number }) {
  fireEvent.click(screen.getByRole("button", { name: `View ${item.name}, ${item.price} coins` }));
  fireEvent.click(screen.getByRole("button", { name: `Try on ${item.name}` }));
  fireEvent.click(screen.getByRole("button", { name: `Buy and wear ${item.name} for ${item.price} coins` }));
}

it("shows her real balance and buys through the server", async () => {
  const item = acceptedItem();
  const reward = rewardForWardrobeItem(item.id)!;
  const server = fakeServer({ coins: 100 });
  shop(SEED);
  await waitFor(() => expect(screen.getByText(/100 coins/)).toBeTruthy());
  expect(screen.queryByText(/demo coins/i)).toBeNull();
  expect(screen.queryByText(/demo currency/i)).toBeNull();
  buy(item);
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(`${item.name} added to Elli’s closet · 100 → ${100 - item.price} coins`));
  expect(server.purchases).toEqual([{ childId: "ila", receiptId: `wardrobe:ila:${item.id}`, offer: { kind: "outfit", itemId: reward.id } }]);
});

it("says how many more coins she needs and never calls the server when she is short", async () => {
  const item = acceptedItem();
  const server = fakeServer({ coins: item.price - 5 });
  shop(SEED);
  await waitFor(() => expect(screen.getByText(new RegExp(`${item.price - 5} coins`))).toBeTruthy());
  buy(item);
  await waitFor(() => expect(screen.getByText(/You need 5 more coins/)).toBeTruthy());
  expect(server.purchases).toEqual([]);
});

// Shopping behavior uses explicit synthetic approvals, as in WardrobeStoreLab.test.tsx; real assets stay
// quarantined and wardrobe-certification.test.ts exercises the unmocked gate.
vi.mock("../lib/wardrobeBodyProfiles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/wardrobeBodyProfiles")>();
  return {...actual, isWardrobePairApproved: () => true, resolveWardrobeTemplateCertification: (companionId: string, templateId: string) => ({
    companionId, templateId,
    status: ["royal-crown", "cat-ears", "star-halo"].includes(templateId) ? "approved" : "candidate",
    reason: "TEST FIXTURE ONLY — synthetic human approval for shopping behavior",
  })};
});

it("tells the call clock her new balance after a purchase", async () => {
  const item = acceptedItem();
  fakeServer({ coins: 100 });
  const heard = vi.fn();
  window.addEventListener("sunny:coins-changed", heard);
  shop(SEED);
  await waitFor(() => expect(screen.getByText(/100 coins/)).toBeTruthy());
  buy(item);
  await waitFor(() => expect(heard).toHaveBeenCalledTimes(1));
  expect((heard.mock.calls[0][0] as CustomEvent).detail).toEqual({ childId: "ila", coins: 100 - item.price });
  window.removeEventListener("sunny:coins-changed", heard);
});


// BUGS.md 2026-11-08: the greyed-out collection (her goals) was built but only in Storybook. The call's shop
// shows it, from the same server wallet the shop spends.
it("the call's shop shows her collection: owned items in colour, the rest greyed as goals", async () => {
  fakeServer({ coins: 100, owned: ["outfit:cat-ears", "game:asteroid"] });
  shop(SEED);
  await waitFor(() => expect(screen.getByTestId("reward-tile-outfit:cat-ears")).toHaveAttribute("data-locked", "false"));
  expect(screen.getByTestId("reward-tile-game:asteroid")).toHaveAttribute("data-locked", "false");
  expect(screen.getByTestId("reward-tile-outfit:rose-ribbon-dress")).toHaveAttribute("data-locked", "true");
  expect(screen.getByText(/^2 of \d+ found$/)).toBeTruthy();
});

it("a purchase in the call's shop unlocks its tile in the collection", async () => {
  const item = acceptedItem();
  const reward = rewardForWardrobeItem(item.id)!;
  fakeServer({ coins: 100 });
  shop(SEED);
  await waitFor(() => expect(screen.getByTestId(`reward-tile-${reward.id}`)).toHaveAttribute("data-locked", "true"));
  buy(item);
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(`${item.name} added to Elli’s closet`));
  fireEvent.click(screen.getByRole("button", { name: "Elli’s closet" }));
  const closet = screen.getByRole("dialog", { name: "Elli’s closet" });
  expect(within(closet).getByTestId(`reward-tile-${reward.id}`)).toHaveAttribute("data-locked", "false");
  expect(within(closet).getByTestId("reward-tile-outfit:rose-ribbon-dress")).toHaveAttribute("data-locked", "true");
});

// Owner 2026-11-11: Matilda is Reina's companion again and looks never migrate between companions, so opening a
// shop leaves every saved closet exactly as it was.
it("leaves each child's saved looks where they were when the shop loads", async () => {
  fakeServer({ coins: 0 });
  const angelLook = { ...createInitialWardrobeStoreState(), ownedItemIds: ["sleeveless-dress"], equippedByCompanion: { matilda: { outfitItemId: "sleeveless-dress" } } };
  window.localStorage.setItem("sunny:wardrobe-store-lab:v1:ila", JSON.stringify(angelLook));
  window.localStorage.setItem("sunny:wardrobe-store-lab:v1:reina", JSON.stringify(angelLook));
  shop(SEED);
  const saved = JSON.parse(window.localStorage.getItem("sunny:wardrobe-store-lab:v1:ila")!);
  expect(saved.equippedByCompanion).toEqual({ matilda: { outfitItemId: "sleeveless-dress" } });
  expect(JSON.parse(window.localStorage.getItem("sunny:wardrobe-store-lab:v1:reina")!)).toEqual(angelLook);
  await waitFor(() => expect(screen.getAllByText(/0 coins/).length).toBeGreaterThan(0));
});

// Owner 2026-11-12: what she tries on and buys reaches the server as shop signals, so rewards can follow her taste.
it("sends each try-on and purchase in her real-coin shop to the server as a wardrobe signal", async () => {
  const server = fakeServer({ coins: 1000 });
  const item = acceptedItem();
  shop(SEED);
  await waitFor(() => expect(screen.getByText(/1000 coins/)).toBeTruthy());
  buy(item);
  await waitFor(() => expect(server.signals.map(signal => signal.action)).toEqual(expect.arrayContaining(["previewed", "purchased"])));
  expect(server.signals.every(signal => signal.itemId === item.id && signal.companionId === "elli")).toBe(true);
});
