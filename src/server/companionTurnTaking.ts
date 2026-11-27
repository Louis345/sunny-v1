/**
 * How a live voice conversation works for the companion (facts), plus the code that handles the child talking over her.
 */
import type { ModelMessage } from "ai";

export const COMPANION_SPOKEN_TURN_PROMPT = [
  "## Talking live",
  "Every word you write is spoken aloud, and your voice starts as soon as your first sentence is written.",
  "She can talk over you: your reply stops there, and her words come to you next.",
  "Your turn ends when you call recordChildSignal or recordProductIssue, so anything you say comes before those calls.",
].join("\n");

/**
 * What she can really do, from the tools this turn actually has (owner eval 11/22: "I promise… tomorrow", "I'll flag
 * that" with no tool to flag). Code states the abilities; the companion decides what to say.
 */
export function companionAbilitiesLine(toolNames: string[]): string {
  const names = [...new Set(toolNames.filter(Boolean))];
  return `## What you can do\nYour abilities right now are exactly what these tools do: ${names.length ? names.join(", ") : "no tools this turn (you can only talk)"}. Anything else, such as remembering a plan for another day, reminding, flagging or telling a grown-up, is not something you can do from here.`;
}

/**
 * History for a reply the child cut off: their message, only what Elli had
 * actually said, and a note that she was interrupted, so her next turn does not
 * assume the child heard the rest.
 */
export function interruptedExchange(
  childMessage: string | null,
  companionSpoken: string,
  stateBefore: string,
): ModelMessage[] {
  if (!childMessage) {
    // The reply was already written (and is in history) but still playing.
    return stateBefore === "SPEAKING"
      ? [{ role: "user", content: "[You were interrupted while still speaking: the child may not have heard the end of your last reply.]" }]
      : [];
  }
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

/** Pure listening noises: never an answer. */
const LISTENING_NOISES = new Set(["uh", "huh", "uh-huh", "uhhuh", "mm", "mmm", "hmm", "mhm", "mm-hmm", "mmhmm", "oh", "ah"]);
/** Short acknowledgements: "go on" while Elli talks, but can also be a real answer ("left or right?"). */
const SHORT_ACKS = new Set(["okay", "ok", "yeah", "right"]);
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

function allWordsIn(text: string, ...sets: Set<string>[]): boolean {
  const words = spokenWords(text);
  return words.length > 0 && words.length <= 3 && words.every((w) => sets.some((set) => set.has(w)));
}

/** Should not stop Elli mid-sentence: listening noises and short acknowledgements. */
export function isBackchannel(text: string): boolean {
  return allWordsIn(text, LISTENING_NOISES, SHORT_ACKS);
}

/** Safe to drop entirely: nothing but listening noises. */
export function isListeningNoise(text: string): boolean {
  return allWordsIn(text, LISTENING_NOISES);
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
 * A final transcript that is a long verbatim repeat of Elli's latest words is her
 * own voice through the speakers. Short repeats ("is it seven?") are real answers.
 */
export function isVerbatimEchoOfCompanion(text: string, companionSpoken: string): boolean {
  const words = spokenWords(text);
  if (words.length < 5) return false;
  const recent = new Set(spokenWords(companionSpoken).slice(-40));
  return words.filter((w) => recent.has(w)).length / words.length >= 0.9;
}

/** Case- and punctuation-free words: "Nope. Nope..." and "nope, nope" are the same utterance. */
export function normalizeUtterance(text: string): string {
  return spokenWords(text).join(" ");
}

/**
 * Anything Sunny spoke recently (game narration or a reply) coming back through the room mic.
 * Only a multi-word transcript counts, and most of its words must sit in runs of three that
 * Sunny said in that order: a mic echo is a stretch of her speech, while a child's sentence
 * that borrows common words and one phrase from a long reply is hers (Ila, 2026-11-09).
 * A child repeating a word or two ("plane", "is it plane?") is a real answer, and a
 * letter-by-letter spelling attempt is always hers. Returns the utterance it echoes.
 */
export function selfEchoSource(transcript: string, recentSpeech: readonly string[]): string | undefined {
  const words = spokenWords(transcript);
  if (words.length < 4 || words.every((w) => w.length === 1)) return undefined;
  return recentSpeech.find((utterance) => {
    const said = spokenWords(utterance);
    const runs = new Set(said.slice(2).map((w, i) => `${said[i]} ${said[i + 1]} ${w}`));
    const covered = new Set<number>();
    words.slice(2).forEach((w, i) => { if (runs.has(`${words[i]} ${words[i + 1]} ${w}`)) [i, i + 1, i + 2].forEach((at) => covered.add(at)); });
    return covered.size / words.length >= 0.75;
  });
}

export function isSelfEcho(transcript: string, recentSpeech: readonly string[]): boolean {
  return selfEchoSource(transcript, recentSpeech) !== undefined;
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

/** A name heard through speech recognition: one or two letters off ("Latilda" for Matilda). */
function soundsLikeName(word: string, name: string): boolean {
  if (word === name) return true;
  if (name.length < 5 || Math.abs(word.length - name.length) > 2) return false;
  let previous = Array.from({ length: name.length + 1 }, (_, index) => index);
  for (let row = 1; row <= word.length; row += 1) {
    const current = [row];
    for (let col = 1; col <= name.length; col += 1) {
      current[col] = Math.min(previous[col] + 1, current[col - 1] + 1, previous[col - 1] + (word[row - 1] === name[col - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[name.length] <= 2;
}

export const PRE_AUDIO_RESTART_LIMIT = 2;

/**
 * Speech that arrives before the companion's reply is heard, following LiveKit (a capped number
 * of regenerations per turn; interruptions only over audible speech) and Deepgram Flux (speak
 * once the turn ends). Her companion's name or the same request again is a repeat and does not
 * restart the reply; new words restart it at most twice, then wait to be answered right after.
 */
export function preAudioSpeechAction(input: {
  transcript: string; inFlightRequest: string | null; restarts: number; wakeNames: readonly string[];
}): "restart" | "repeat" | "hold" {
  const words = spokenWords(input.transcript);
  const names = input.wakeNames.flatMap(spokenWords);
  const sameRequest = input.inFlightRequest !== null && words.join(" ") === spokenWords(input.inFlightRequest).join(" ");
  if (words.length > 0 && (sameRequest || words.every(word => names.some(name => soundsLikeName(word, name))))) return "repeat";
  return input.restarts < PRE_AUDIO_RESTART_LIMIT ? "restart" : "hold";
}
