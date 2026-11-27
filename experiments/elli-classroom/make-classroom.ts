/**
 * Elli's Classroom lesson maker for any child and any concept (owner, 2026-11-26). The tutor (Opus) gets the child's
 * evidence and the concept a human named, and writes a lesson with the Classroom kit, plus any board pieces it draws
 * itself when the kit can't show the idea. The lesson is played headless; a critic from a different model (Sonnet 5.5)
 * sees screenshots of every question plus the run's errors, never the tutor's reasoning; the tutor revises once.
 * Code only renders (voice, clips, the lesson file) and measures. Lab only; evidence/ and out/ stay out of git.
 *
 *   DOTENV_CONFIG_PATH=~/Development/sunny/.env npx tsx experiments/elli-classroom/make-classroom.ts \
 *     --child Reina --evidence evidence/reina --concept "division ..." --out out/reina-division
 * Needs the Classroom served at http://localhost:8765 (python3 -m http.server 8765 from the repo root).
 */
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); const v = i > 0 ? process.argv[i + 1] : undefined; if (!v) throw new Error(`missing --${name}`); return v; };
const TASK = process.argv.includes("--task") ? arg("task") : "teach";
const CHILD = arg("child"), CONCEPT = arg("concept"), EVIDENCE = path.resolve(DIR, arg("evidence")), OUT = path.resolve(DIR, arg("out"));
const CLASSROOM_URL = "http://localhost:8765/experiments/elli-classroom/";
const TUTOR = "claude-opus-5-5", CRITIC = "claude-sonnet-5-5";
const PRICE: Record<string, [number, number]> = { [TUTOR]: [5, 25], [CRITIC]: [2, 10] }; // $ per million tokens in/out
const CLIP_COST = 0.35, BUDGET = 3, MAX_STEPS = 160, MAX_CLIPS = 2, MAX_PIECES = 4, MAX_POLLS = 40, MAX_SHOTS = 16, MAX_TICKS = 400;
const log = (action: string, result: string) => console.log(` 🎮 [classroom] [${action}] [${result}]`);
const read = (file: string) => fs.readFileSync(file, "utf8");
const client = new Anthropic();
const spend = { models: 0, clips: 0 };
const spent = () => spend.models + spend.clips;

const TOOLS_DOC = `The Classroom: a warm 3D classroom on the kiosk (1280x800, the child taps with a finger). Elli (the companion, a 3D
anime girl) stands by a big chalkboard and teaches. A lesson is a list of steps; each step is [toolName, ...args] and runs
when the one before finishes. Elli turns and points at the board while it changes, looks at the child when she talks or
asks, and her face shows the feeling you give each line.

The kit (ready-made board pictures):
- ["showPlaceValue", n, focus?]: the whole board becomes columns, one per digit (100s, 10s, 1s), each with its digit and
  base-ten blocks. focus 100, 10 or 1 makes that column glow. Same n again only moves the glow.
- ["drawNumberLine", from, to]: a chalk number line. Ticks every 1 for spans up to 20, else every 10.
- ["placeHouse", n]: a house on the line at n (max two houses). ["placeNumber", n]: a number buddy dropped on the line at n.
- ["showTens", n]: the buddy's lead digit grows and a dotted line ties it to the lower house.
- ["markHalfway", a, b]: a yellow flag at the middle of the two houses, labelled with its number.
- ["countSteps", n, target]: chalk hops from n to target, counted on the board. ["showCloser", n]: the house fewer hops away lights up.
- ["walkTo", n, target]: the buddy hops to target and its digits flip to the target's number.
- ["clearBoard"]: wipe the board.

Your own board pieces (when the kit can't show the idea):
- In "pieces" you may write up to ${MAX_PIECES} pieces. Each is the body of a JavaScript function (g, W, H, k, s, t) that
  draws one frame on the chalkboard canvas: g is its CanvasRenderingContext2D, W=2048 and H=1024 its size (dark green
  chalkboard already painted), k seconds since this state was shown (animate with it), s the state object you pass, t total
  seconds. It runs every frame, so draw everything each time and keep it fast. Fonts: "700 80px Fredoka, system-ui".
  No words on the board; numbers and pictures are fine.
- ["showPiece", id, state]: the piece takes the whole board and draws from state. Call it again with a new state to change
  what it shows. state.point = [x, y] (board pixels) is where Elli points.

Elli and the child:
- ["say", text, feeling?]: Elli says one short line (speech bubble, in her voice). feeling is one of warm, happy, excited,
  proud, surprised, thinking, curious, gentle, sad, neutral.
- ["ask", text, [choices], answer, {"right": [steps], "wrong": [steps]}]: Elli asks; the child taps one of 2 to 4 big
  cards. A number matching a house on the board shows as that house; other choices show as a big number or a short word.
  answer null = no right answer (you want to hear what she thinks). The optional last object holds the steps after a right
  or a wrong tap (up to 3 levels deep); with answer null the "right" steps run.
- ["askNumber", text, answer, {"right": [steps], "wrong": [steps]}]: Elli asks; the child types a number on a number pad
  and taps ✓. answer null = no right answer. Same optional branches.
  The answers appear only after Elli has finished asking. If the child is still thinking after 10 s, Elli leans in with a
  warm face and no words.
- ["playClip", id]: one of your video clips plays full screen (about 6 s, no sound of its own).
- ["celebrate"]: confetti and Elli's victory dance. ["gesture", name]: wave, surprise_jump, ponder_moment, dance_victory, silly_dancing.

Every answer is recorded (question, what she tapped or typed, right or not, seconds taken) for her parents and for you to
read next time. Up to ${MAX_CLIPS} Grok Imagine video clips (about 6 s, 16:9, no text): give an image prompt (first frame) and a
motion prompt.`;

