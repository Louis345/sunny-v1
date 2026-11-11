// Cook-off chef run: one model builds one child's game from the same inputs, then gets the gate report back for up to 2 fix rounds.
//   node runChef.mjs <child> <model> <entryId>      (env: ANTHROPIC_API_KEY, ELEVENLABS_API_KEY, COOK_ROOT, COOK_CTX, COOK_URL, COOK_CAP)
import fs from "node:fs"; import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { renderAssets } from "./assets.mjs"; import { gate } from "./gate.mjs";

const [child, model, entryId] = process.argv.slice(2);
const ROOT = process.env.COOK_ROOT, URL0 = process.env.COOK_URL ?? "http://localhost:6133", CTX = process.env.COOK_CTX, WT = "/Users/jamaltaylor/Development/sunny-retro-platformer";
const PRICE = { "claude-fable-5-2": [8, 40], "claude-opus-5-5": [5, 25] }[model] ?? [8, 40]; const CAP = +(process.env.COOK_CAP ?? 20);
const log = (...a) => console.log(` 🎮 [cookoff-chef] [${entryId}]`, ...a);
const read = p => fs.readFileSync(p, "utf8");

const prompt = [read(`${WT}/docs/cookoff/chef-ticket.md`), read(`${WT}/docs/cookoff/kit.md`), read(`${WT}/docs/cookoff/brief-${child}.md`),
  `# ${child}'s soul.md (verbatim)\n\n` + read(path.join(CTX, child, "soul.md")),
  `# Planner target (verbatim from her current homework cycle; opaque ids of already-seen items removed. Treat every sentence or context she has already seen as used, and author fresh ones)\n\n` + read(path.join(ROOT, "inputs", `${child}-planner.txt`)),
  `# Your task\n\nBuild the game for ${child}. Return ONLY the complete HTML file: start with the <!-- DESIGN CARD --> comment and end with </html>. No commentary before or after.`].join("\n\n---\n\n");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY.trim() }); let spent = 0;
async function call(messages) {
  const t0 = Date.now(); const stream = client.messages.stream({ model, max_tokens: 100000, thinking: { type: "adaptive" }, messages });
  const msg = await stream.finalMessage(); const u = msg.usage;
  const cost = (u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)) / 1e6 * PRICE[0] + u.output_tokens / 1e6 * PRICE[1];
  spent += cost; log("[call]", `in=${u.input_tokens} out=${u.output_tokens} stop=${msg.stop_reason} $${cost.toFixed(2)} total=$${spent.toFixed(2)} ${Math.round((Date.now() - t0) / 1000)}s`);
  return msg;
}
const textOf = m => m.content.filter(b => b.type === "text").map(b => b.text).join("");
const htmlOf = t => { const s = t.indexOf("<!--"), e = t.lastIndexOf("</html>"); return s >= 0 && e > s ? t.slice(s, e + 7) : null; };

async function main() {
  const dir = path.join(ROOT, "entries", entryId); fs.mkdirSync(dir, { recursive: true });
  const messages = [{ role: "user", content: prompt }]; fs.writeFileSync(path.join(dir, "prompt.md"), prompt);
  for (let round = 0; round <= 2; round++) {
    if (spent >= CAP) { log("[cap] [stop]", `$${spent.toFixed(2)} >= $${CAP}`); break; }
    const msg = await call(messages); messages.push({ role: "assistant", content: msg.content });
    const html = htmlOf(textOf(msg));
    if (!html) {
      if (round > 0 && /NO_CHANGES/.test(textOf(msg))) { log("[round]", round, "chef kept the previous build"); break; }
      log("[no-html]", textOf(msg).slice(0, 300)); if (round === 2) break;
      messages.push({ role: "user", content: "Your reply did not contain a complete HTML file (from <!-- DESIGN CARD to </html>). Return the complete file only." }); continue;
    }
    fs.writeFileSync(path.join(dir, "index.html"), html); fs.writeFileSync(path.join(dir, `round-${round}.html`), html); log("[saved]", `round=${round} chars=${html.length}`);
    const assets = await renderAssets(dir, child);
    const rep = await gate(`${URL0}/entries/${entryId}/index.html`, path.join(dir, `gate-${round}`));
    fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify({ entryId, child, model, rounds: round + 1, spent: +spent.toFixed(2), pass: rep.pass, checks: rep.checks, perf: rep.perf }, null, 2));
    if (round === 2) break;
    const imgs = rep.shots.map(f => ({ type: "image", source: { type: "base64", media_type: "image/png", data: fs.readFileSync(path.join(dir, `gate-${round}`, f)).toString("base64") } }));
    const report = { pass: rep.pass, checks: rep.checks, perf: rep.perf, pageErrors: rep.errors.slice(0, 10), consoleAndNetwork: rep.console.slice(0, 25), evidenceSeen: rep.evidence.slice(0, 15), assets };
    messages.push({ role: "user", content: [...imgs, { type: "text", text: `Fix round ${round + 1} of 2. The automatic quality check played your build on the kiosk GPU. Report:\n\n${JSON.stringify(report, null, 1)}\n\nThe screenshots are the title screen and 10 seconds after the start tap. Improve anything you want (failures first, then anything that would make her love it more), and return the complete revised HTML file only. If you would not change anything, reply with exactly NO_CHANGES.` }] });
  }
  log("[done]", `spent=$${spent.toFixed(2)}`);
}
main().catch(e => { console.error(` 🎮 [cookoff-chef] [${entryId}] [failed]`, e); process.exit(1); });
