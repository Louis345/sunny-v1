import { z } from "zod";

/**
 * The side-conversation clock every companion inherits (owner 2026-11-15): when a talk wanders off the activity, the
 * companion may note what it is about and how long she means to give it. Each turn she then sees how long it has run,
 * as a fact. Code keeps the time and nothing else: it never ends the talk, never steers, never speaks.
 */
export const SIDE_TALK_TOOL = "keepTimeOnSideTalk";
const MAX_MINUTES = 15;
const FORGET_AFTER_MS = 10 * 60 * 1000;

type Clock = { about: string; startedAt: number; plannedMs: number };
const clocks = new Map<string, Clock>();

const DESCRIPTION =
  "Keep time on a side conversation (a tangent, a worry, a complaint about Sunny or about you). Say what it is about and how many minutes you mean to give it; each turn you will see how long it has run. Set it again to change the plan; minutes 0 when it is over. Optional: use it when keeping time helps you.";
export const sideTalkInputSchema = z.object({
  about: z.string().describe("A few words: what the side conversation is about."),
  minutes: z.number().describe("How many minutes you mean to give it (0 ends it)."),
});

const clip = (text: string) => text.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
const clockText = (ms: number) => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/** Start, change or end her clock for one child and companion. Never throws. */
export function keepTimeOnSideTalk(key: string, input: { about?: unknown; minutes?: unknown }, now: Date = new Date()): { kept: boolean; reason?: string } {
  const minutes = typeof input.minutes === "number" && Number.isFinite(input.minutes) ? Math.min(MAX_MINUTES, Math.max(0, input.minutes)) : NaN;
  if (Number.isNaN(minutes)) return { kept: false, reason: "minutes_missing" };
  if (minutes === 0) {
    clocks.delete(key);
    console.log(` 🎮 [side-talk] [ended] key=${key}`);
    return { kept: true };
  }
  const about = typeof input.about === "string" ? clip(input.about) : "";
  if (!about) return { kept: false, reason: "about_missing" };
  const existing = clocks.get(key);
  const startedAt = existing && existing.about === about ? existing.startedAt : now.getTime();
  clocks.set(key, { about, startedAt, plannedMs: minutes * 60 * 1000 });
  console.log(` 🎮 [side-talk] [${existing ? "changed" : "started"}] key=${key} minutes=${minutes}`);
  return { kept: true };
}

/** The fact she sees each turn while her clock runs; undefined when none (or long forgotten). */
export function sideTalkLine(key: string, now: Date = new Date()): string | undefined {
  const clock = clocks.get(key);
  if (!clock) return undefined;
  const ran = now.getTime() - clock.startedAt;
  if (ran > clock.plannedMs + FORGET_AFTER_MS) {
    clocks.delete(key);
    console.log(` 🎮 [side-talk] [forgotten] key=${key}`);
    return undefined;
  }
  const past = ran > clock.plannedMs ? " (past your plan)" : "";
  return `Side conversation you are keeping time on: ${JSON.stringify(clock.about)}: ${clockText(ran)} so far; you planned ${clockText(clock.plannedMs)}${past}. Wrap it up or keep going: your call.`;
}

/** The homework session's tool (AI SDK). */
export function sideTalkAiTool(key: string) {
  // A plain AI SDK tool object (the `tool()` helper only adds types), so the turn never depends on that helper.
  return {
    description: DESCRIPTION,
    inputSchema: sideTalkInputSchema,
    execute: async (args: z.infer<typeof sideTalkInputSchema>) => keepTimeOnSideTalk(key, args),
  };
}

/** The FaceTime call's tool (Anthropic tool schema). */
export const sideTalkAnthropicTool = {
  name: SIDE_TALK_TOOL,
  description: DESCRIPTION,
  input_schema: {
    type: "object" as const,
    properties: {
      about: { type: "string", description: "A few words: what the side conversation is about." },
      minutes: { type: "number", description: "How many minutes you mean to give it (0 ends it)." },
    },
    required: ["about", "minutes"],
  },
};
