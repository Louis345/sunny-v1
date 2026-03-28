/**
 * Guards for worksheet turns — keep grading aligned with what a child actually meant
 * (echoes and clarification are not answer attempts).
 */

const CLARIFICATION_ONLY = [
  /\bwhich one\b/i,
  /\bwhich two\b/i,
  /\bwho are we talking about\b/i,
  /\bwhat do you mean\b/i,
  /\bwhat problem\b/i,
  /\bwhich problem\b/i,
  /\b(is that|was that) right\b/i,
  /\bwait\b.*\bright\b/i,
  /\bdouble check\b/i,
  /** Standalone acknowledgements only — not "Yeah, so I counted..." */
  /^[\s]*(yeah|yep|yes|okay|ok)([.!,]|\s)*$/i,
  /^[\s]*(uh+|um+)\b[.!,]*$/i,
];

function normWords(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAmountLikeContent(transcript: string): boolean {
  const t = transcript.toLowerCase();
  if (/\d/.test(t)) return true;
  if (
    /\b(cent|cents|penny|pennies|nickel|dime|quarter|quarters|dollar)\b/.test(t)
  ) {
    return true;
  }
  /** Exclude bare "one"/"two" — they appear in ordinary English ("two children") and break echo detection. */
  const strongNumberWords =
    /\b(zero|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/;
  if (strongNumberWords.test(t)) return true;
  if (!/\b(one|two)\b/.test(t)) return false;
  return (
    /\b(one|two)\b.*\b(cent|cents|dime|nickel|quarter|penny|pennies|dollar)\b/.test(
      t,
    ) ||
    /\b(one|two)\b.*\d/.test(t) ||
    /\d.*\b(one|two)\b/.test(t)
  );
}

/**
 * True if the child is mostly repeating the spoken question (not giving an answer).
 */
export function isLikelyQuestionEcho(
  transcript: string,
  spokenQuestion: string,
): boolean {
  const t = normWords(transcript);
  const q = normWords(spokenQuestion);
  if (!t || !q || q.length < 12) return false;

  if (t === q) return true;

  const longer = t.length >= q.length ? t : q;
  const shorter = t.length >= q.length ? q : t;
  if (longer.includes(shorter) && shorter.length >= q.length * 0.88) {
    return true;
  }

  const qWords = q.split(" ").filter((w) => w.length > 1);
  if (qWords.length < 4) return false;
  let qi = 0;
  for (const w of t.split(" ")) {
    if (w === qWords[qi]) qi++;
  }
  const coverage = qi / qWords.length;
  return coverage >= 0.88;
}

export type NonAnswerCheck = { nonAnswer: false } | { nonAnswer: true; reason: string };

/**
 * Server-side: do not treat this transcript as a worksheet answer attempt for logging.
 */
export function classifyWorksheetNonAnswerTranscript(
  transcript: string,
  spokenQuestion: string,
): NonAnswerCheck {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return { nonAnswer: true, reason: "empty_transcript" };
  }

  if (hasAmountLikeContent(trimmed)) {
    if (isLikelyQuestionEcho(trimmed, spokenQuestion)) {
      return { nonAnswer: false };
    }
  } else {
    if (isLikelyQuestionEcho(trimmed, spokenQuestion)) {
      return {
        nonAnswer: true,
        reason: "question_echo_not_answer",
      };
    }
  }

  for (const pattern of CLARIFICATION_ONLY) {
    if (pattern.test(trimmed)) {
      const t = trimmed.toLowerCase();
      if (
        hasAmountLikeContent(trimmed) &&
        (/\b(left|right|first|second|more|less|bigger|smaller)\b/.test(t) ||
          /\d/.test(t))
      ) {
        return { nonAnswer: false };
      }
      return {
        nonAnswer: true,
        reason: "clarification_or_meta_not_answer",
      };
    }
  }

  if (/^(who|what|which|how|where|when)\b/i.test(trimmed) && !hasAmountLikeContent(trimmed)) {
    const t = normWords(trimmed);
    if (t.includes("more money") || t.includes("has more") || /\bwhich\b.*\b(child|girl|student|one)\b/.test(t)) {
      return {
        nonAnswer: true,
        reason: "unanswered_question_shape",
      };
    }
  }

  return { nonAnswer: false };
}
