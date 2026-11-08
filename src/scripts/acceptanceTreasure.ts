import type { Page } from "playwright";

/** Leave a finished stop the way a child does (owner, 2026-11-07): the treasure stage comes first when a chest was
 * earned, so open and collect it, then press Back to map on the summary. */
export async function leaveStopToMap(page: Page): Promise<void> {
  const stage = page.getByTestId("post-activity-treasure-stage");
  if (await stage.isVisible({ timeout: 4000 }).catch(() => false)) {
    await stage.getByRole("button", { name: /tap to open/i }).click();
    await stage.getByRole("button", { name: /^collect$/i }).click({ timeout: 6000 });
  }
  await page.getByTestId("post-activity-engagement-overlay").getByRole("button", { name: "Back to map", exact: true }).click();
}
