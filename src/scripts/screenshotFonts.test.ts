import http from "node:http";
import type { AddressInfo } from "node:net";
import { chromium } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";
import { screenshotsSkipFontWait } from "./screenshotFonts";

// I3 (11/08): the spelling browser run failed twice under load at "waiting for fonts to load..." before a screenshot
// and passed alone. Playwright waits on document.fonts.ready before every screenshot, so a font that is slow (or never
// answers) stalls the shot. Why the human caught it: a red run that passed when rerun. Why the logs missed it: the
// timeout named the screenshot, not the font. Invariant: browser runs screenshot without waiting on fonts.
let server: http.Server, url = "";
beforeAll(async () => {
  server = http.createServer((request, response) => {
    if (request.url === "/never.woff2") return; // a font that never answers
    response.setHeader("content-type", "text/html");
    response.end(`<style>@font-face{font-family:Never;src:url(/never.woff2)}body{font-family:Never}</style><p>night</p>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});
afterAll(() => { server.closeAllConnections(); server.close(); });

it("a screenshot does not wait on a font that never loads", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await expect(page.screenshot({ timeout: 1500 })).rejects.toThrow(/Timeout/);
    screenshotsSkipFontWait();
    expect((await page.screenshot({ timeout: 5000 })).length).toBeGreaterThan(0);
  } finally { await browser.close(); }
}, 30000);
