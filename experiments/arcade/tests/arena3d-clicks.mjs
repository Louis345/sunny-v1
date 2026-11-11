// Real-click lab check for Squad Gym 3D (owner bug 2026-11-10: "TAP TO WRESTLE" looped forever).
// Why the human caught it: they tapped the real button. Why the lab missed it: the lab started the game with a
// code call (__begin()) instead of a pointer click, so an invisible overlay button stealing taps never showed up.
// Invariant: every visible button must be the top element under its own center, and the whole match must be
// playable with real mouse clicks and keyboard input only.
//
//   node experiments/arcade/tests/arena3d-clicks.mjs http://localhost:6131/arena3d.html
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:6131/arena3d.html";
const log = (...a) => console.log(" 🎮 [arena3d-clicks]", ...a);
const fail = (msg) => { console.error(" 🎮 [arena3d-clicks] [FAIL]", msg); process.exitCode = 1; };

async function topIsSelf(page, id) {
  return page.evaluate((id) => {
    const el = document.getElementById(id); const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { visible: r.width > 0 && getComputedStyle(el.closest(".overlay") ?? el).opacity !== "0", top: top?.id || top?.className || top?.tagName, ok: top === el || el.contains(top) };
  }, id);
}

async function tap(page, id) { const b = await page.locator("#" + id).boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  page.on("pageerror", (e) => fail(`page error: ${e.message}`));
  await page.goto(url);
  await page.waitForFunction(() => window.__g?.state === "title", null, { timeout: 90_000 });
  log("[title] [ready]");

  for (const id of ["go"]) {
    const r = await topIsSelf(page, id); if (!r.ok) fail(`#${id} is covered by ${r.top}`); else log(`[top] #${id} ok`);
  }
  await tap(page, "go");                                       // real mouse click at the button center, like a tap
  await page.waitForFunction(() => window.__g.state === "play" && window.__crystals.length === 4, null, { timeout: 15_000 });
  log("[start] real click started the match");
  for (const id of ["padL", "padR", "padJ"]) { const r = await topIsSelf(page, id); if (!r.ok) fail(`#${id} is covered by ${r.top}`); else log(`[top] #${id} ok`); }

  // play every round with real keyboard input
  for (let guard = 0; guard < 40; guard++) {
    const s = await page.evaluate(() => ({ state: window.__g.state, round: window.__g.round }));
    if (s.state === "chest" || s.state === "win") break;
    await page.waitForFunction(() => window.__g.state === "play" && window.__crystals.length === 4 && window.__crystals.every((c) => c.rise >= 1 && !c.used), null, { timeout: 60_000 });
    const target = await page.evaluate(() => window.__crystals.find((c) => c.value === window.__tasks[window.__g.round].a).x);
    for (let i = 0; i < 6; i++) {                              // hold the arrow until she arrives (headless frames are slow)
      const x = await page.evaluate(() => window.__player.x); if (Math.abs(x - target) < .3) break;
      const key = x < target ? "ArrowRight" : "ArrowLeft"; await page.keyboard.down(key);
      await page.waitForFunction(([t, right]) => right ? window.__player.x >= t - .2 : window.__player.x <= t + .2, [target, key === "ArrowRight"], { timeout: 30_000 }).catch(() => {});
      await page.keyboard.up(key); await page.waitForFunction(() => Math.abs(window.__player.vx) < .5, null, { timeout: 10_000 }).catch(() => {});
    }
    await page.waitForTimeout(150); await page.keyboard.down("Space"); await page.waitForFunction(() => window.__player.vy < 0 || window.__g.state !== "play", null, { timeout: 15_000 }).catch(() => {}); await page.keyboard.up("Space");
    await page.waitForFunction((r) => window.__g.round !== r || ["chest", "win"].includes(window.__g.state), s.round, { timeout: 60_000 });
    log(`[round] ${s.round} done takedowns=${await page.evaluate(() => window.__g.takedowns)}`);
  }
  await page.waitForFunction(() => window.__chest()?.landed, null, { timeout: 15_000 });
  await page.keyboard.down("ArrowRight"); await page.waitForFunction(() => window.__chest().opened, null, { timeout: 60_000 }); await page.keyboard.up("ArrowRight");
  await page.waitForFunction(() => !document.getElementById("win").classList.contains("hidden"), null, { timeout: 20_000 });
  log("[win] champion screen");
  const again = await topIsSelf(page, "again"); if (!again.ok) fail(`#again is covered by ${again.top}`);
  await tap(page, "again");
  await page.waitForFunction(() => window.__g?.state === "title", null, { timeout: 90_000 });
  log("[rematch] real click restarted to the title");
  if (!process.exitCode) log("[PASS] every button works with real clicks; full match playable");
} finally { await browser.close(); }