const evidence = fs.readdirSync(EVIDENCE).filter(f => /\.(md|txt|json)$/.test(f)).sort()
  .map(f => `[${CHILD}'s evidence: ${f}]\n${read(path.join(EVIDENCE, f))}`).join("\n\n");

const LESSON_TOOL: Anthropic.Tool = {
  name: "make_lesson",
  description: "Your lesson in the Classroom, with what you are testing.",
  input_schema: { type: "object", additionalProperties: false, required: ["she_lacks", "i_will_try", "i_will_know_if", "steps", "pieces", "clips", "then", "wished_tools"],
    properties: {
      she_lacks: { type: "string", description: "What you think she is missing, from her evidence." },
      i_will_try: { type: "string", description: "What this lesson does about it, and why for her." },
      i_will_know_if: { type: "string", description: "What her recorded answers would show if it worked." },
      steps: { type: "array", maxItems: MAX_STEPS, items: { type: "array" }, description: "The lesson: [toolName, ...args] steps." },
      pieces: { type: "array", maxItems: MAX_PIECES, items: { type: "object", additionalProperties: false, required: ["id", "why", "code"],
        properties: { id: { type: "string" }, why: { type: "string", description: "Why the kit could not show this." }, code: { type: "string" } } } },
      clips: { type: "array", maxItems: MAX_CLIPS, items: { type: "object", additionalProperties: false, required: ["id", "image_prompt", "motion_prompt"],
        properties: { id: { type: "string" }, image_prompt: { type: "string" }, motion_prompt: { type: "string" } } } },
      then: { type: "string", description: "What comes after this lesson: the challenge and the later-day check you would give her." },
      wished_tools: { type: "array", items: { type: "string" }, description: "Tools you wanted and the Classroom lacks, if any." },
    } },
};
type Clip = { id: string; image_prompt: string; motion_prompt: string };
type Piece = { id: string; why: string; code: string };
type Lesson = { she_lacks: string; i_will_try: string; i_will_know_if: string; steps: unknown[][]; pieces: Piece[]; clips: Clip[]; then: string; wished_tools: string[] };

const CRITIQUE_TOOL: Anthropic.Tool = {
  name: "critique",
  description: "Your review of the lesson against its own goal.",
  input_schema: { type: "object", additionalProperties: false, required: ["does_it_do_its_goal", "gaps", "keep"],
    properties: {
      does_it_do_its_goal: { type: "string", enum: ["yes", "partly", "no"] },
      gaps: { type: "array", items: { type: "string" }, description: "What is missing or wrong, most important first." },
      keep: { type: "array", items: { type: "string" }, description: "What works and must stay." },
    } },
};
type Critique = { does_it_do_its_goal: string; gaps: string[]; keep: string[] };

