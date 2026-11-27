/**
 * The "after" check (owner, 2026-11-26): unseen problems, no pictures, no help, written and scored by code so no tutor can
 * teach to it. Items avoid every number that appears in that child's probe and lessons, and Reina's graded quiz numbers never
 * reach Ila (never teach the test). Elli reads each problem aloud and reacts the same to right and wrong (quiet lesson).
 * The item mix and the pass line are fixed here, before either child plays.
 *
 *   DOTENV_CONFIG_PATH=~/Development/sunny/.env npx tsx experiments/elli-classroom/make-recheck.ts
 */
import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(DIR, "out");
const log = (action: string, result: string) => console.log(` 🎮 [recheck] [${action}] [${result}]`);
const MAX_SEARCH = 5000;

/** Small seeded generator so the same items come out every run. */
function rng(seed: number): () => number { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 2 ** 32; }; }

/** Every number used anywhere in these files (probes, lessons): the re-check never reuses one. */
function usedNumbers(files: string[]): Set<number> {
  const used = new Set<number>();
  for (const file of files) { if (!fs.existsSync(file)) { log("exclude", `missing ${path.relative(DIR, file)}`); continue; }
    const raw = fs.readFileSync(file, "utf8");
    // only what she sees and hears: a lesson's steps, or a story page's ITEMS (not voice file names or drawing code)
    const text = file.endsWith(".json") ? JSON.stringify(JSON.parse(raw).steps) : (raw.match(/ITEMS\s*=\s*\[[\s\S]*?\];/)?.[0] ?? raw);
    for (const m of text.matchAll(/\d+/g)) used.add(Number(m[0])); }
  return used;
}
const lessonFiles = (prefixes: string[]) => fs.readdirSync(OUT, { withFileTypes: true })
  .filter(d => d.isDirectory() && !d.name.endsWith("-recheck") && prefixes.some(p => d.name.startsWith(p)))
  .flatMap(d => /^v\d+$/.test(d.name) ? [path.join(OUT, d.name, "lesson.json")]   // Ila's first lessons live at out/v1..v4
    : fs.readdirSync(path.join(OUT, d.name)).filter(v => /^v\d+$/.test(v)).map(v => path.join(OUT, d.name, v, "lesson.json")));

type Item = { kind: string; say: string; board: string; answer: number };
function pick(rand: () => number, ok: (n: number) => boolean, lo: number, hi: number, used: Set<number>): number {
  for (let tries = 0; tries < MAX_SEARCH; tries += 1) { const n = lo + Math.floor(rand() * (hi - lo + 1)); if (ok(n) && !used.has(n)) { used.add(n); return n; } }
  throw new Error(`recheck_no_number_${lo}_${hi}`);
}
const roundTo = (n: number, unit: number) => Math.floor(n / unit + 0.5) * unit;

function ilaItems(used: Set<number>): Item[] {
  const r = rng(20261128), ten = (n: number): Item => ({ kind: "nearest ten", say: `Round ${n} to the nearest ten.`, board: String(n), answer: roundTo(n, 10) });
  const hun = (n: number, kind: string): Item => ({ kind, say: `Round ${n} to the nearest hundred.`, board: String(n), answer: roundTo(n, 100) });
  const items = [
    ten(pick(r, n => n % 10 > 0 && n % 10 < 5, 11, 94, used)), ten(pick(r, n => n % 10 > 5, 11, 94, used)),
    ten(pick(r, n => n % 10 === 5, 11, 94, used)), ten(pick(r, n => n % 10 > 5, 11, 94, used)),
    ten(pick(r, n => n % 10 > 0 && n % 10 < 5, 101, 989, used)), ten(pick(r, n => n % 10 > 5, 101, 989, used)),
    hun(pick(r, n => Math.floor(n / 10) % 10 < 5 && n % 10 >= 5, 101, 989, used), "nearest hundred: tens say down, ones say up"),
    hun(pick(r, n => Math.floor(n / 10) % 10 >= 5 && n % 10 < 5 && Math.floor(n / 10) % 10 !== 5, 101, 949, used), "nearest hundred: tens say up, ones say down"),
    hun(pick(r, n => Math.floor(n / 10) % 10 === 5, 101, 989, used), "nearest hundred: tens digit is 5"),
    hun(pick(r, n => Math.floor(n / 10) % 10 > 5, 101, 949, used), "nearest hundred"),
  ];
  return items.sort(() => r() - .5);
}

