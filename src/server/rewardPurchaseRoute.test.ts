import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./currencyAward", async original => ({
  ...await original<typeof import("./currencyAward")>(),
  purchaseForChild: vi.fn(() => ({ ok: true, balance: 10, price: 30, duplicate: false })),
}));
import { purchaseForChild } from "./currencyAward";
import { setupRoutes } from "./routes";

const servers: ReturnType<ReturnType<typeof express>["listen"]>[] = [];
afterEach(() => { servers.splice(0).forEach(server => server.close()); vi.clearAllMocks(); });
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
