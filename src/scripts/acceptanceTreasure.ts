import type { Page } from "playwright";

/** Leave a finished stop the way a child does (owner, 2026-11-07): the treasure stage comes first when a chest was
 * earned, so open and collect it, then press Back to map on the summary. */
export async function leaveStopToMap(page: Page): Promise<void> {
  await collectTreasureIfShown(page);
  await page.getByTestId("post-activity-engagement-overlay").getByRole("button", { name: "Back to map", exact: true }).click();
}

/** Rate a finished stop the way a child does: a chest that arrives with the result is opened and collected first
 * (Discovery's chest comes back with the academic commit, a moment after the summary), then Skip on the rating. */
export async function skipRatingAfterTreasure(page: Page): Promise<void> {
  const stage = page.getByTestId("post-activity-treasure-stage");
  const skip = page.getByRole("button", { name: "Skip fun rating" });
  await stage.or(skip).first().waitFor({ timeout: 20000 });
  // The chest can replace the summary just after it renders; give it a moment to arrive.
  if (!(await stage.isVisible().catch(() => false))) await stage.waitFor({ timeout: 3000 }).catch(() => undefined);
  if (await stage.isVisible().catch(() => false)) {
    await stage.getByRole("button", { name: /tap to open/i }).click({ force: true }); // it pulses to invite a tap
    await stage.getByRole("button", { name: /^collect$/i }).click({ timeout: 6000 });
  }
  await skip.click();
}

/** After a stop finishes: open and collect the chest when one is shown, so the summary's buttons appear. */
export async function collectTreasureIfShown(page: Page): Promise<void> {
  const stage = page.getByTestId("post-activity-treasure-stage");
  const summary = page.getByTestId("post-activity-engagement-overlay");
  await stage.or(summary).first().waitFor({ timeout: 30000 });
  if (!(await stage.isVisible().catch(() => false))) await stage.waitFor({ timeout: 3000 }).catch(() => undefined);
  if (await stage.isVisible().catch(() => false)) {
    await stage.getByRole("button", { name: /tap to open/i }).click({ force: true }); // it pulses to invite a tap
    await stage.getByRole("button", { name: /^collect$/i }).click({ timeout: 6000 });
  }
}