async function ask<T>(stage: string, model: string, content: Anthropic.MessageParam["content"], tool: Anthropic.Tool): Promise<T> {
  const file = path.join(OUT, `${stage}.json`);
  if (fs.existsSync(file)) { log(stage, "reused"); return JSON.parse(read(file)) as T; }
  const message = await client.messages.stream({ model, max_tokens: 64000, thinking: { type: "adaptive" }, tools: [tool],
    messages: [{ role: "user", content }] }).finalMessage();
  const [pin, pout] = PRICE[model]; const cost = (message.usage.input_tokens * pin + message.usage.output_tokens * pout) / 1e6; spend.models += cost;
  const block = message.content.find((row): row is Anthropic.ToolUseBlock => row.type === "tool_use" && row.name === tool.name);
  log(stage, `received model=${model} stop=${message.stop_reason} in=${message.usage.input_tokens} out=${message.usage.output_tokens} cost=$${cost.toFixed(2)}`);
  if (!block) throw new Error(`classroom_${stage}_missing:${message.stop_reason}`);
  fs.writeFileSync(file, JSON.stringify(block.input, null, 2));
  return block.input as T;
}

/** The lesson as a person would watch it. */
function watch(steps: unknown[][], depth = 0): string[] {
  const pad = "  ".repeat(depth);
  return steps.flatMap(([name, ...args]) => {
    if (name === "say") return [`${pad}Elli says${args[1] ? ` (${args[1]})` : ""}: "${args[0]}"`];
    if (name === "ask" || name === "askNumber") {
      const branch = args[name === "ask" ? 3 : 2] as { right?: unknown[][]; wrong?: unknown[][] } | undefined;
      const how = name === "ask" ? `She taps one card of ${JSON.stringify(args[1])} (right: ${JSON.stringify(args[2])}).` : `She types a number (right: ${JSON.stringify(args[1])}).`;
      return [`${pad}Elli asks: "${args[0]}" ${how}`,
        ...(branch?.right ? [`${pad}  If right:`, ...watch(branch.right, depth + 2)] : []),
        ...(branch?.wrong ? [`${pad}  If wrong:`, ...watch(branch.wrong, depth + 2)] : [])];
    }
    return [`${pad}[board] ${name}(${args.map(a => JSON.stringify(a)).join(", ")})`];
  });
}

function lines(steps: unknown[][]): string[] {
  return steps.flatMap(([name, ...args]) => {
    if (name === "say") return [String(args[0])];
    if (name !== "ask" && name !== "askNumber") return [];
    const branch = (args[name === "ask" ? 3 : 2] ?? {}) as Record<string, unknown[][]>;
    const cardWords = name === "ask" && Array.isArray(args[1]) ? (args[1] as unknown[]).map(String).filter(c => !/^[0-9]+$/.test(c)) : []; // Elli reads word cards aloud
    return [String(args[0]), ...cardWords, ...["right", "wrong"].flatMap(k => Array.isArray(branch[k]) ? lines(branch[k]) : [])];
  });
}

async function voice(text: string, attempt = 0): Promise<string | null> {
  const name = `${crypto.createHash("sha1").update(text).digest("hex").slice(0, 12)}.mp3`, file = path.join(OUT, "voice", name);
  if (fs.existsSync(file)) return `../voice/${name}`;
  const voiceId = process.env.ELEVENLABS_VOICE_ID_ILA?.trim(), apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!voiceId || !apiKey) throw new Error("elli_voice_missing");
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, { method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }) });
  if (response.status === 429 && attempt < 3) { await new Promise(r => setTimeout(r, 4000 * (attempt + 1))); return voice(text, attempt + 1); } // another build is voicing too
  if (!response.ok) { log("voice", `failed status=${response.status} text=${JSON.stringify(text.slice(0, 40))}`); return null; }
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  return `../voice/${name}`;
}

const xaiKey = () => { const key = process.env.GROK_API_KEY?.trim() || process.env.XAI_API_KEY?.trim(); if (!key) throw new Error("grok_key_missing"); return key; };
async function download(url: string, file: string): Promise<void> {
  const response = await fetch(url); if (!response.ok) throw new Error(`download_failed:${response.status}`);
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
}

