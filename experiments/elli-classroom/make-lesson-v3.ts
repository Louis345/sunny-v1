/**
 * Elli's Classroom v3 (owner, 2026-11-26 evening). The tutor (Opus) gets Ila's evidence, what the earlier story-check
 * tutor mapped about rounding, its own last lesson, and her parents' notes on it, and writes a new lesson with the
 * Classroom's tools (now with place value, a number pad, any answer cards, and up to two Grok clips). A critic from a
 * different model (Sonnet 5.5), which never sees the tutor's reasoning, reviews it; the tutor revises once (v4).
 * Code only renders: Elli's voice, the clips, the lesson file. Lab only; evidence and out/ stay out of git (child data).
 *
 *   DOTENV_CONFIG_PATH=~/Development/sunny/.env npx tsx experiments/elli-classroom/make-lesson-v3.ts
 */
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(DIR, "out");
const EVIDENCE = path.join(DIR, "..", "rounding-explainer", "evidence");
const TUTOR = "claude-opus-5-5", CRITIC = "claude-sonnet-5-5";
const PRICE: Record<string, [number, number]> = { [TUTOR]: [5, 25], [CRITIC]: [2, 10] }; // $ per million tokens in/out
const MAX_STEPS = 160, MAX_CLIPS = 2, MAX_POLLS = 40;
const log = (action: string, result: string) => console.log(` 🎮 [classroom-v3] [${action}] [${result}]`);
const read = (file: string) => fs.readFileSync(file, "utf8");
const client = new Anthropic();
let spent = 0;

const TOOLS_DOC = `The Classroom: a warm 3D classroom on her kiosk (1280x800, she taps with a finger). Elli (her companion, a 3D anime
girl) stands by a big chalkboard and teaches with these tools. A lesson is a list of steps; each step is [toolName, ...args]
and runs when the one before finishes. Elli turns and points at the board while she draws.
- ["showPlaceValue", n, focus?]: the whole board becomes columns, one per digit (100s, 10s, 1s), each with its digit and
  base-ten blocks (hundred flats, ten rods, one cubes). focus 100, 10 or 1 makes that column glow. Same n again only moves the glow.
- ["drawNumberLine", from, to]: chalk a number road from \`from\` to \`to\` (replaces the place-value board). Ticks every 1 for spans up to 20, else every 10.
- ["placeHouse", n]: a house on the road at n (a round number: a tens or hundreds house). Max two houses on the board.
- ["placeNumber", n]: drop the number buddy for n onto the road. Its house digit is blue, its other digits orange.
- ["showTens", n]: the buddy's lead digit grows and a dotted chalk line ties it to the lower house.
- ["markHalfway", a, b]: a yellow flag at the middle of the two houses.
- ["countSteps", n, target]: chalk hops from n to target, counted out loud on the board (single hops up to 12, then hops of ten).
- ["showCloser", n]: the house that is fewer steps away lights up (call after counting to both houses).
- ["walkTo", n, target]: the buddy hops to target, lands ON the house, and its digits flip to the house's number.
- ["clearBoard"]: wipe the board.
- ["say", text]: Elli says one short line (speech bubble, spoken in her voice).
- ["ask", text, [choices], answer, {"right": [steps], "wrong": [steps]}]: Elli asks; Ila taps one of 2 to 4 big cards. A
  number that matches a house on the board shows as that house; any other choice shows as a big number or a short word.
  answer null means there is no right answer (you want to hear what she thinks). The optional last object holds the steps
  after a right or a wrong tap (up to 3 levels deep); with answer null the "right" steps run.
- ["askNumber", text, answer, {"right": [steps], "wrong": [steps]}]: Elli asks; Ila types a number on a big number pad and
  taps ✓. answer null = no right answer. Same optional branches.
- ["playClip", id]: one of your video clips plays full screen (about 6 s, no sound of its own).
- ["celebrate"]: confetti and Elli's victory dance.
- ["gesture", name]: wave, surprise_jump, ponder_moment, dance_victory, silly_dancing.
Every answer she gives is recorded (question, what she tapped or typed, right or not, seconds taken) for her parents and
for you to read next time. Nothing on the board shows words except numbers and the 100s/10s/1s column heads; Elli's speech
and the word cards are the only language.

You can also make up to ${MAX_CLIPS} short Grok Imagine video clips (about 6 s, 16:9, no text in them): give an image prompt
(first frame) and a motion prompt.`;

