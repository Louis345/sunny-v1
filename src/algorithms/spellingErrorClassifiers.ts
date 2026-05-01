import type { DomainClassifier, SingleAttemptErrorSignal } from "./types";

const VOWELS = new Set(["a", "e", "i", "o", "u"]);

type DeleteEdit = { kind: "delete"; index: number; char: string };
type InsertEdit = { kind: "insert"; index: number; char: string };
type SubstituteEdit = { kind: "substitute"; index: number; from: string; to: string };
type TransposeEdit = { kind: "transpose"; indices: [number, number] };

function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z]/g, "");
}

function isVowel(char: string): boolean {
  return VOWELS.has(char);
}

function isConsonant(char: string): boolean {
  return /^[a-z]$/.test(char) && !isVowel(char);
}

function makeSignal(
  errorType: string,
  target: string,
  attemptedValue: string,
  positions: number[],
): SingleAttemptErrorSignal {
  return {
    errorType,
    frequency: 1,
    consistency: 1,
    confidence: 1,
    sessionCount: 1,
    lastSeen: "",
    exampleTargets: [normalize(target)],
    positions: Array.from(new Set(positions)).sort((a, b) => a - b),
    domain: "spelling",
    target: normalize(target),
    attemptedValue: normalize(attemptedValue),
  };
}

function singleDeletion(target: string, attempt: string): DeleteEdit | null {
  if (target.length !== attempt.length + 1) return null;
  for (let i = 0; i < target.length; i++) {
    if (target.slice(0, i) + target.slice(i + 1) === attempt) {
      return { kind: "delete", index: i, char: target[i]! };
    }
  }
  return null;
}

function singleInsertion(target: string, attempt: string): InsertEdit | null {
  if (attempt.length !== target.length + 1) return null;
  for (let i = 0; i < attempt.length; i++) {
    if (attempt.slice(0, i) + attempt.slice(i + 1) === target) {
      return { kind: "insert", index: i, char: attempt[i]! };
    }
  }
  return null;
}

function singleSubstitution(target: string, attempt: string): SubstituteEdit | null {
  if (target.length !== attempt.length) return null;
  const diffs: number[] = [];
  for (let i = 0; i < target.length; i++) {
    if (target[i] !== attempt[i]) diffs.push(i);
  }
  if (diffs.length !== 1) return null;
  const index = diffs[0]!;
  return {
    kind: "substitute",
    index,
    from: target[index]!,
    to: attempt[index]!,
  };
}

function adjacentTransposition(target: string, attempt: string): TransposeEdit | null {
  if (target.length !== attempt.length) return null;
  const diffs: number[] = [];
  for (let i = 0; i < target.length; i++) {
    if (target[i] !== attempt[i]) diffs.push(i);
  }
  if (diffs.length !== 2) return null;
  const [a, b] = diffs;
  if (b !== a + 1) return null;
  if (target[a] === attempt[b] && target[b] === attempt[a]) {
    return { kind: "transpose", indices: [a, b] };
  }
  return null;
}

function commonSuffixLength(a: string, b: string): number {
  let count = 0;
  while (
    count < a.length &&
    count < b.length &&
    a[a.length - 1 - count] === b[b.length - 1 - count]
  ) {
    count++;
  }
  return count;
}

function sameVisualShape(a: string, b: string): boolean {
  const shape = (value: string) =>
    value
      .split("")
      .map((char) => {
        if ("bdfhklt".includes(char)) return "tall";
        if ("gjpqy".includes(char)) return "tail";
        if ("aceimnorsuvwxz".includes(char)) return "small";
        return "other";
      })
      .join("-");
  return shape(a) === shape(b);
}

export function classifyVowelOmission(
  targetRaw: string,
  attemptRaw: string,
): SingleAttemptErrorSignal | null {
  const target = normalize(targetRaw);
  const attempt = normalize(attemptRaw);
  if (!target || !attempt || target === attempt) return null;
  const edit = singleDeletion(target, attempt);
  if (!edit || !isVowel(edit.char)) return null;
  return makeSignal("spelling:vowel_omission", target, attempt, [edit.index]);
}

export function classifyVowelSubstitution(
  targetRaw: string,
  attemptRaw: string,
): SingleAttemptErrorSignal | null {
  const target = normalize(targetRaw);
  const attempt = normalize(attemptRaw);
  if (!target || !attempt || target === attempt) return null;
  const edit = singleSubstitution(target, attempt);
  if (!edit || !isVowel(edit.from) || !isVowel(edit.to)) return null;
  return makeSignal("spelling:vowel_substitution", target, attempt, [edit.index]);
}