/** Facts (total with its two partners) she has already seen as an equation: in her probe, lessons or history. */
function seenFacts(texts: string[]): Set<number> {
  const seen = new Set<number>();
  for (const t of texts) for (const m of t.matchAll(/(\d+|\?|box)\s*÷\s*(\d+|\?|box)\s*=\s*(\d+|\?|box)/gi)) {
    const [a, b, c] = [m[1], m[2], m[3]].map(x => /^\d+$/.test(x) ? Number(x) : NaN);
    const total = !isNaN(a) ? a : b * c; if (!isNaN(total)) seen.add(total * 100 + Math.min(isNaN(b) ? total / c : b, isNaN(c) ? total / b : c));
  }
  return seen;
}

function reinaItems(seen: Set<number>): Item[] {
  const r = rng(20261129), facts: Array<[number, number]> = [];
  for (const a of [6, 7, 8, 9]) for (const b of [3, 4, 5, 6, 7, 8, 9]) if (a !== b || a > 5) facts.push([a, b]);
  const taken = new Set<number>();
const fact = (): [number, number] => { for (let t = 0; t < MAX_SEARCH; t += 1) { const f = facts[Math.floor(r() * facts.length)];
    const id = f[0] * f[1] * 100 + Math.min(f[0], f[1]);
    if (!seen.has(id) && !taken.has(f[0] * f[1])) { taken.add(f[0] * f[1]); return r() < .5 ? f : [f[1], f[0]]; } } throw new Error("recheck_no_fact"); };
  const total = (): Item => { const [g, e] = fact(); return { kind: "box is the total", say: `What number goes in the box? Box, divided by ${g}, equals ${e}.`, board: `? ÷ ${g} = ${e}`, answer: g * e }; };
  const groups = (): Item => { const [g, e] = fact(); return { kind: "box is the divisor", say: `What number goes in the box? ${g * e}, divided by box, equals ${e}.`, board: `${g * e} ÷ ? = ${e}`, answer: g }; };
  const quotient = (): Item => { const [g, e] = fact(); return { kind: "box is the answer", say: `What number goes in the box? ${g * e}, divided by ${g}, equals box.`, board: `${g * e} ÷ ${g} = ?`, answer: e }; };
  const story = (thing: string, holder: string): Item => { const [g, e] = fact();
    return { kind: "word problem: how many groups", say: `There are ${g * e} ${thing}. Each ${holder} holds ${e}. How many ${holder}s?`, board: `${g * e}`, answer: g }; };
  return [total(), total(), total(), groups(), groups(), groups(), quotient(), quotient(), story("cookies", "box"), story("crayons", "cup")].sort(() => r() - .5);
}

/** A board piece that only writes the problem big on the board (no picture). */
const SHOW = "g.fillStyle='#fdfaf0';g.textAlign='center';g.textBaseline='middle';g.font='700 '+(String(s.text).length>6?170:230)+'px Fredoka, system-ui';g.globalAlpha=Math.min(1,k*3);g.fillText(String(s.text),W/2,H/2);";