/** One Grok clip, cached by its prompts so an unchanged clip in the revision costs nothing. Falls back to the first frame. */
async function clip(row: Clip): Promise<string | null> {
  const base = `clip-${crypto.createHash("sha1").update(row.image_prompt + "|" + row.motion_prompt).digest("hex").slice(0, 12)}`;
  const dir = path.join(OUT, "clips"), mp4 = path.join(dir, `${base}.mp4`), png = path.join(dir, `${base}.png`);
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(mp4)) return `../clips/${base}.mp4`;
  if (spent() + CLIP_COST > BUDGET) { log("clip", `skipped id=${row.id} reason=budget spent=$${spent().toFixed(2)}`); return null; }
  spend.clips += CLIP_COST;
  const headers = { Authorization: `Bearer ${xaiKey()}`, "Content-Type": "application/json" };
  const image = await fetch("https://api.x.ai/v1/images/generations", { method: "POST", headers,
    body: JSON.stringify({ model: process.env.GROK_IMAGE_MODEL?.trim() || "grok-imagine-image", prompt: row.image_prompt, n: 1 }) });
  if (!image.ok) { log("clip-image", `failed id=${row.id} status=${image.status}`); return null; }
  const imageUrl = ((await image.json()) as { data?: Array<{ url?: string }> }).data?.[0]?.url;
  if (!imageUrl) return null;
  await download(imageUrl, png);
  const create = await fetch("https://api.x.ai/v1/videos/generations", { method: "POST", headers,
    body: JSON.stringify({ model: process.env.GROK_VIDEO_MODEL?.trim() || "grok-imagine-video", prompt: `${row.motion_prompt} No text overlays.`,
      image: { url: imageUrl }, duration: 6, aspect_ratio: "16:9", resolution: "480p" }) });
  const requestId = create.ok ? ((await create.json()) as { request_id?: string }).request_id : undefined;
  for (let poll = 0; requestId && poll < MAX_POLLS; poll += 1) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const data = (await (await fetch(`https://api.x.ai/v1/videos/${encodeURIComponent(requestId)}`, { headers })).json()) as { status?: string; video?: { url?: string } };
    if (data.status === "done" && data.video?.url) { await download(data.video.url, mp4); log("clip", `done id=${row.id}`); return `../clips/${base}.mp4`; }
    if (data.status === "failed" || data.status === "expired") break;
  }
  log("clip-video", `failed id=${row.id} fallback=first_frame`);
  return `../clips/${base}.png`;
}

async function publish(version: string, lesson: Lesson): Promise<void> {
  const dir = path.join(OUT, version); fs.mkdirSync(dir, { recursive: true });
  const clips: Record<string, string> = {};
  for (const row of lesson.clips.slice(0, MAX_CLIPS)) { const file = await clip(row); if (file) clips[row.id] = file; }
  const voices: Record<string, string> = {};
  for (const text of [...new Set(lines(lesson.steps))]) { const file = await voice(text); if (file) voices[text] = file; } // one at a time (ElevenLabs 429s on bursts)
  const pieces = Object.fromEntries(lesson.pieces.slice(0, MAX_PIECES).map(p => [p.id, p.code]));
  for (const p of lesson.pieces) log("draw", `piece id=${p.id} chars=${p.code.length} why=${JSON.stringify(p.why.slice(0, 120))}`);
  if (!lesson.pieces.length) log("draw", "no_pieces kit_was_enough");
  fs.writeFileSync(path.join(dir, "lesson.json"), JSON.stringify({ quiet: TASK === "probe", steps: lesson.steps, voice: voices, clips, pieces }, null, 2)); // a probe never reacts right/wrong
  fs.writeFileSync(path.join(dir, "plan.md"), [`# ${CHILD}: ${version}`, "", `**She lacks:** ${lesson.she_lacks}`, "", `**I will try:** ${lesson.i_will_try}`, "",
    `**I will know if:** ${lesson.i_will_know_if}`, "", `**Then:** ${lesson.then}`, "", `**Tools I wished for:** ${lesson.wished_tools.join("; ") || "none"}`, "",
    "## Pieces I drew", ...lesson.pieces.map(p => `- ${p.id}: ${p.why}`), "", "## Clips", ...lesson.clips.map(c => `- ${c.id}: ${c.image_prompt} / ${c.motion_prompt}`), "",
    "## The lesson as she sees it", "", ...watch(lesson.steps)].join("\n"));
  log("publish", `${version} steps=${lesson.steps.length} voiced=${Object.keys(voices).length} clips=${Object.keys(clips).length} pieces=${lesson.pieces.length}`);
}