export function classifyConsonantDoubling(
  targetRaw: string,
  attemptRaw: string,
): SingleAttemptErrorSignal | null {
  const target = normalize(targetRaw);
  const attempt = normalize(attemptRaw);
  if (!target || !attempt || target === attempt) return null;
  const edit = singleInsertion(target, attempt);
  if (!edit || !isConsonant(edit.char)) return null;
  const before = attempt[edit.index - 1];
  const after = attempt[edit.index + 1];
  if (before !== edit.char && after !== edit.char) return null;
  const position = after === edit.char ? edit.index + 1 : edit.index;
  return makeSignal("spelling:consonant_doubling", target, attempt, [
    position,
  ]);
}

export function classifyEndingConfusion(
  targetRaw: string,
  attemptRaw: string,
): SingleAttemptErrorSignal | null {
  const target = normalize(targetRaw);
  const attempt = normalize(attemptRaw);
  if (!target || !attempt || target === attempt) return null;
  if (target.length !== attempt.length) return null;
  const suffix = commonSuffixLength(target, attempt);
  const diffs: number[] = [];
  for (let i = 0; i < target.length; i++) {
    if (target[i] !== attempt[i]) diffs.push(i);
  }
  if (diffs.length < 1 || diffs.length > 3) return null;
  const start = diffs[0]!;
  if (start >= target.length - 2) {
    const endingStart = Math.max(0, target.length - 2);
    return makeSignal(
      "spelling:ending_confusion",
      target,
      attempt,
      Array.from({ length: target.length - endingStart }, (_, i) => endingStart + i),
    );
  }
  if (start < Math.max(2, target.length - 3)) {
    return makeSignal("spelling:ending_confusion", target, attempt, diffs);
  }
  if (suffix >= target.length - start) return null;
  return null;
}

export function classifyTransposition(
  targetRaw: string,
  attemptRaw: string,
): SingleAttemptErrorSignal | null {
  const target = normalize(targetRaw);
  const attempt = normalize(attemptRaw);
  if (!target || !attempt || target === attempt) return null;
  const edit = adjacentTransposition(target, attempt);
  if (!edit) return null;
  return makeSignal("spelling:transposition", target, attempt, [
    edit.indices[0],
    edit.indices[1],
  ]);
}

export function classifyInsertion(
  targetRaw: string,
  attemptRaw: string,
): SingleAttemptErrorSignal | null {
  const target = normalize(targetRaw);
  const attempt = normalize(attemptRaw);
  if (!target || !attempt || target === attempt) return null;
  const edit = singleInsertion(target, attempt);
  if (!edit) return null;
  return makeSignal("spelling:insertion", target, attempt, [
    Math.min(edit.index, target.length - 1),
  ]);
}

export function classifyWholeWordVisualConfusion(
  targetRaw: string,
  attemptRaw: string,
): SingleAttemptErrorSignal | null {
  const target = normalize(targetRaw);
  const attempt = normalize(attemptRaw);
  if (!target || !attempt || target === attempt) return null;
  if (target.length !== attempt.length) return null;
  if (target.length < 3 || target.length > 8) return null;

  const diffs: number[] = [];
  for (let i = 0; i < target.length; i++) {
    if (target[i] !== attempt[i]) diffs.push(i);
  }
  if (diffs.length < Math.max(2, Math.ceil(target.length * 0.6))) return null;
  if (!sameVisualShape(target, attempt)) return null;
  return makeSignal(
    "spelling:whole_word_visual_confusion",
    target,
    attempt,
    Array.from({ length: target.length }, (_, i) => i),
  );
}

export function classifyInitialConsonantBlendOmission(
  targetRaw: string,
  attemptRaw: string,
): SingleAttemptErrorSignal | null {
  const target = normalize(targetRaw);
  const attempt = normalize(attemptRaw);
  if (!target || !attempt || target === attempt) return null;
  if (target.length < 3) return null;
  if (!isConsonant(target[0]!) || !isConsonant(target[1]!)) return null;
  if (attempt === target.slice(1)) {
    return makeSignal("spelling:initial_consonant_blend_omission", target, attempt, [0]);
  }
  if (attempt === target[0] + target.slice(2)) {
    return makeSignal("spelling:initial_consonant_blend_omission", target, attempt, [1]);
  }
  return null;
}

const SPELLING_CLASSIFIER_PRIORITY = [
  classifyInitialConsonantBlendOmission,
  classifyConsonantDoubling,
  classifyTransposition,
  classifyEndingConfusion,
  classifyVowelOmission,
  classifyVowelSubstitution,
  classifyInsertion,
  classifyWholeWordVisualConfusion,
];

export function classifySpellingError(
  target: string,
  attempt: string,
): SingleAttemptErrorSignal | null {
  for (const classify of SPELLING_CLASSIFIER_PRIORITY) {
    const signal = classify(target, attempt);
    if (signal) return signal;
  }
  return null;
}

export const spellingDomainClassifier: DomainClassifier = {
  domain: "spelling",
  classify: classifySpellingError,
};
