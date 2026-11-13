import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./currencyAward", async original => ({
  ...await original<typeof import("./currencyAward")>(),
  purchaseForChild: vi.fn(() => ({ ok: true, balance: 10, price: 30, duplicate: false })),
  callClockForChild: vi.fn(() => ({ minutesLeft: 3, coins: 40, price: 30, minutes: 5, warnAtSecondsLeft: 60 })),
  spendCallMinuteForChild: vi.fn(() => ({ ok: true, minutesLeft: 2, coins: 40 })),
  walletForChild: vi.fn(() => ({ coins: 40, ownedRewardIds: ["outfit:cat-ears"] })),
}));
import { callClockForChild, purchaseForChild, spendCallMinuteForChild, walletForChild } from "./currencyAward";
import { setupRoutes } from "./routes";

const servers: ReturnType<ReturnType<typeof express>["listen"]>[] = [];
afterEach(() => { servers.splice(0).forEach(server => server.close()); vi.clearAllMocks(); });
async function call(method: "GET" | "POST", url: string, body?: unknown) {
  const app = express(); app.use(express.json()); setupRoutes(app);
  const server = app.listen(0); servers.push(server);
  const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${url}`, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
async function post(body: unknown) {
  const app = express(); app.use(express.json()); setupRoutes(app);
  const server = app.listen(0); servers.push(server);
  const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/rewards/purchase`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

// PR #59, 4.4: every purchase goes through one route that charges her companion plan.
it("buys through the companion plan and returns her new balance", async () => {
  expect(await post({ childId: "Reina", receiptId: "r1", offer: { kind: "call_minutes", minutes: 5 } })).toEqual({ status: 200, body: { ok: true, balance: 10, price: 30, duplicate: false } });
  expect(purchaseForChild).toHaveBeenCalledWith("reina", { receiptId: "r1", offer: { kind: "call_minutes", minutes: 5 } });
});

it("refuses a malformed purchase before touching her coins", async () => {
  expect((await post({ childId: "reina", offer: { kind: "call_minutes", minutes: 5 } })).status).toBe(400);
  expect((await post({ childId: "reina", receiptId: "r1", offer: { kind: "free_money" } })).status).toBe(400);
  expect(purchaseForChild).not.toHaveBeenCalled();
});

// Owner, 2026-11-07: the call screen reads and spends minutes only through the server.
it("reads her call clock and spends one minute per receipt", async () => {
  expect(await call("GET", "/api/rewards/call/Reina")).toEqual({ status: 200, body: { minutesLeft: 3, coins: 40, price: 30, minutes: 5, warnAtSecondsLeft: 60 } });
  expect(callClockForChild).toHaveBeenCalledWith("reina");
  expect(await call("POST", "/api/rewards/call/minute", { childId: "reina", receiptId: "call:m1" })).toEqual({ status: 200, body: { ok: true, minutesLeft: 2, coins: 40 } });
  expect(spendCallMinuteForChild).toHaveBeenCalledWith("reina", "call:m1");
  expect((await call("POST", "/api/rewards/call/minute", { childId: "reina" })).status).toBe(400);
});

it("reads her shop wallet from the server", async () => {
  expect(await call("GET", "/api/rewards/wallet/Reina")).toEqual({ status: 200, body: { coins: 40, ownedRewardIds: ["outfit:cat-ears"] } });
  expect(walletForChild).toHaveBeenCalledWith("reina");
});