type Play = { shots: Array<{ file: string; tool: string; question: string }>; errors: string[]; layout: string[]; answers: unknown[]; done: boolean; seconds: number };
const LAYOUT_JS = `(() => { const out = []; const vw = innerWidth, vh = innerHeight;
  for (const el of document.querySelectorAll('#bubble.on, #ask.on .card, #pad.on')) { const r = el.getBoundingClientRect();
    if (r.left < 0 || r.top < 0 || r.right > vw || r.bottom > vh) out.push((el.id || el.className) + ' off screen');
    if (el.id !== 'bubble' && (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2)) out.push((el.id || el.className) + ' text cut by its box'); }
  const b = document.querySelector('#bubble.on')?.getBoundingClientRect(); const ui = document.querySelector('#ask.on, #pad.on')?.getBoundingClientRect();
  if (b && ui && b.bottom > ui.top && b.top < ui.bottom && b.right > ui.left && b.left < ui.right) out.push('speech bubble overlaps the answers');
  return out; })()`;

/** Play the lesson headless (auto answers, first one wrong), screenshot every question and every new piece, collect errors. */
async function play(version: string): Promise<Play> {
  const dir = path.join(OUT, version, "shots"); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const result: Play = { shots: [], errors: [], layout: [], answers: [], done: false, seconds: 0 };
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on("console", m => { if (m.type() === "error") result.errors.push(m.text().slice(0, 240)); });
    page.on("pageerror", e => result.errors.push(`pageerror ${e.message.slice(0, 240)}`));
    const rel = path.relative(DIR, path.join(OUT, version, "lesson.json"));
    await page.goto(`${CLASSROOM_URL}?lesson=${rel}&auto=wrong&speed=3`);
    const started = Date.now(); let last = "";
    for (let tick = 0; tick < MAX_TICKS; tick += 1) {
      await page.waitForTimeout(700);
      const st = (await page.evaluate("(() => { const s = window.ElliClassroom?.state; return s ? { tool: s.tool, step: s.step, done: s.done, waiting: s.waiting, q: document.getElementById('bubble').textContent } : null })()")) as { tool: string; step: number; done: boolean; waiting: boolean; q: string } | null;
      if (!st) continue;
      if (st.done) { result.done = true; break; }
      const key = `${st.tool}:${st.q}:${st.step}`;
      const worth = (st.waiting && (st.tool === "ask" || st.tool === "askNumber")) || st.tool === "showPiece" || st.tool === "playClip";
      if (worth && key !== last && result.shots.length < MAX_SHOTS) {
        last = key; if (st.tool === "showPiece") await page.waitForTimeout(900);
        const file = path.join(dir, `${String(result.shots.length + 1).padStart(2, "0")}-${st.tool}.png`);
        await page.screenshot({ path: file, scale: "css" }); result.shots.push({ file, tool: st.tool, question: st.q });
        for (const issue of (await page.evaluate(LAYOUT_JS)) as string[]) result.layout.push(`${path.basename(file)}: ${issue}`);
      }
    }
    result.answers = (await page.evaluate("window.ElliClassroom?.state.answers || []")) as unknown[];
    result.seconds = Math.round((Date.now() - started) / 1000);
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(OUT, version, "play.json"), JSON.stringify({ ...result, shots: result.shots.map(s => path.basename(s.file)) }, null, 2));
  log("play", `${version} done=${result.done} shots=${result.shots.length} errors=${result.errors.length} layout=${result.layout.length} answers=${result.answers.length} seconds=${result.seconds}`);
  return result;
}

