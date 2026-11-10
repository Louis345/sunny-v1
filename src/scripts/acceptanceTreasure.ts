import type { Page } from "playwright";

/** Leave a finished stop the way a child does (owner, 2026-11-07; no summary since 2026-11-10): the treasure stage
 * comes first when a chest was earned, so open and collect it; the stop then returns to the map by itself. A summary
 * only appears when the stop could not be saved, and then Back to map leaves it. */
export async function leaveStopToMap(page: Page): Promise<void> {
  await collectTreasureIfShown(page);
  const back = page.getByTestId("post-activity-engagement-overlay").getByRole("button", { name: "Back to map", exact: true });
  if (await back.isVisible().catch(() => false)) await back.click();
}

/** Finish a stop the way a child does: a chest that arrives with the result is opened and collected; there is no
 * rating any more (2026-11-10), so the stop then finishes by itself. */
export async function skipRatingAfterTreasure(page: Page): Promise<void> {
  const stage = page.getByTestId("post-activity-treasure-stage");
  // The chest can arrive a moment after the result (Discovery's comes back with the academic commit).
  await stage.waitFor({ timeout: 5000 }).catch(() => undefined);
  if (await stage.isVisible().catch(() => false)) {
    await stage.getByRole("button", { name: /tap to open/i }).click({ force: true }); // it pulses to invite a tap
    await stage.getByRole("button", { name: /^collect$/i }).click({ timeout: 6000 });
  }
}

/** After a stop finishes: open and collect the chest when one is shown. */
export async function collectTreasureIfShown(page: Page): Promise<void> {
  const stage = page.getByTestId("post-activity-treasure-stage");
  await stage.waitFor({ timeout: 5000 }).catch(() => undefined);
  if (await stage.isVisible().catch(() => false)) {
    await stage.getByRole("button", { name: /tap to open/i }).click({ force: true }); // it pulses to invite a tap
    await stage.getByRole("button", { name: /^collect$/i }).click({ timeout: 6000 });
  }
}