const evidence = `[Her soul file]
${read(path.join(EVIDENCE, "soul.md"))}

[Her rounding answers in Sunny since 11/06: problem, what she typed, right or not, help, try]
${read(path.join(EVIDENCE, "rounding-answers.json"))}

[Her session on 11/25 evening, as speech-to-text heard it. "user" lines mix Ila and her dad; her name is misheard as Ayla/Isla/Island. Her dad taught her here; Elli was asked to teach and did not.]
${read(path.join(EVIDENCE, "2026-11-25-evening-transcript.md"))}

[What another tutor mapped this afternoon: what rounding needs, and what her answers already say about each link]
${read(path.join(DIR, "..", "rounding-story-check", "out", "map.md"))}`;

const PARENT_NOTES = read(path.join(DIR, "evidence", "ila", "parent-notes-v3.md")); // parents' words stay out of git

const LESSON_TOOL: Anthropic.Tool = {
  name: "make_lesson",
  description: "Your lesson for Ila in the Classroom, with what you are testing.",
  input_schema: { type: "object", additionalProperties: false, required: ["she_lacks", "i_will_try", "i_will_know_if", "steps", "clips", "then", "wished_tools"],
    properties: {
      she_lacks: { type: "string", description: "What you think she is missing, from her evidence." },
      i_will_try: { type: "string", description: "What this lesson does about it, and why for her." },
      i_will_know_if: { type: "string", description: "What her recorded answers would show if it worked." },
      steps: { type: "array", maxItems: MAX_STEPS, items: { type: "array" }, description: "The lesson: [toolName, ...args] steps." },
      clips: { type: "array", maxItems: MAX_CLIPS, items: { type: "object", additionalProperties: false, required: ["id", "image_prompt", "motion_prompt"],
        properties: { id: { type: "string" }, image_prompt: { type: "string" }, motion_prompt: { type: "string" } } } },
      then: { type: "string", description: "What comes after this lesson: the challenge and the later-day check you would give her." },
      wished_tools: { type: "array", items: { type: "string" }, description: "Tools you wanted and the Classroom lacks, if any." },
    } },
};
type Clip = { id: string; image_prompt: string; motion_prompt: string };
type Lesson = { she_lacks: string; i_will_try: string; i_will_know_if: string; steps: unknown[][]; clips: Clip[]; then: string; wished_tools: string[] };

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

async function ask<T>(stage: string, model: string, content: string, tool: Anthropic.Tool): Promise<T> {
  const file = path.join(OUT, `${stage}.json`);
  if (fs.existsSync(file)) { log(stage, "reused"); return JSON.parse(read(file)) as T; }
  const message = await client.messages.stream({ model, max_tokens: 64000, thinking: { type: "adaptive" }, tools: [tool],
    messages: [{ role: "user", content }] }).finalMessage();
  const [pin, pout] = PRICE[model]; const cost = (message.usage.input_tokens * pin + message.usage.output_tokens * pout) / 1e6; spent += cost;
  const block = message.content.find((row): row is Anthropic.ToolUseBlock => row.type === "tool_use" && row.name === tool.name);
  log(stage, `received model=${model} stop=${message.stop_reason} in=${message.usage.input_tokens} out=${message.usage.output_tokens} cost=$${cost.toFixed(2)}`);
  if (!block) throw new Error(`classroom_${stage}_missing:${message.stop_reason}`);
  fs.writeFileSync(file, JSON.stringify(block.input, null, 2));
  return block.input as T;
}

/** The lesson as a person would watch it: what the critic and the parents read. */
function watch(steps: unknown[][], depth = 0): string[] {
  const pad = "  ".repeat(depth);
  return steps.flatMap(([name, ...args]) => {
    if (name === "say") return [`${pad}Elli says: "${args[0]}"`];
    if (name === "ask" || name === "askNumber") {
      const branch = args[name === "ask" ? 3 : 2] as { right?: unknown[][]; wrong?: unknown[][] } | undefined;
      const how = name === "ask" ? `Ila taps one card of ${JSON.stringify(args[1])} (right: ${JSON.stringify(args[2])}).` : `Ila types a number (right: ${JSON.stringify(args[1])}).`;
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
    return [String(args[0]), ...["right", "wrong"].flatMap(k => Array.isArray(branch[k]) ? lines(branch[k]) : [])];
  });
}

async function voice(text: string): Promise<string | null> {
  const name = `${crypto.createHash("sha1").update(text).digest("hex").slice(0, 12)}.mp3`, file = path.join(OUT, "voice", name);
  if (fs.existsSync(file)) return `../voice/${name}`;
  const voiceId = process.env.ELEVENLABS_VOICE_ID_ILA?.trim(), apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!voiceId || !apiKey) throw new Error("elli_voice_missing");
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, { method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }) });
  if (!response.ok) { log("voice", `failed status=${response.status} text=${JSON.stringify(text.slice(0, 40))}`); return null; }
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  return `../voice/${name}`;
}