async function main(): Promise<void> {
  fs.mkdirSync(path.join(OUT, "voice"), { recursive: true });
  const task = TASK === "probe"
    ? `You are ${CHILD}'s tutor. Before anyone teaches ${CHILD} ${CONCEPT}, Sunny needs to find out what she already understands and
where it breaks. Here is everything Sunny knows about her. She will play your check alone: every answer must be her own, unseen
and unhelped, so Elli gives no hints, no answers and no teaching, and her answers are recorded exactly as she gives them.

You have one Classroom session for it. Write the whole thing. Call make_lesson once.`
    : `You are ${CHILD}'s tutor. ${CHILD} doesn't understand ${CONCEPT}. Here is everything Sunny knows about her. How would you teach it to her?

You have one Classroom lesson to do it in. Write the whole lesson. Call make_lesson once.`;
  log("task", `${TASK} child=${CHILD}`);
  const question = `${task}

${TOOLS_DOC}

${evidence}`;
  const v1 = await ask<Lesson>("v1", TUTOR, question, LESSON_TOOL);
  await publish("v1", v1);
  const run1 = await play("v1");

  const images: Anthropic.ImageBlockParam[] = run1.shots.map(s => ({ type: "image", source: { type: "base64", media_type: "image/png", data: fs.readFileSync(s.file).toString("base64") } }));
  const critique = await ask<Critique>("critique", CRITIC, [
    { type: "text", text: `You review a lesson another tutor made for ${CHILD} before she sees it. Judge it against the tutor's own goal and
against ${CHILD} as her evidence shows her. You see what she would see: a screenshot at every question (taken while the
answers are on screen) and at every board piece the tutor drew, in order, plus what the headless play-through logged.
Call critique once.

[The tutor's goal]
She lacks: ${v1.she_lacks}
The lesson tries: ${v1.i_will_try}
It worked if: ${v1.i_will_know_if}

[The lesson as she would see and hear it]
${watch(v1.steps).join("\n")}

[Pieces the tutor drew itself]
${v1.pieces.map(p => `${p.id}: ${p.why}`).join("\n") || "none"}

[The play-through] finished=${run1.done} in ${run1.seconds}s at 3x speed; errors: ${JSON.stringify(run1.errors)}; layout: ${JSON.stringify(run1.layout)}

[Screenshots, in order]
${run1.shots.map((s, i) => `${i + 1}. ${s.tool}: "${s.question}"`).join("\n")}

${TOOLS_DOC}

${evidence}` },
    ...images,
  ], CRITIQUE_TOOL);
  fs.writeFileSync(path.join(OUT, "critique.md"), [`# ${CRITIC}'s critique of v1: does it do its goal? ${critique.does_it_do_its_goal}`, "", "## Gaps", ...critique.gaps.map(g => `- ${g}`), "", "## Keep", ...critique.keep.map(k => `- ${k}`)].join("\n"));

  const v2 = await ask<Lesson>("v2", TUTOR, `${question}

[Your lesson]
${JSON.stringify(v1)}

[What happened when it was played through] finished=${run1.done}; errors: ${JSON.stringify(run1.errors)}; layout: ${JSON.stringify(run1.layout)}

[A reviewer (a different model) who did not see your reasoning looked at screenshots of every question and piece]
Does it do its goal: ${critique.does_it_do_its_goal}
Gaps: ${critique.gaps.map(g => `\n- ${g}`).join("")}
Keep: ${critique.keep.map(k => `\n- ${k}`).join("")}

Write your revised lesson. Keep clip prompts unchanged unless the clip itself must change. Call make_lesson once.`, LESSON_TOOL);
  await publish("v2", v2);
  const run2 = await play("v2");
  const summary = { child: CHILD, concept: CONCEPT, cost: { models: +spend.models.toFixed(2), clips: +spend.clips.toFixed(2), total: +spent().toFixed(2), budget: BUDGET },
    v1: { finished: run1.done, errors: run1.errors.length, layout: run1.layout, pieces: v1.pieces.map(p => p.id) },
    v2: { finished: run2.done, errors: run2.errors, layout: run2.layout, pieces: v2.pieces.map(p => p.id), answers: run2.answers.length } };
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
  log("done", `cost=$${spent().toFixed(2)} of $${BUDGET} v2_finished=${run2.done} v2_errors=${run2.errors.length} v2_layout=${run2.layout.length}`);
}

main().catch(error => { console.error(" 🎮 [classroom] [run] [failed]", error); process.exitCode = 1; });
