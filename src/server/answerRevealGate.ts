/**
 * Record honesty for an open problem's answer (owner, 11/23: "I don't want filters"). Elli's words are never withheld or
 * changed. Each reply sentence is read once on its way out; one that states the open item's frozen answer is reported so
 * the record marks that item "with help". What she says, and whether to say it, is hers.
 */
import type { LearningCycleRecordV2 } from "../engine/learningCycleRepository";

export type OpenAnswerItem = { nodeId: string; itemId: string; expected: number; role?: string; prompt?: string };

const ONES: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** Every number a sentence says, in digits or in words ("forty-nine", "four hundred and twelve"). */
export function numbersSaid(text: string): number[] {
  const found: number[] = [];
  for (const match of text.matchAll(/(?<![\d.])[+-]?\d[\d,]*(?:\.\d+)?(?![\d])/g)) {
    const value = Number(match[0].replace(/,/g, ""));
    if (Number.isFinite(value)) found.push(value);
  }
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  let current: number | undefined;
  const close = () => { if (current !== undefined) found.push(current); current = undefined; };
  for (const word of words) {
    if (word in ONES) current = (current !== undefined && current % 10 === 0 && current % 100 !== 0 ? current : (close(), 0)) + ONES[word];
    else if (word in TENS) current = (current !== undefined && current % 100 === 0 && current > 0 ? current : (close(), 0)) + TENS[word];
    else if (word === "hundred" && current !== undefined && current < 10) current *= 100;
    else if (word === "and" && current !== undefined && current % 100 === 0 && current > 0) continue;
    else close();
  }
  close();
  return found;
}

/** The sentence states the answer: it says the expected number and that number is not already printed in the problem. */
export function statesAnswer(sentence: string, item: OpenAnswerItem): boolean {
  if (item.prompt && numbersSaid(item.prompt).includes(item.expected)) return false;
  return numbersSaid(sentence).includes(item.expected);
}

/** The problem open on her screen, if its frozen answer is a number and she has not answered it right yet. */
export function openAnswerItem(
  cycle: Pick<LearningCycleRecordV2, "nodes"> | null | undefined,
  binding: { nodeId: string; itemId: string } | undefined,
  solved: boolean,
): OpenAnswerItem | undefined {
  if (!binding || solved) return undefined;
  const contract = cycle?.nodes.find(node => node.nodeId === binding.nodeId)?.evidenceContract;
  const item = contract?.itemContracts?.[binding.itemId] as { prompt?: string; response?: { mode?: string; expected?: unknown } } | undefined;
  if (item?.response?.mode !== "numeric" || typeof item.response.expected !== "number") return undefined;
  const role = contract?.itemRoles?.[binding.itemId];
  return { nodeId: binding.nodeId, itemId: binding.itemId, expected: item.response.expected,
    ...(role ? { role } : {}), ...(item.prompt ? { prompt: item.prompt } : {}) };
}

/** Sentence ends: . ! ? (also "...") followed by a space, or a line break. Decimals like 3.5 are not ends. */
const SENTENCE_END = /[.!?]+(?=\s)\s*|\n+/g;

/**
 * Reads the companion's reply as it streams. With no open item chunks pass straight through. With one, text is passed on
 * a sentence at a time so each whole sentence can be checked for the answer; every sentence goes out unchanged.
 */
export function createAnswerRevealFilter(
  resolveItem: () => OpenAnswerItem | undefined,
  onReveal: (sentence: string, item: OpenAnswerItem) => void,
) {
  let pending = "";
  let item: OpenAnswerItem | undefined;
  let resolved = false;
  const check = (sentence: string): string => {
    if (item && statesAnswer(sentence, item)) onReveal(sentence, item);
    return sentence;
  };
  return {
    push(chunk: string): string {
      if (!resolved) { resolved = true; item = resolveItem(); }
      if (!item) return chunk;
      pending += chunk;
      let out = "", last = 0;
      for (const match of pending.matchAll(SENTENCE_END)) {
        const end = match.index! + match[0].length;
        out += check(pending.slice(last, end));
        last = end;
      }
      pending = pending.slice(last);
      return out;
    },
    flush(): string {
      const rest = pending;
      pending = "";
      return rest ? check(rest) : "";
    },
  };
}

/** What the gate needs from a live session: the open item now, and where a reveal is recorded. */
export type AnswerGateSession = {
  openAnswerItem?(): OpenAnswerItem | undefined;
  noteAnswerReveal?(sentence: string, item: OpenAnswerItem): void;
};

export function answerGateForSession(session: AnswerGateSession) {
  return createAnswerRevealFilter(
    () => { try { return session.openAnswerItem?.(); } catch (error) { console.error(" 🎮 [answer-reveal] [item] [unavailable]", error); return undefined; } },
    (sentence, item) => session.noteAnswerReveal?.(sentence, item),
  );
}

/** A whole line (a check-in she scheduled) through the same gate. */
export function filterAnswerReveal(session: AnswerGateSession, text: string): string {
  const gate = answerGateForSession(session);
  return gate.push(text) + gate.flush();
}
