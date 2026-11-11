// "Hey Elli" end to end on the real GPU, muted: a recorded question is fed in as the microphone, and we check that
// the wake word is heard, the companion turns and answers in her voice, the game keeps 55+ fps while she talks,
// the answer counts as help (not "on her own"), and tap-to-talk works too.
//   node experiments/arcade/tests/talk-play.mjs <game url> <question.wav> [screenshot dir]
// env: EXPECT (word the heard question must contain, default "picture"), PLAY (the game's playing state: "type" for Spirit Night, "play" for Squad Gym)
import { chromium } from "playwright";
const [url, wav, shots = "/tmp"] = process.argv.slice(2);
const log = (...a) => console.log(" 🎮 [talk-play]", ...a);
const EXPECT = new RegExp(process.env.EXPECT ?? "picture", "i"), PLAY = process.env.PLAY ?? "type";
const fail = m => { console.error(" 🎮 [talk-play] [FAIL]", m); process.exitCode = 1; };
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required", "--mute-audio",
  "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}%noloop`] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1512, height: 860 }, deviceScaleFactor: 1 });
  await ctx.grantPermissions(["microphone"], { origin: new URL(url).origin });
  const page = await ctx.newPage(); const lines = [];
  page.on("pageerror", e => fail("page error: " + e.message));
  page.on("console", m => { const t = m.text(); if (t.includes("companion-talk") || t.includes("[talk]")) { lines.push(t); log("[page]", t.trim()); } });
  await page.addInitScript(() => { window.__ev = []; addEventListener("message", e => { if (e.data?.type === "activity_evidence") window.__ev.push(e.data.payload); }); });
  await page.goto(url);
  await page.waitForFunction(() => window.__g?.state === "title", null, { timeout: 90000 });
  const b = await page.locator("#start").boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);

  // 1) voice: the recorded "Hey Elli, what does this picture mean?" starts ~9 s after PLAY
  await page.waitForFunction(() => window.__g.talk === "listening", null, { timeout: 30000 }).then(() => log("[wake] heard her name"), () => fail("never woke on 'Hey Elli'"));
  await page.waitForFunction(() => window.__g.talk === "speaking", null, { timeout: 30000 }).then(() => log("[answer] speaking"), () => fail("never answered"));
  const fps = await page.evaluate(() => new Promise(res => { const ts = []; const f = t => { ts.push(t); if (ts.length < 120) requestAnimationFrame(f); else { const d = ts.slice(1).map((x, i) => x - ts[i]); res({ fps: Math.round(1000 / (d.reduce((a, b) => a + b) / d.length)), worst: Math.round(Math.max(...d)) }); } }; requestAnimationFrame(f); }));
  log("[fps while talking]", JSON.stringify(fps)); if (fps.fps < 55 || fps.worst > 100) fail("not smooth while she talks");
  await page.screenshot({ path: `${shots}/talk-speaking.png` });
  const asked = lines.find(l => l.includes("[ask]")) ?? ""; if (!EXPECT.test(asked)) fail("question not heard right: " + asked);
  if (/\bhey\b|elli|matilda/i.test(asked.split("[ask]")[1] ?? "")) fail("her name leaked into the question: " + asked);
  await page.waitForFunction(() => window.__g.talk !== "speaking", null, { timeout: 30000 });

  // 2) the game carries on after she answers
  await page.waitForFunction(s => window.__g.state === s && (s !== "type" || window.__g.ready), PLAY, { timeout: 60000 }).then(() => log("[game] continued to typing"), () => fail("game stalled after the answer"));

  // 3) tap her, then ask (the tap path needs no name); help on this word must not count as "on her own"
  await page.waitForTimeout(7500);   // let the follow-up window close
  const hit = await page.evaluate(() => { const g = window.__g; return g.talk; }); if (hit) log("[note] still in talk state", hit);
  const pos = await page.evaluate(() => { const v = window.__vrm, c = window.__cam; if (v && c) { const h = v.humanoid.getNormalizedBoneNode("chest").getWorldPosition(new c.position.constructor()).project(c); return { x: (h.x + 1) / 2 * innerWidth, y: (1 - h.y) / 2 * innerHeight }; } return { x: innerWidth * .25, y: innerHeight * .45 }; });
  let woke = false;
  for (const dx of [0, -40, 40, -80, 80]) { await page.mouse.click(pos.x + dx, pos.y); await page.waitForTimeout(150); if (await page.evaluate(() => window.__talk.awake)) { woke = true; break; } }
  if (!woke) fail("tap on Elli did not wake her"); else log("[tap] woke");
  await page.evaluate(() => window.__talk.ask("how do I spell this"));
  await page.waitForFunction(() => window.__g.talkHelped === true, null, { timeout: 30000 }).then(() => log("[honesty] help recorded for this word"), () => fail("help from Elli not recorded"));
  await page.screenshot({ path: `${shots}/talk-tap.png` });
  if (!process.exitCode) log("[PASS] voice wake, answer in her voice, smooth, game continues, tap works, help is honest");
} finally { await browser.close(); }
