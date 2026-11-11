// Full playthrough of Spirit Night (Opus's Ila entry) with real taps and real key presses, on the real GPU, muted.
// Includes one deliberate "parton" miss so the hint ladder and the return-after-gap path both run.
//   node experiments/arcade/tests/spirit-night-play.mjs http://localhost:6133/entries/opus-ila/index.html
import { chromium } from "playwright";
const url = process.argv[2];
const log = (...a) => console.log(" 🎮 [spirit-night-play]", ...a);
const fail = m => { console.error(" 🎮 [spirit-night-play] [FAIL]", m); process.exitCode = 1; };
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
try {
  const page = await browser.newPage({ viewport: { width: 1512, height: 860 }, deviceScaleFactor: 1 });
  page.on("pageerror", e => fail("page error: " + e.message));
  await page.addInitScript(() => { window.__ev = []; addEventListener("message", e => { if (e.data?.type === "activity_evidence") window.__ev.push(e.data.payload); }); });
  await page.goto(url);
  await page.waitForFunction(() => window.__g?.state === "title", null, { timeout: 90000 });
  const b = await page.locator("#start").boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  let missed = false;
  for (let guard = 0; guard < 30; guard++) {
    await page.waitForFunction(() => (window.__g.state === "type" && window.__g.ready) || window.__g.state === "win", null, { timeout: 60000 });
    const s = await page.evaluate(() => ({ state: window.__g.state, word: window.__g.current?.word, given: window.__g.given, hint: window.__g.hint }));
    if (s.state === "win") break;
    if (guard === 1 && process.env.SHOT_TYPE) await page.waitForTimeout(800), await page.screenshot({ path: process.env.SHOT_TYPE });
    const answer = !missed && s.word === "pardon" ? "parton" : s.word; if (answer === "parton") missed = true;
    await page.keyboard.type(answer.slice(s.given.length), { delay: 40 }); await page.keyboard.press("Enter");
    log(`[typed] ${s.word} as ${answer} (hint ${s.hint})`);
    await page.waitForFunction(w => window.__g.current?.word !== w || !window.__g.ready || window.__g.state !== "type", s.word, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
  await page.waitForFunction(() => !document.getElementById("win").classList.contains("hidden"), null, { timeout: 60000 });
  await page.screenshot({ path: process.env.SHOT ?? "/tmp/spirit-night-win.png" });
  const ev = await page.evaluate(() => window.__ev.map(e => e.eventName));
  const counts = ev.reduce((m, n) => (m[n] = (m[n] ?? 0) + 1, m), {}); log("[evidence]", JSON.stringify(counts));
  if (!counts.activity_completed) fail("no activity_completed");
  if (!missed) fail("the deliberate miss never ran");
  const top = await page.evaluate(() => { const b = document.getElementById("again"), r = b.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return t === b || b.contains(t); });
  if (!top) fail("#again is covered");
  const a = await page.locator("#again").boundingBox(); await page.mouse.click(a.x + a.width / 2, a.y + a.height / 2);
  await page.waitForFunction(() => window.__g?.state === "title", null, { timeout: 90000 });
  if (!process.exitCode) log("[PASS] full night played with real input; hint ladder ran; AGAIN works");
} finally { await browser.close(); }
