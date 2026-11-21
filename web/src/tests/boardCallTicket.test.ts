import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

// 2026-11-09 Reina (human-caught): her board's last chest granted a 2-minute call and the server saved the ticket,
// but she left the chest popup and the map showed no Call button. The map read the companion data loaded when the
// session began, before the ticket existed; Ila only got hers by tapping Call on the popup. Logs showed the grant
// and no ticket-opened; the lab tested the popup path only. The map now also uses the ticket the server returned.
it("offers the call on the map from the ticket the server just returned, even when the session's data predates it", async () => {
  const { boardCallTicket } = await import("../utils/callCompanion");
  const fresh = { homeworkId: "hw-math", earnedAt: "2026-11-09T22:29:27.064Z" };
  expect(boardCallTicket([], fresh, "hw-math", "2026-11-09T03:03:56.024Z")).toEqual(fresh);
  expect(boardCallTicket(undefined, fresh, "hw-math", null)).toEqual(fresh);
  // A ticket for another homework, or from before this board, is not offered.
  expect(boardCallTicket([], { ...fresh, homeworkId: "hw-other" }, "hw-math", null)).toBeUndefined();
  expect(boardCallTicket([], { ...fresh, earnedAt: "2026-11-08T00:00:00.000Z" }, "hw-math", "2026-11-09T03:03:56.024Z")).toBeUndefined();
  // An opened saved ticket stays closed.
  expect(boardCallTicket([{ ...fresh, openedAt: "2026-11-09T22:40:00.000Z" }], undefined, "hw-math", null)).toBeUndefined();
  const app = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf8");
  expect(app).toContain("serverTicket={lastServerCallTicket}");
});