async function voice(dir: string, text: string): Promise<string | null> {
  const name = `${crypto.createHash("sha1").update(text).digest("hex").slice(0, 12)}.mp3`, file = path.join(dir, name);
  if (!fs.existsSync(file)) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID_ILA}?output_format=mp3_44100_128`, { method: "POST",
      headers: { "xi-api-key": String(process.env.ELEVENLABS_API_KEY), "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }) });
    if (!res.ok) { log("voice", `failed status=${res.status}`); return null; }
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return `../voice/${name}`;
}

async function build(child: string, folder: string, items: Item[], passLine: string, finale?: string): Promise<void> {
  const dir = path.join(OUT, folder), vdir = path.join(OUT, folder, "voice"); fs.mkdirSync(path.join(dir, "v1"), { recursive: true }); fs.mkdirSync(vdir, { recursive: true });
  const steps: unknown[][] = [["gesture", "wave"], ["say", `Hi ${child}! Quick check-in. Just you this time.`, "warm"], ["say", "Take your time. I'll just listen.", "gentle"]];
  items.forEach((it, i) => { steps.push(["showPiece", "show", { text: it.board }], ["askNumber", `${it.say} Ready? Go!`, it.answer]);
    if (i === 4) steps.push(["say", "Halfway! You're doing great.", "happy"], ["gesture", "silly_dancing"]); });
  steps.push(["clearBoard"], ["say", `All done, ${child}! Thank you!`, "excited"], ["celebrate"]);
  const clips: Record<string, string> = {};
  if (finale && fs.existsSync(path.join(OUT, finale))) { const name = path.basename(finale); fs.mkdirSync(path.join(dir, "clips"), { recursive: true });
    fs.copyFileSync(path.join(OUT, finale), path.join(dir, "clips", name)); clips.reward = `../clips/${name}`; steps.splice(steps.length - 1, 0, ["playClip", "reward"]); }
  const texts = steps.flatMap(([n, ...a]) => n === "say" || n === "askNumber" ? [String(a[0])] : []);
  const voices: Record<string, string> = {};
  for (const t of texts) { const f = await voice(vdir, t); if (f) voices[t] = f; } // one at a time
  fs.writeFileSync(path.join(dir, "v1", "lesson.json"), JSON.stringify({ quiet: true, steps, voice: voices, clips, pieces: { show: SHOW } }, null, 2));
  fs.writeFileSync(path.join(dir, "key.md"), [`# ${child}: the after-check (code-written, fixed before she plays)`, "", `Pass line: ${passLine}`, "",
    "| # | What it checks | Problem | Right answer |", "|---|---|---|---|", ...items.map((it, i) => `| ${i + 1} | ${it.kind} | ${it.board} | ${it.answer} |`)].join("\n"));
  log("built", `${folder} items=${items.length} voiced=${Object.keys(voices).length}/${texts.length} reward=${clips.reward ? "clip" : "confetti"}`);
}

/** The pass line and the baseline behind it live with the child's evidence (out of git). */
const passLine = (child: string) => fs.readFileSync(path.join(DIR, "evidence", child, "pass-line.txt"), "utf8").trim();

async function main(): Promise<void> {
  const ilaUsed = usedNumbers([...lessonFiles(["v", "ila-"]), path.join(DIR, "..", "rounding-story-check", "out", "v2", "index.html")]);
  for (const m of fs.readFileSync(path.join(DIR, "evidence", "ila", "rounding-answers.json"), "utf8").matchAll(/\d+/g)) ilaUsed.add(Number(m[0])); // seen before
  const quiz = path.join(DIR, "evidence", "reina", "graded-quiz-numbers.txt"); // Reina's graded quiz: never in Ila's check (never teach the test)
  if (fs.existsSync(quiz)) for (const m of fs.readFileSync(quiz, "utf8").matchAll(/\d+/g)) ilaUsed.add(Number(m[0])); else log("exclude", "missing reina graded quiz numbers");
  const reinaSeen = seenFacts([...lessonFiles(["reina-"]).filter(f => fs.existsSync(f)).map(f => JSON.stringify(JSON.parse(fs.readFileSync(f, "utf8")).steps)),
    fs.readFileSync(path.join(DIR, "evidence", "reina", "division-answers.txt"), "utf8")]); // equations she has seen before
  log("exclude", `ila=${ilaUsed.size} numbers reina=${reinaSeen.size} facts`);
  const only = process.argv.slice(2);
  if (!only.length || only.includes("ila")) await build("Ila", "ila-recheck", ilaItems(ilaUsed), passLine("ila"),
    "ila-rounding-interests/clips/clip-37b1cdd1387f.mp4");
  if (!only.length || only.includes("reina")) await build("Reina", "reina-recheck", reinaItems(reinaSeen), passLine("reina"),
    "reina-division-acting/clips/clip-6010b2018acf.mp4");
}

main().catch(error => { console.error(" 🎮 [recheck] [run] [failed]", error); process.exitCode = 1; });