const xaiKey = () => { const key = process.env.GROK_API_KEY?.trim() || process.env.XAI_API_KEY?.trim(); if (!key) throw new Error("grok_key_missing"); return key; };
async function download(url: string, file: string): Promise<void> {
  const response = await fetch(url); if (!response.ok) throw new Error(`download_failed:${response.status}`);
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
}

/** One Grok clip, cached by its prompts so an unchanged clip in v4 costs nothing. Falls back to the first frame. */
async function clip(row: Clip): Promise<string | null> {
  const base = `clip-${crypto.createHash("sha1").update(row.image_prompt + "|" + row.motion_prompt).digest("hex").slice(0, 12)}`;
  const dir = path.join(OUT, "clips"), mp4 = path.join(dir, `${base}.mp4`), png = path.join(dir, `${base}.png`);
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(mp4)) return `../clips/${base}.mp4`;
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
  fs.writeFileSync(path.join(dir, "lesson.json"), JSON.stringify({ steps: lesson.steps, voice: voices, clips }, null, 2));
  fs.writeFileSync(path.join(dir, "plan.md"), [`# ${version}`, "", `**She lacks:** ${lesson.she_lacks}`, "", `**I will try:** ${lesson.i_will_try}`, "",
    `**I will know if:** ${lesson.i_will_know_if}`, "", `**Then:** ${lesson.then}`, "", `**Tools I wished for:** ${lesson.wished_tools.join("; ") || "none"}`, "",
    "## Clips", ...lesson.clips.map(c => `- ${c.id}: ${c.image_prompt} / ${c.motion_prompt}`), "", "## The lesson as she sees it", "", ...watch(lesson.steps)].join("\n"));
  log("publish", `${version} steps=${lesson.steps.length} voiced=${Object.keys(voices).length} clips=${Object.keys(clips).length}`);
}

async function main(): Promise<void> {
  fs.mkdirSync(path.join(OUT, "voice"), { recursive: true });
  const v2 = JSON.parse(read(path.join(OUT, "v2.json"))) as Lesson;
  const question = `You are Ila's tutor. Ila doesn't understand rounding. Here is everything Sunny knows about her. How would you teach it to her?

You have one Classroom lesson to do it in. Write the whole lesson. Call make_lesson once.

${TOOLS_DOC}

${evidence}

[Your last lesson, as she would see it]
She lacks: ${v2.she_lacks}
It tried: ${v2.i_will_try}
${watch(v2.steps).join("\n")}

${PARENT_NOTES}`;
  const v3 = await ask<Lesson>("v3", TUTOR, question, LESSON_TOOL);
  await publish("v3", v3);

  const critique = await ask<Critique>("critique-v3", CRITIC, `You review a lesson another tutor wrote for Ila, a 9-year-old, before she sees it.
Judge it against the tutor's own goal, against Ila as her evidence shows her, and against her parents' notes. Call critique once.

[The tutor's goal]
She lacks: ${v3.she_lacks}
The lesson tries: ${v3.i_will_try}
It worked if: ${v3.i_will_know_if}

[The lesson as Ila would see and hear it]
${watch(v3.steps).join("\n")}

[The video clips]
${v3.clips.map(c => `${c.id}: ${c.image_prompt} / ${c.motion_prompt}`).join("\n")}

${TOOLS_DOC}

${evidence}

${PARENT_NOTES}`, CRITIQUE_TOOL);
  fs.writeFileSync(path.join(OUT, "critique-v3.md"), [`# Sonnet 5.5's critique of v3: does it do its goal? ${critique.does_it_do_its_goal}`, "", "## Gaps", ...critique.gaps.map(g => `- ${g}`), "", "## Keep", ...critique.keep.map(k => `- ${k}`)].join("\n"));

  const v4 = await ask<Lesson>("v4", TUTOR, `${question}

[Your new lesson]
${JSON.stringify(v3)}

[A reviewer (a different model) who did not see your reasoning read it as Ila would experience it]
Does it do its goal: ${critique.does_it_do_its_goal}
Gaps: ${critique.gaps.map(g => `\n- ${g}`).join("")}
Keep: ${critique.keep.map(k => `\n- ${k}`).join("")}

Write your revised lesson. Keep clip prompts unchanged unless the clip itself must change. Call make_lesson once.`, LESSON_TOOL);
  await publish("v4", v4);
  log("done", `model_cost=$${spent.toFixed(2)} (clips about $0.35 each, voice small)`);
}

main().catch(error => { console.error(" 🎮 [classroom-v3] [run] [failed]", error); process.exitCode = 1; });
