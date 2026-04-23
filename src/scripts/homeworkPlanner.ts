/**
 * Homework planning functions — owned by the Psychologist (sunny:sync).
 * Moved here from ingestHomework.ts. Ingestion no longer calls these.
 */
import type { ChildProfile } from "../shared/childProfile";
import type { LearningProfile } from "../context/schemas/learningProfile";
import { readWordBank } from "../utils/wordBankIO";

export type HomeworkWordConfidence = {
  word: string;
  confidence: number;
  repetitions: number;
  previouslyStruggled: boolean;
};

export type HomeworkAlgorithmSummary = {
  wilsonStep: number | "unknown";
  attentionWindow_ms: number;
  wordConfidence: HomeworkWordConfidence[];
  recentAccuracy: number[];
  averageAccuracy: number | null;
  sessionsAbove80: number;
};

export function buildHomeworkAlgorithmSummary(
  childId: string,
  homeworkWords: string[],
  lp: LearningProfile | null,
  profile: ChildProfile,
): HomeworkAlgorithmSummary {
  const bank = readWordBank(childId);
  const wordConfidence = homeworkWords.map((raw) => {
    const word = String(raw ?? "").trim();
    const lower = word.toLowerCase();
    const entry = bank.words.find((w) => w.word.toLowerCase() === lower);
    const st = entry?.tracks?.spelling;
    const confidence = st?.easinessFactor ?? 2.5;
    const repetitions = st?.repetition ?? 0;
    return {
      word,
      confidence,
      repetitions,
      previouslyStruggled: repetitions > 0 && confidence < 2.0,
    };
  });
  const ss = lp?.sessionStats;
  const extended = ss as
    | (NonNullable<typeof ss> & {
        recentAccuracy?: unknown;
        sessionsAbove80?: unknown;
      })
    | undefined;
  const raRaw = extended?.recentAccuracy;
  const recentAccuracy = Array.isArray(raRaw)
    ? raRaw.filter((x): x is number => typeof x === "number")
    : [];
  const sessionsAbove80 =
    typeof extended?.sessionsAbove80 === "number" ? extended.sessionsAbove80 : 0;
  const ws = ss?.currentWilsonStep;
  return {
    wilsonStep: typeof ws === "number" ? ws : "unknown",
    attentionWindow_ms: profile.attentionWindow_ms,
    wordConfidence,
    recentAccuracy,
    averageAccuracy: ss?.averageAccuracy ?? null,
    sessionsAbove80,
  };
}

const NODE_PLAN_JSON_RULES = `RULES FOR spelling_test TYPE:
  - Every node practices ALL words — never split words
    across nodes. Each node gets the full word list.
  - spell-check node is MANDATORY for spelling_test
    (baseline, gameFile: spell-check.html).
  - spell-check goes FIRST — it establishes a baseline
    before practice begins.
  - Order for spelling_test MUST be:
    1. spell-check  (baseline, static HTML)
    2. pronunciation (React component)
    3. karaoke      (React story / reading component; type key stays "karaoke")
    4. word-builder (template)
    5. quest        (MANDATORY — AI-generated dynamic game)
    6. boss         (AI with --opus only; always last)
  - quest is mandatory for spelling_test alongside templates.
  - All nodes get the complete word list in the
    'words' field — not a subset.
  - difficulty: 1 if 4+ days until test,
               2 if 2-3 days, 3 if 1 day

RULES FOR ALL TYPES:
  - boss is always last, always isCastle: true,
    always gameFile: null until --opus generates it
  - Only use quest when NO existing template fits (non-spelling_test)
  - max nodes = 6 for spelling_test, max nodes = 5 otherwise
  - Include a 'rationale' field on each node explaining in one sentence why this node type was chosen for this specific homework type and child profile.

Return JSON only:
{
  "nodes": [{
    "id": string,
    "type": "spell-check"|"pronunciation"|"karaoke"|"word-builder"|"quest"|"boss",
    "words": string[],
    "difficulty": 1|2|3,
    "gameFile": null,
    "storyFile": null,
    "rationale": string
  }]
}`;

/** Full user message for the Sonnet homework node planner. */
export function buildPsychologistHomeworkPlanUserMessage(args: {
  algorithmSummary: HomeworkAlgorithmSummary;
  tutoringContext: string | null;
  sessionNotes: string[];
  priorReasoning: string | null;
  extraction: {
    title: string;
    type: string;
    gradeLevel: number;
    testDate: string | null;
    words: string[];
    questions: unknown[];
  };
  testDate: string;
  daysUntilTest: number;
}): string {
  const AVAILABLE_TOOLS = "";
  const {
    algorithmSummary,
    tutoringContext,
    sessionNotes,
    priorReasoning,
    extraction,
    testDate,
    daysUntilTest,
  } = args;
  const struggledWordsLine =
    algorithmSummary.wordConfidence
      .filter((w) => w.previouslyStruggled)
      .map((w) => w.word)
      .join(", ") || "none on record yet";

  return `You are planning a homework practice session.
Your goal is not task completion.
Your goal is CHILD INDEPENDENCE:
the child should eventually complete their
schoolwork without adult supervision.
Every session moves them one step closer.

${AVAILABLE_TOOLS}

ALGORITHM FEEDBACK (source of truth — trust this):
${JSON.stringify(algorithmSummary, null, 2)}

Words this child has previously struggled with
(easeFactor < 2.0 in SM-2):
${struggledWordsLine}

${
  tutoringContext
    ? `
HUMAN TUTOR SESSION (read carefully):
${tutoringContext}

Cross-reference: words tutor covered vs words
algorithm flags as weak. If tutor covered a word
AND SM-2 shows it as struggled → high priority.
If tutor covered a word and SM-2 shows mastered →
do not over-practice, move on.
`
    : "No tutor session on record."
}

RECENT SESSION NOTES (last 3 sessions):
${sessionNotes.join("\n---\n") || "No session notes yet."}

${
  priorReasoning
    ? `
PRIOR ASSUMPTIONS (from last session plan):
${priorReasoning}

CRITICAL: Review what was assumed last time.
Were those assumptions validated by the data above?
State explicitly in your rationale:
  - Which assumptions proved correct
  - Which assumptions proved wrong
  - What you are changing based on this evidence
`
    : "No prior session plan to review."
}

TODAY'S HOMEWORK:
${JSON.stringify(extraction, null, 2)}
Test date: ${testDate} (${daysUntilTest} days away)

INDEPENDENCE PROGRESSION:
Ask yourself: if this child practiced these nodes,
would they be MORE able to do their spelling homework
independently next week? Design for that outcome.
Not for a perfect session score.

${AVAILABLE_TOOLS}

Return node plan as JSON with rationale per node.

${NODE_PLAN_JSON_RULES}`;
}
