/**
 * Elli's Classroom, taught by the tutor (owner, 2026-11-26). The tutor gets the open question and Ila's evidence and
 * writes the whole lesson from the Classroom's tools. A separate critic, which never sees the tutor's reasoning, checks
 * the lesson against the tutor's own goal; the tutor revises once. Elli's lines are recorded in her voice.
 * Lab only: no kiosk, no records. Evidence and out/ stay out of git (child data).
 *
 *   DOTENV_CONFIG_PATH=~/Development/sunny/.env npx tsx experiments/elli-classroom/make-lesson.ts
 */
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(DIR, "out");
const EVIDENCE = path.join(DIR, "..", "rounding-explainer", "evidence");
const MODEL = "claude-opus-5-5";
const MAX_STEPS = 120, MAX_DEPTH = 3;
const log = (action: string, result: string) => console.log(` 🎮 [classroom-lesson] [${action}] [${result}]`);
const read = (name: string) => fs.readFileSync(path.join(EVIDENCE, name), "utf8");
const client = new Anthropic();

const TOOLS_DOC = `The Classroom: a warm 3D classroom. Elli (her companion, a 3D anime girl) stands by a big chalkboard and
teaches with these tools. A lesson is a list of steps; each step is [toolName, ...args] and runs when the one before
finishes. Elli turns and points at the board while she draws.
- ["drawNumberLine", from, to]: chalk a number road from \`from\` to \`to\`. Ticks every 1 for spans up to 20, else every 10.
- ["placeHouse", n]: a house on the road at n (a round number: a tens or hundreds house). Max two houses on the board.
- ["placeNumber", n]: drop the number buddy for n onto the road. Its house digit is blue, its other digits orange.
- ["showTens", n]: the buddy's lead digit grows and a dotted chalk line ties it to the lower house.
- ["markHalfway", a, b]: a yellow flag at the middle of the two houses.
- ["countSteps", n, target]: chalk hops from n to target, counted out loud on the board (single hops up to 12, then hops of ten).
- ["showCloser", n]: the house that is fewer steps away lights up (call after counting to both houses).
- ["walkTo", n, target]: the buddy hops to target, lands ON the house, and its digits flip to the house's number.
- ["clearBoard"]: wipe the board.
- ["say", text]: Elli says one short line (speech bubble, spoken in her voice).
- ["ask", text, [choiceA, choiceB], answer, {"right": [steps], "wrong": [steps]}]: Elli asks; Ila taps one of two big
  picture cards (each card is a house with that number). The optional last object holds the steps to run after a right
  or a wrong tap (up to 3 levels deep). Without it the lesson just continues.
- ["gesture", name]: wave, surprise_jump, ponder_moment, dance_victory, silly_dancing.
Nothing on the board can show words except the numbers; Elli's speech is the only language.`;

const evidence = `[Her soul file]
${read("soul.md")}

[Her rounding answers in Sunny since 11/06: problem, what she typed, right or not, help, try]
${read("rounding-answers.json")}

[Her session on 11/25 evening, as speech-to-text heard it. "user" lines mix Ila and her dad; her name is misheard as Ayla/Isla/Island. Her dad taught her here; Elli was asked to teach and did not.]
${read("2026-11-25-evening-transcript.md")}`;

const LESSON_TOOL: Anthropic.Tool = {
  name: "make_lesson",
  description: "Your lesson for Ila in the Classroom, with what you are testing.",
  input_schema: { type: "object", additionalProperties: false, required: ["she_lacks", "i_will_try", "i_will_know_if", "steps", "then", "wished_tools"],
    properties: {
      she_lacks: { type: "string", description: "What you think she is missing, from her evidence." },
      i_will_try: { type: "string", description: "What this lesson does about it, and why for her." },
      i_will_know_if: { type: "string", description: "What she would do afterwards if it worked." },
      steps: { type: "array", maxItems: MAX_STEPS, items: { type: "array" }, description: "The lesson: [toolName, ...args] steps." },
      then: { type: "string", description: "What comes after this lesson: the challenge and the later-day check you would give her." },
      wished_tools: { type: "array", items: { type: "string" }, description: "Tools you wanted and the Classroom lacks, if any." },
    } },
};
type Lesson = { she_lacks: string; i_will_try: string; i_will_know_if: string; steps: unknown[][]; then: string; wished_tools: string[] };

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

async function ask<T>(stage: string, content: string, tool: Anthropic.Tool): Promise<T> {
  const file = path.join(OUT, `${stage}.json`);
  if (fs.existsSync(file)) { log(stage, "reused"); return JSON.parse(fs.readFileSync(file, "utf8")) as T; }
  const message = await client.messages.stream({ model: MODEL, max_tokens: 48000, thinking: { type: "adaptive" }, tools: [tool],
    messages: [{ role: "user", content }] }).finalMessage();
  const block = message.content.find((row): row is Anthropic.ToolUseBlock => row.type === "tool_use" && row.name === tool.name);
  log(stage, `received stop=${message.stop_reason} in=${message.usage.input_tokens} out=${message.usage.output_tokens}`);
  if (!block) throw new Error(`classroom_${stage}_missing:${message.stop_reason}`);
  fs.writeFileSync(file, JSON.stringify(block.input, null, 2));
  return block.input as T;
}

