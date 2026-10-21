/**
 * How Elli takes turns in a live voice conversation: one product rule for her
 * reply length, plus the code-side rules for when the child is talking over her.
 */
import type { ModelMessage } from "ai";

export const COMPANION_SPOKEN_TURN_PROMPT = [
  "## How you talk",
  "This is a live voice conversation with a child who can talk over you. Say one or two short sentences, one idea at a time, then stop so the child can talk.",
  "If the child interrupts, answer what they just said.",
  "Every word you write is spoken aloud: never write private notes or describe the child in the third person.",
].join("\n");

/**
 * History for a reply the child cut off: their message, only what Elli had
 * actually said, and a note that she was interrupted, so her next turn does not
 * assume the child heard the rest.
 */
export function interruptedExchange(childMessage: string, companionSpoken: string): ModelMessage[] {
  const spoken = companionSpoken.trim();
  return [
    { role: "user", content: childMessage },
    ...(spoken ? [{ role: "assistant" as const, content: spoken }] : []),
    {
      role: "user",
      content: spoken
        ? "[You were interrupted: the child started talking, so they heard only what you said above.]"
        : "[You were interrupted before you answered: the child spoke again.]",
    },
  ];
}

/** Listening noises that mean "go on", not "stop". */
const BACKCHANNEL_WORDS = new Set([
  "uh", "huh", "uh-huh", "uhhuh", "mm", "mmm", "hmm", "mhm", "mm-hmm", "mmhmm",
  "okay", "ok", "yeah", "right", "oh", "ah",
]);
/** Elli's first words can leak back through the speakers before echo cancellation settles. */
const MIN_SPEAKING_MS_BEFORE_BARGE_IN = 300;
const ECHO_OVERLAP = 0.8;

function spokenWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\- ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function isBackchannel(text: string): boolean {
  const words = spokenWords(text);
  return words.length > 0 && words.length <= 3 && words.every((w) => BACKCHANNEL_WORDS.has(w));
}

/** The child's "speech" is mostly Elli's own words coming back through the speakers. */
export function isEchoOfCompanion(text: string, companionSpoken: string): boolean {
  const words = spokenWords(text);
  if (words.length < 2) return false;
  const said = new Set(spokenWords(companionSpoken));
  const overlap = words.filter((w) => said.has(w)).length / words.length;
  return overlap >= ECHO_OVERLAP;
}

/**
 * Should the child's live (interim) transcript stop Elli mid-reply? Yes once
 * it holds two real words that are neither a backchannel nor Elli's own echo.
 */
export function shouldBargeIn(input: { interim: string; companionSpoken: string; speakingForMs: number }): boolean {
  if (input.speakingForMs < MIN_SPEAKING_MS_BEFORE_BARGE_IN) return false;
  if (spokenWords(input.interim).length < 2) return false;
  if (isBackchannel(input.interim)) return false;
  return !isEchoOfCompanion(input.interim, input.companionSpoken);
}
