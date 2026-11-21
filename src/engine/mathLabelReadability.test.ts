import { afterAll, beforeAll, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { MATH_LABEL_CANVAS_PROBE, findMathLabelCollisions } from "./discoveryVisualReview";

/**
 * BUGS.md 2026-11-10 evening, Kappa Pond (unconfirmed): a parent read the pond's numbers as "1.9" and "negative".
 * Why the human caught it: he read the rendered screen; a hop label like "−3" drawn against a stone's number reads
 *   as one different number.
 * Why the logs did not: the game ran, every control worked and every answer was scored, so nothing was logged.
 * Why the lab missed it: headless verification checked that controls are visible and clickable, never that the
 *   numbers and operator labels it draws stand apart from each other.
 * The verifier now measures each number/operator label's box (page text and canvas text) and reports touching pairs.
 */
let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true, args: ["--mute-audio"] }); });
afterAll(async () => { await browser?.close(); });

async function collisions(body: string) {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  try {
    await page.addInitScript(MATH_LABEL_CANVAS_PROBE);
    // A real navigation, as the verifier does: init scripts do not run for setContent.
    await page.route("http://game.localhost/", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html><body style="margin:0;font:32px sans-serif">${body}</body></html>` }));
    await page.goto("http://game.localhost/");
    await page.waitForTimeout(100);
    return await findMathLabelCollisions(page);
  } finally { await page.close(); }
}

const stone = (left: number, text: string) => `<div style="position:absolute;left:${left}px;top:100px">${text}</div>`;

it("reports a hop label touching a stone's number", async () => {
  const found = await collisions(stone(100, "1") + stone(116, "−3"));
  expect(found.map(row => [row.a, row.b].sort())).toEqual([["1", "−3"]]);
});

it("passes labels with air between them and an ordinary inline equation", async () => {
  expect(await collisions(stone(100, "1") + stone(200, "−3") + `<p><span>7</span><span>+</span><span>6</span> = 13</p>`)).toEqual([]);
});

it("measures numbers drawn on a canvas, and ignores an outline drawn under the same label", async () => {
  const canvas = (hopX: number) => `<canvas id="c" width="400" height="200"></canvas><script>
    const ctx = document.getElementById("c").getContext("2d"); ctx.font = "32px sans-serif";
    ctx.strokeText("4", 100, 100); ctx.fillText("4", 100, 100); ctx.fillText("−3", ${hopX}, 100);
  </script>`;
  const touching = await collisions(canvas(118));
  expect(touching.map(row => [row.a, row.b].sort())).toEqual([["4", "−3"]]);
  expect(await collisions(canvas(220))).toEqual([]);
});