/** The lesson as a person would watch it: what the critic reads. */
function watch(steps: unknown[][], depth = 0): string[] {
  const pad = "  ".repeat(depth);
  return steps.flatMap(([name, ...args]) => {
    if (name === "say") return [`${pad}Elli says: "${args[0]}"`];
    if (name === "ask") {
      const branch = args[3] as { right?: unknown[][]; wrong?: unknown[][] } | undefined;
      return [`${pad}Elli asks: "${args[0]}" Ila taps one of two house cards: ${JSON.stringify(args[1])} (right: ${args[2]}).`,
        ...(branch?.right ? [`${pad}  If right:`, ...watch(branch.right, depth + 2)] : []),
        ...(branch?.wrong ? [`${pad}  If wrong:`, ...watch(branch.wrong, depth + 2)] : [])];
    }
    return [`${pad}[board] ${name}(${args.map(a => JSON.stringify(a)).join(", ")})`];
  });
}

function lines(steps: unknown[][]): string[] {
  return steps.flatMap(([name, ...args]) => name === "say" ? [String(args[0])]
    : name === "ask" ? [String(args[0]), ...["right", "wrong"].flatMap(k => lines(((args[3] as Record<string, unknown[][]>) ?? {})[k] ?? []))] : []);
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

async function publish(version: string, lesson: Lesson): Promise<void> {
  const dir = path.join(OUT, version); fs.mkdirSync(dir, { recursive: true });
  const map: Record<string, string> = {};
  for (const text of [...new Set(lines(lesson.steps))]) { const file = await voice(text); if (file) map[text] = file; } // one at a time (ElevenLabs 429s on bursts)
  fs.writeFileSync(path.join(dir, "lesson.json"), JSON.stringify({ steps: lesson.steps, voice: map }, null, 2));
  fs.writeFileSync(path.join(dir, "plan.md"), [`# ${version}`, "", `**She lacks:** ${lesson.she_lacks}`, "", `**I will try:** ${lesson.i_will_try}`, "",
    `**I will know if:** ${lesson.i_will_know_if}`, "", `**Then:** ${lesson.then}`, "", `**Tools I wished for:** ${lesson.wished_tools.join("; ") || "none"}`, "",
    "## The lesson as she sees it", "", ...watch(lesson.steps)].join("\n"));
  log("publish", `${version} steps=${lesson.steps.length} voiced=${Object.keys(map).length}`);
}

async function main(): Promise<void> {
  fs.mkdirSync(path.join(OUT, "voice"), { recursive: true });
  const question = `You are Ila's tutor. Ila doesn't understand rounding. Here is everything Sunny knows about her. How would you teach it to her?

You have one Classroom lesson to do it in. Write the whole lesson. Call make_lesson once.

${TOOLS_DOC}

${evidence}`;
  const v1 = await ask<Lesson>("v1", question, LESSON_TOOL);
  await publish("v1", v1);

  const critique = await ask<Critique>("critique", `You review a lesson another tutor wrote for Ila, a 9-year-old, before she sees it.
Judge it only against the tutor's own goal and against Ila as her evidence shows her. Call critique once.

[The tutor's goal]
She lacks: ${v1.she_lacks}
The lesson tries: ${v1.i_will_try}
It worked if: ${v1.i_will_know_if}

[The lesson as Ila would see and hear it]
${watch(v1.steps).join("\n")}

${TOOLS_DOC}

${evidence}`, CRITIQUE_TOOL);
  fs.writeFileSync(path.join(OUT, "critique.md"), [`# Critique of v1: does it do its goal? ${critique.does_it_do_its_goal}`, "", "## Gaps", ...critique.gaps.map(g => `- ${g}`), "", "## Keep", ...critique.keep.map(k => `- ${k}`)].join("\n"));

  const v2 = await ask<Lesson>("v2", `${question}

[Your first lesson]
${JSON.stringify(v1)}

[A reviewer who did not see your reasoning read it as Ila would experience it]
Does it do its goal: ${critique.does_it_do_its_goal}
Gaps: ${critique.gaps.map(g => `\n- ${g}`).join("")}
Keep: ${critique.keep.map(k => `\n- ${k}`).join("")}

Write your revised lesson. Call make_lesson once.`, LESSON_TOOL);
  await publish("v2", v2);
}

main().catch(error => { console.error(" 🎮 [classroom-lesson] [run] [failed]", error); process.exitCode = 1; });
