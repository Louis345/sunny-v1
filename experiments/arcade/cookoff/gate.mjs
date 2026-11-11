// Cook-off quality gate: plays an entry on the real GPU (Metal), muted, with real taps. Same check for every chef.
//   node gate.mjs <url> <outDir>
import fs from "node:fs"; import path from "node:path";
import { chromium } from "../../../node_modules/playwright/index.mjs";
const log = (...a) => console.log(" 🎮 [cookoff-gate]", ...a);
export async function gate(url, out) {
  fs.mkdirSync(out, { recursive: true }); const R = { url, checks: {}, errors: [], console: [], evidence: [], shots: [] };
  const ok = (k, pass, detail) => { R.checks[k] = { pass, detail }; log(`[${pass ? "pass" : "FAIL"}]`, k, detail ?? ""); };
  const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1512, height: 860 }, deviceScaleFactor: 2 });
    page.on("pageerror", e => R.errors.push(e.message));
    page.on("console", m => { if (m.type() === "error" || m.type() === "warning") R.console.push(`${m.type()}: ${m.text()}`.slice(0, 300)); });
    page.on("requestfailed", r => R.console.push(`request failed: ${r.url()} ${r.failure()?.errorText}`.slice(0, 300)));
    page.on("response", r => { if (r.status() >= 400) R.console.push(`HTTP ${r.status()}: ${r.url()}`.slice(0, 300)); });
    await page.addInitScript(() => { window.__ev = []; addEventListener("message", e => { if (e.data?.type === "activity_evidence") window.__ev.push({ t: Math.round(performance.now()), ...e.data.payload }); }); });
    await page.goto(url, { waitUntil: "load", timeout: 60000 });
    ok("title h1", await page.evaluate(() => !!document.querySelector("h1")?.textContent.trim()), await page.evaluate(() => document.querySelector("h1")?.textContent.trim()));
    let ready = true; await page.waitForFunction(() => { const b = document.getElementById("start"); if (!b) return false; const r = b.getBoundingClientRect(), cs = getComputedStyle(b);
      let o = b, op = 1; while (o) { op *= +getComputedStyle(o).opacity; o = o.parentElement; } return r.width > 0 && cs.visibility !== "hidden" && cs.display !== "none" && op > .5 && !b.disabled; }, null, { timeout: 90000 }).catch(() => { ready = false; });
    ok("#start shown", ready); await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(out, "1-title.png") }); R.shots.push("1-title.png");
    if (!ready) return R;
    const top = await page.evaluate(() => { const b = document.getElementById("start"), r = b.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { ok: t === b || b.contains(t), top: t?.id || t?.className || t?.tagName }; });
    ok("#start on top", top.ok, top.ok ? "" : `covered by ${top.top}`);
    const b = await page.locator("#start").boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); const t0 = await page.evaluate(() => performance.now());
    const perf = await page.evaluate(async () => { const ts = []; const end = performance.now() + 10000; await new Promise(res => { const f = t => { ts.push(t); t < end ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); });
      const d = ts.slice(1).map((t, i) => t - ts[i]); const s = [...d].sort((a, b) => a - b); const c = document.querySelector("canvas");
      return { fps: Math.round(1000 * d.length / (ts.at(-1) - ts[0])), median: +s[s.length >> 1].toFixed(1), worst: Math.round(s.at(-1)), over50: d.filter(x => x > 50).length, canvas: c ? [c.width, c.height] : null }; });
    R.perf = perf;
    await page.screenshot({ path: path.join(out, "3-play-10s.png") }); R.shots.push("3-play-10s.png");
    R.evidence = await page.evaluate(() => window.__ev.map(e => ({ t: e.t, eventName: e.eventName, target: e.target })));
    const ev = n => R.evidence.find(e => e.eventName === n);
    ok("activityStarted after tap", !!ev("activity_started"));
    ok("targetPresented within 15s", !!ev("target_presented") && ev("target_presented").t - t0 < 15000, ev("target_presented") ? `${Math.round(ev("target_presented").t - t0)} ms` : "never");
    ok("smooth 55+ fps", perf.fps >= 55, `${perf.fps} fps, median ${perf.median} ms`); ok("no frame over 100 ms", perf.worst <= 100, `worst ${perf.worst} ms, ${perf.over50} frames over 50 ms`);
    ok("no page errors", R.errors.length === 0, R.errors.slice(0, 3).join(" | "));
  } finally { await browser.close(); R.pass = Object.values(R.checks).every(c => c.pass) && Object.keys(R.checks).length >= 8; fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(R, null, 2)); log(R.pass ? "[PASS]" : "[FAIL]", url); }
  return R;
}
if (import.meta.url === `file://${process.argv[1]}`) gate(process.argv[2], process.argv[3]).catch(e => { console.error(" 🎮 [cookoff-gate] [failed]", e); process.exit(1); });
