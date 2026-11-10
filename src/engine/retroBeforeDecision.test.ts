import { expect, it } from "vitest";
import { retroThenDecide } from "./retroBeforeDecision";

// 2026-11-10, both audits: the next board was decided the moment she finished a board, before that session's retro
// existed, so the Planner judged a board without the retro of the session she played it in (question frozen 16:19,
// retro written 16:22). The retro of the session so far is now written first, then the Planner decides.
it("writes the retro of the session so far before the Planner decides, and decides even if the retro fails", async () => {
  const order: string[] = [];
  await retroThenDecide({ sessionDir: "/s", writeRetro: async () => { order.push("retro"); return "/r.md"; }, decide: async () => { order.push("decide"); return "ok"; } });
  expect(order).toEqual(["retro", "decide"]);
  order.length = 0;
  await retroThenDecide({ sessionDir: "/s", writeRetro: async () => { order.push("retro"); throw new Error("provider down"); }, decide: async () => { order.push("decide"); return "ok"; } });
  expect(order).toEqual(["retro", "decide"]);
  order.length = 0;
  await retroThenDecide({ sessionDir: undefined, writeRetro: async () => { order.push("retro"); return undefined; }, decide: async () => { order.push("decide"); return "ok"; } });
  expect(order).toEqual(["decide"]);
});
