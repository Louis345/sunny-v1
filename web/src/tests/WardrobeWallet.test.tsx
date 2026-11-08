import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
type Server = { coins: number; owned: string[]; purchases: unknown[] };
function fakeServer(start: { coins: number; owned?: string[] }): Server {
  const server: Server = { coins: start.coins, owned: start.owned ?? [], purchases: [] };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const json = (data: unknown) => ({ ok: true, json: async () => data });
    if (url === "/api/rewards/wallet/ila") return json({ coins: server.coins, ownedRewardIds: server.owned });
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
  const ids = walletShopItems(WARDROBE_STORE_CATALOG, ["comet-hoodie"]).map(item => item.id);
  expect(ids).toContain("cat-ears");
  expect(ids).toContain("comet-hoodie");
  expect(ids).not.toContain("constellation-blazer");
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

