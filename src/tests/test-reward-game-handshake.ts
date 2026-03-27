import assert from "node:assert/strict";
import { SessionManager } from "../server/session-manager";
import { createSessionContext } from "../server/session-context";
import { buildAssignmentManifestFromWorksheetProblems } from "../server/assignment-player";

function createHarness() {
  const sent: Array<Record<string, unknown>> = [];
  const fakeWs = {
    OPEN: 1,
    readyState: 1,
    send: (raw: string) => {
      sent.push(JSON.parse(raw) as Record<string, unknown>);
    },
  };

  const manager = new SessionManager(fakeWs as never, "Reina") as unknown as {
    ctx: ReturnType<typeof createSessionContext> | null;
    handleToolCall: (
      tool: string,
      args: Record<string, unknown>,
      result: unknown,
    ) => void;
    handleGameEvent: (event: Record<string, unknown>) => void;
  };

  manager.ctx = createSessionContext({
    childName: "Reina",
    sessionType: "freeform",
    companionName: "Matilda",
  });

  return { sent, manager };
}

function forwardedStarts(sent: Array<Record<string, unknown>>) {
  return sent.filter((msg) => {
    if (msg.type !== "game_message") return false;
    const forward = msg.forward as Record<string, unknown> | undefined;
    return forward?.type === "start";
  });
}

function testRewardGameRetriesStartAfterReady(): void {
  const { sent, manager } = createHarness();

  manager.handleToolCall(
    "launchGame",
    { name: "space-invaders", type: "reward" },
    {
      ok: true,
      requestedName: "space-invaders",
      canonicalName: "space-invaders",
      type: "reward",
      availableGames: ["space-invaders"],
    },
  );

  const beforeReady = forwardedStarts(sent);
  assert.equal(beforeReady.length, 1, "launch should emit one initial start message");

  manager.handleGameEvent({ type: "ready" });

  const afterReady = forwardedStarts(sent);
  assert.equal(
    afterReady.length,
    2,
    "reward game should resend start after iframe ready so startup cannot be lost",
  );
}

function testRewardGameStartCarriesCompanionName(): void {
  const { sent, manager } = createHarness();

  manager.handleToolCall(
    "launchGame",
    { name: "space-invaders", type: "reward" },
    {
      ok: true,
      requestedName: "space-invaders",
      canonicalName: "space-invaders",
      type: "reward",
      availableGames: ["space-invaders"],
    },
  );

  const start = forwardedStarts(sent)[0];
  const forward = start?.forward as Record<string, unknown> | undefined;
  assert.equal(
    forward?.companionName,
    "Matilda",
    "reward game start payload should include the live companion name",
  );
}

async function testPendingEndRewardLaunchesBeforeSessionEnds(): Promise<void> {
  const { sent, manager } = createHarness();
  (
    manager as unknown as {
      pendingEndSessionReward: boolean;
      end: () => Promise<void>;
    }
  ).pendingEndSessionReward = true;

  await (manager as unknown as { end: () => Promise<void> }).end();

  const drewRewardCanvas = sent.some((msg) => msg.type === "canvas_draw");
  const endedImmediately = sent.some((msg) => msg.type === "session_ended");
  assert.equal(drewRewardCanvas, true, "ending should launch reward canvas first");
  assert.equal(endedImmediately, false, "ending should defer session_ended until reward completes");
}

async function testWorksheetInstructionalGameResumesSameProblem(): Promise<void> {
  const { sent, manager } = createHarness();
  const inner = manager as unknown as {
    ctx: ReturnType<typeof createSessionContext> | null;
    worksheetMode: boolean;
    worksheetProblems: Array<{
      id: number;
      kind: "money_count";
      question: string;
      instructions: string[];
      hint: string;
      canonicalAnswer: string;
      itemLabel: string;
      itemPriceCents: number;
      totalSpentCents: number;
      sourceAnswer: string;
      sourceCanvasDisplay: string;
    }>;
    worksheetProblemIndex: number;
    assignmentManifest: ReturnType<typeof buildAssignmentManifestFromWorksheetProblems> | null;
    worksheetPlayerState: {
      activeProblemId: string;
      currentPage: number;
      activeFieldId?: string;
      pdfAssetUrl: string;
      overlayFields: Array<Record<string, unknown>>;
    } | null;
    presentCurrentWorksheetProblem: () => Promise<void>;
    setActiveCanvasActivity: (mode: "worksheet") => void;
    handleGameEvent: (event: Record<string, unknown>) => void;
    handleToolCall: (
      tool: string,
      args: Record<string, unknown>,
      result: unknown,
    ) => void;
  };

  inner.worksheetMode = true;
  inner.worksheetProblems = [
    {
      id: 2,
      kind: "money_count",
      question: "I spent 35 cents. How many cookies did I buy?",
      instructions: [],
      hint: "Each cookie costs 10 cents.",
      canonicalAnswer: "3",
      itemLabel: "Cookie",
      itemPriceCents: 10,
      totalSpentCents: 35,
      sourceAnswer: "3",
      sourceCanvasDisplay: "Cookie shop. Cookie 10¢. Total spent 35¢.",
    },
  ];
  inner.worksheetProblemIndex = 0;
  inner.assignmentManifest = buildAssignmentManifestFromWorksheetProblems({
    assignmentId: "reina-worksheet",
    childName: "Reina",
    title: "Worksheet",
    createdAt: new Date().toISOString(),
    pdfAssetUrl: "/api/homework/Reina/2026-03-26/fresh.pdf",
    problems: inner.worksheetProblems,
  });
  inner.worksheetPlayerState = {
    activeProblemId: "2",
    currentPage: 1,
    activeFieldId: "2-answer",
    pdfAssetUrl: inner.assignmentManifest.pdfAssetUrl,
    overlayFields: inner.assignmentManifest.problems[0].overlayFields,
  };
  inner.setActiveCanvasActivity("worksheet");
  await inner.presentCurrentWorksheetProblem();

  inner.handleToolCall(
    "launchGame",
    { name: "coin-counter", type: "tool" },
    {
      ok: true,
      requestedName: "coin-counter",
      canonicalName: "coin-counter",
      type: "tool",
      availableGames: ["coin-counter"],
    },
  );

  inner.handleGameEvent({ type: "game_complete" });

  const resumedWorksheet = sent.some((msg) => {
    if (msg.type !== "canvas_draw") return false;
    const mode =
      (msg.mode as string | undefined) ??
      ((msg.args as Record<string, unknown> | undefined)?.mode as string | undefined);
    const activeProblemId =
      (msg.activeProblemId as string | undefined) ??
      ((msg.args as Record<string, unknown> | undefined)?.activeProblemId as string | undefined);
    return mode === "worksheet_pdf" && activeProblemId === "2";
  });

  assert.equal(
    resumedWorksheet,
    true,
    "instructional game completion should restore the same worksheet problem",
  );
}

async function testWorksheetCompletionRetiresWorksheetState(): Promise<void> {
  const { sent, manager } = createHarness();
  const inner = manager as unknown as {
    ctx: ReturnType<typeof createSessionContext> | null;
    worksheetMode: boolean;
    worksheetReadyForAnswers: boolean;
    worksheetProblems: Array<{
      id: number;
      kind: "compare_amounts";
      question: string;
      instructions: string[];
      hint: string;
      canonicalAnswer: string;
      leftAmountCents: number;
      rightAmountCents: number;
      askVisual: "greater";
      sourceAnswer: string;
      sourceCanvasDisplay: string;
    }>;
    worksheetProblemIndex: number;
    pendingEndSessionReward: boolean;
    advanceWorksheetAfterLogAttempt: (ok: boolean) => Promise<void>;
  };

  inner.ctx = createSessionContext({
    childName: "Reina",
    sessionType: "worksheet",
    companionName: "Matilda",
    assignment: {
      childName: "Reina",
      title: "Worksheet",
      source: "worksheet_pdf",
      createdAt: new Date().toISOString(),
      questions: [
        { index: 0, text: "Who has more money?", answerType: "numeric", correctAnswer: "75" },
      ],
    },
    canvasOwner: "server",
  });
  inner.worksheetMode = true;
  inner.worksheetReadyForAnswers = true;
  inner.worksheetProblems = [
    {
      id: 1,
      kind: "compare_amounts",
      question: "Who has more money, 51 cents or 75 cents?",
      instructions: [],
      hint: "Compare the amounts.",
      canonicalAnswer: "75",
      leftAmountCents: 51,
      rightAmountCents: 75,
      askVisual: "greater",
      sourceAnswer: "75",
      sourceCanvasDisplay: "Two students with 51 cents and 75 cents.",
    },
  ];
  inner.worksheetProblemIndex = 0;

  await inner.advanceWorksheetAfterLogAttempt(true);

  assert.equal(inner.worksheetMode, false, "worksheet mode should shut down after final problem");
  assert.equal(inner.pendingEndSessionReward, true, "completion should defer reward to session end");
  assert.equal(inner.ctx?.sessionType, "freeform", "session type should leave worksheet mode after completion");
  assert.equal(inner.ctx?.assignment?.currentIndex, 1, "assignment progress should mark all questions complete");

  const drewIdleCanvas = sent.some(
    (msg) => msg.type === "canvas_draw" && msg.mode === "idle",
  );
  assert.equal(drewIdleCanvas, true, "completion should clear the worksheet canvas");
}

async function testDuplicateWorksheetTypedAndSpokenAnswerIsIgnoredOnce(): Promise<void> {
  const { manager } = createHarness();
  const inner = manager as unknown as {
    worksheetMode: boolean;
    worksheetReadyForAnswers: boolean;
    worksheetProblems: Array<{
      id: number;
      kind: "compare_amounts";
      question: string;
      instructions: string[];
      hint: string;
      canonicalAnswer: string;
      leftAmountCents: number;
      rightAmountCents: number;
      askVisual: "greater";
      sourceAnswer: string;
      sourceCanvasDisplay: string;
    }>;
    worksheetProblemIndex: number;
    assignmentManifest: ReturnType<typeof buildAssignmentManifestFromWorksheetProblems> | null;
    worksheetPlayerState: {
      activeProblemId: string;
      currentPage: number;
      activeFieldId?: string;
      interactionMode?: "review" | "answer_entry";
      pdfAssetUrl: string;
      overlayFields: Array<Record<string, unknown>>;
    } | null;
    handleEndOfTurn: (text: string) => Promise<void>;
    receiveWorksheetAnswer: (payload: {
      problemId?: string;
      fieldId?: string;
      value?: string;
    }) => void;
    tryConsumeWorksheetTurn: (transcript: string) => Promise<boolean>;
    runCompanionResponse: (text: string) => Promise<void>;
  };

  inner.worksheetMode = true;
  inner.worksheetReadyForAnswers = true;
  inner.worksheetProblems = [
    {
      id: 1,
      kind: "compare_amounts",
      question: "Who has more money, 51 cents or 75 cents?",
      instructions: [],
      hint: "Compare the amounts.",
      canonicalAnswer: "75",
      leftAmountCents: 51,
      rightAmountCents: 75,
      askVisual: "greater",
      sourceAnswer: "75",
      sourceCanvasDisplay: "Two students with 51 cents and 75 cents.",
    },
  ];
  inner.worksheetProblemIndex = 0;
  inner.assignmentManifest = buildAssignmentManifestFromWorksheetProblems({
    assignmentId: "reina-review",
    childName: "Reina",
    title: "Worksheet",
    createdAt: new Date().toISOString(),
    pdfAssetUrl: "/api/homework/Reina/2026-03-26/fresh.pdf",
    problems: inner.worksheetProblems,
  });
  inner.worksheetPlayerState = {
    activeProblemId: "1",
    currentPage: 1,
    activeFieldId: "1-answer",
    interactionMode: "answer_entry",
    pdfAssetUrl: inner.assignmentManifest.pdfAssetUrl,
    overlayFields: inner.assignmentManifest.problems[0].overlayFields,
  };

  let endTurns = 0;
  let companionRuns = 0;
  inner.handleEndOfTurn = async () => {
    endTurns++;
  };
  inner.runCompanionResponse = async () => {
    companionRuns++;
  };

  inner.receiveWorksheetAnswer({
    problemId: "1",
    fieldId: "1-answer",
    value: "75",
  });
  inner.receiveWorksheetAnswer({
    problemId: "1",
    fieldId: "1-answer",
    value: "75",
  });
  const consumed = await inner.tryConsumeWorksheetTurn("75");

  assert.equal(endTurns, 1, "duplicate typed submission should not trigger a second worksheet turn");
  assert.equal(consumed, true, "duplicate spoken answer should be swallowed as already submitted");
  assert.equal(companionRuns, 0, "duplicate spoken answer should not re-run worksheet grading");
}

async function testWorksheetClarificationReanchorsSameProblem(): Promise<void> {
  const { manager } = createHarness();
  const inner = manager as unknown as {
    worksheetMode: boolean;
    worksheetReadyForAnswers: boolean;
    worksheetProblems: Array<{
      id: number;
      kind: "compare_amounts";
      question: string;
      instructions: string[];
      hint: string;
      canonicalAnswer: string;
      leftAmountCents: number;
      rightAmountCents: number;
      askVisual: "greater";
      sourceAnswer: string;
      sourceCanvasDisplay: string;
    }>;
    worksheetProblemIndex: number;
    tryConsumeWorksheetTurn: (transcript: string) => Promise<boolean>;
    runCompanionResponse: (text: string) => Promise<void>;
    handleCompanionTurn: (text: string) => Promise<void>;
  };

  inner.worksheetMode = true;
  inner.worksheetReadyForAnswers = true;
  inner.worksheetProblems = [
    {
      id: 9,
      kind: "compare_amounts",
      question: "Who has more money between the two girls?",
      instructions: [],
      hint: "Compare the two amounts.",
      canonicalAnswer: "62",
      leftAmountCents: 62,
      rightAmountCents: 52,
      askVisual: "greater",
      sourceAnswer: "62",
      sourceCanvasDisplay: "Two girls with 62 cents and 52 cents.",
    },
  ];
  inner.worksheetProblemIndex = 0;

  let modelRuns = 0;
  let companionText = "";
  inner.runCompanionResponse = async () => {
    modelRuns++;
  };
  inner.handleCompanionTurn = async (text: string) => {
    companionText = text;
  };

  const consumed = await inner.tryConsumeWorksheetTurn("Which two girls?");

  assert.equal(consumed, true, "clarification should still be consumed by worksheet mode");
  assert.equal(modelRuns, 0, "clarification should not go back through model grading");
  assert.equal(inner.worksheetProblemIndex, 0, "clarification should stay on same worksheet problem");
  assert.equal(inner.worksheetReadyForAnswers, true, "clarification should leave worksheet ready for the real answer");
  assert.match(companionText, /62/i, "clarification re-anchor should restate the current worksheet amounts");
  assert.match(companionText, /52/i, "clarification re-anchor should stay grounded in the same problem");
}

async function testWorksheetCorrectTurnUsesServerOwnedOutcome(): Promise<void> {
  const { manager } = createHarness();
  const inner = manager as unknown as {
    worksheetMode: boolean;
    worksheetReadyForAnswers: boolean;
    worksheetProblems: Array<{
      id: number;
      kind: "compare_amounts";
      question: string;
      instructions: string[];
      hint: string;
      canonicalAnswer: string;
      leftAmountCents: number;
      rightAmountCents: number;
      askVisual: "greater";
      sourceAnswer: string;
      sourceCanvasDisplay: string;
    }>;
    worksheetProblemIndex: number;
    tryConsumeWorksheetTurn: (transcript: string) => Promise<boolean>;
    runCompanionResponse: (text: string) => Promise<void>;
    handleCompanionTurn: (text: string) => Promise<void>;
    presentCurrentWorksheetProblem: () => Promise<void>;
  };

  inner.worksheetMode = true;
  inner.worksheetReadyForAnswers = true;
  inner.worksheetProblems = [
    {
      id: 1,
      kind: "compare_amounts",
      question: "Who has more money, 51 cents or 75 cents?",
      instructions: [],
      hint: "Compare the amounts.",
      canonicalAnswer: "75",
      leftAmountCents: 51,
      rightAmountCents: 75,
      askVisual: "greater",
      sourceAnswer: "75",
      sourceCanvasDisplay: "Two students with 51 cents and 75 cents.",
    },
    {
      id: 2,
      kind: "compare_amounts",
      question: "Who has more money, 62 cents or 52 cents?",
      instructions: [],
      hint: "Compare the amounts.",
      canonicalAnswer: "62",
      leftAmountCents: 62,
      rightAmountCents: 52,
      askVisual: "greater",
      sourceAnswer: "62",
      sourceCanvasDisplay: "Two students with 62 cents and 52 cents.",
    },
  ];
  inner.worksheetProblemIndex = 0;

  let modelRuns = 0;
  let nextProblemShown = 0;
  inner.runCompanionResponse = async () => {
    modelRuns++;
  };
  inner.handleCompanionTurn = async () => {};
  inner.presentCurrentWorksheetProblem = async () => {
    nextProblemShown++;
  };

  const consumed = await inner.tryConsumeWorksheetTurn("Seventy five cents");

  assert.equal(consumed, true, "spoken worksheet answer should be consumed");
  assert.equal(modelRuns, 0, "worksheet answer should not depend on model logWorksheetAttempt");
  assert.equal(inner.worksheetProblemIndex, 1, "server-owned worksheet outcome should advance after a correct answer");
  assert.equal(nextProblemShown, 1, "server should present the next problem directly");
}

function testBlockedStaleWorksheetToolCallDoesNotQueueProgress(): void {
  const { manager } = createHarness();
  const inner = manager as unknown as {
    ctx: ReturnType<typeof createSessionContext> | null;
    worksheetMode: boolean;
    worksheetProblems: Array<{
      id: number;
      kind: "compare_amounts";
      question: string;
      instructions: string[];
      hint: string;
      canonicalAnswer: string;
      leftAmountCents: number;
      rightAmountCents: number;
      askVisual: "greater";
      sourceAnswer: string;
      sourceCanvasDisplay: string;
    }>;
    worksheetProblemIndex: number;
    worksheetTurnTranscript: string;
    pendingWorksheetLog: { ok: boolean } | null;
    lastWorksheetTurnOutcome: string | null;
  };

  inner.ctx = createSessionContext({
    childName: "Reina",
    sessionType: "worksheet",
    companionName: "Matilda",
    assignment: {
      childName: "Reina",
      title: "Worksheet",
      source: "worksheet_pdf",
      createdAt: new Date().toISOString(),
      questions: [
        { index: 0, text: "Who has more money?", answerType: "numeric", correctAnswer: "62" },
      ],
    },
    canvasOwner: "server",
  });
  inner.worksheetMode = true;
  inner.worksheetProblems = [
    {
      id: 9,
      kind: "compare_amounts",
      question: "Who has more money between the two girls?",
      instructions: [],
      hint: "Compare the two amounts.",
      canonicalAnswer: "62",
      leftAmountCents: 62,
      rightAmountCents: 52,
      askVisual: "greater",
      sourceAnswer: "62",
      sourceCanvasDisplay: "Two girls with 62 cents and 52 cents.",
    },
  ];
  inner.worksheetProblemIndex = 0;
  inner.worksheetTurnTranscript = "Which two girls?";
  inner.pendingWorksheetLog = null;

  manager.handleToolCall(
    "logWorksheetAttempt",
    {
      childName: "Reina",
      problemId: "1",
      correct: true,
      childSaid: "Sixty two cents",
      expectedAnswer: "62",
    },
    { logged: false, correct: true, skipped: "stateless demo/test mode" },
  );

  assert.equal(inner.pendingWorksheetLog, null, "blocked stale tool call should not queue worksheet progression");
  assert.equal(inner.worksheetProblemIndex, 0, "blocked stale tool call should stay on same worksheet problem");
  assert.equal(inner.lastWorksheetTurnOutcome, "blocked_stale", "blocked stale tool call should be tracked explicitly");
}

async function testWorksheetCarryoverFragmentIsIgnoredAfterAdvance(): Promise<void> {
  const { manager } = createHarness();
  const inner = manager as unknown as {
    worksheetMode: boolean;
    worksheetReadyForAnswers: boolean;
    worksheetProblems: Array<{
      id: number;
      kind: "compare_amounts";
      question: string;
      instructions: string[];
      hint: string;
      canonicalAnswer: string;
      leftAmountCents: number;
      rightAmountCents: number;
      askVisual: "greater";
      sourceAnswer: string;
      sourceCanvasDisplay: string;
    }>;
    worksheetProblemIndex: number;
    worksheetWrongForCurrent: number;
    handleEndOfTurn: (text: string) => Promise<void>;
    handleCompanionTurn: (text: string) => Promise<void>;
    presentCurrentWorksheetProblem: () => Promise<void>;
  };

  inner.worksheetMode = true;
  inner.worksheetReadyForAnswers = true;
  inner.worksheetProblems = [
    {
      id: 1,
      kind: "compare_amounts",
      question: "Who has more money, 51 cents or 75 cents?",
      instructions: [],
      hint: "Compare the amounts.",
      canonicalAnswer: "75",
      leftAmountCents: 51,
      rightAmountCents: 75,
      askVisual: "greater",
      sourceAnswer: "75",
      sourceCanvasDisplay: "Two students with 51 cents and 75 cents.",
    },
    {
      id: 3,
      kind: "compare_amounts",
      question: "Who has more money, 62 cents or 52 cents?",
      instructions: [],
      hint: "Compare the amounts.",
      canonicalAnswer: "62",
      leftAmountCents: 62,
      rightAmountCents: 52,
      askVisual: "greater",
      sourceAnswer: "62",
      sourceCanvasDisplay: "Two students with 62 cents and 52 cents.",
    },
  ];
  inner.worksheetProblemIndex = 0;

  let companionTurns = 0;
  let nextProblemShown = 0;
  inner.handleCompanionTurn = async () => {
    companionTurns++;
  };
  inner.presentCurrentWorksheetProblem = async () => {
    nextProblemShown++;
    inner.worksheetReadyForAnswers = true;
  };

  await inner.handleEndOfTurn("Seventy five is bigger than fifty one.");
  await inner.handleEndOfTurn("than fifty one.");

  assert.equal(inner.worksheetProblemIndex, 1, "carryover fragment should not advance or rewind the worksheet");
  assert.equal(inner.worksheetWrongForCurrent, 0, "carryover fragment should not count as a wrong attempt on the new problem");
  assert.equal(nextProblemShown, 1, "only the real correct answer should advance to the next problem");
  assert.equal(companionTurns, 1, "carryover fragment should not trigger another worksheet response");
}

async function testWorksheetPreviousAnswerRepeatIsIgnoredAfterAdvance(): Promise<void> {
  const { manager } = createHarness();
  const inner = manager as unknown as {
    worksheetMode: boolean;
    worksheetReadyForAnswers: boolean;
    worksheetProblems: Array<{
      id: number;
      kind: "compare_amounts";
      question: string;
      instructions: string[];
      hint: string;
      canonicalAnswer: string;
      leftAmountCents: number;
      rightAmountCents: number;
      askVisual: "greater";
      sourceAnswer: string;
      sourceCanvasDisplay: string;
    }>;
    worksheetProblemIndex: number;
    worksheetWrongForCurrent: number;
    handleEndOfTurn: (text: string) => Promise<void>;
    handleCompanionTurn: (text: string) => Promise<void>;
    presentCurrentWorksheetProblem: () => Promise<void>;
  };

  inner.worksheetMode = true;
  inner.worksheetReadyForAnswers = true;
  inner.worksheetProblems = [
    {
      id: 1,
      kind: "compare_amounts",
      question: "Who has more money, 51 cents or 75 cents?",
      instructions: [],
      hint: "Compare the amounts.",
      canonicalAnswer: "75",
      leftAmountCents: 51,
      rightAmountCents: 75,
      askVisual: "greater",
      sourceAnswer: "75",
      sourceCanvasDisplay: "Two students with 51 cents and 75 cents.",
    },
    {
      id: 2,
      kind: "compare_amounts",
      question: "Who has more money, $1.18 or $1.55?",
      instructions: [],
      hint: "Compare the amounts.",
      canonicalAnswer: "155",
      leftAmountCents: 118,
      rightAmountCents: 155,
      askVisual: "greater",
      sourceAnswer: "155",
      sourceCanvasDisplay: "Two students with $1.18 and $1.55.",
    },
  ];
  inner.worksheetProblemIndex = 0;

  let companionTurns = 0;
  inner.handleCompanionTurn = async () => {
    companionTurns++;
  };
  inner.presentCurrentWorksheetProblem = async () => {
    inner.worksheetReadyForAnswers = true;
  };

  await inner.handleEndOfTurn("Seventy five.");
  await inner.handleEndOfTurn("seventy five seventy five");

  assert.equal(inner.worksheetProblemIndex, 1, "repeated previous answer should not move past the next problem");
  assert.equal(inner.worksheetWrongForCurrent, 0, "repeated previous answer should be ignored instead of counted wrong on the new problem");
  assert.equal(companionTurns, 1, "repeated previous answer should not trigger another worksheet correction prompt");
}

async function testWorksheetCompletionCarryoverFragmentIsIgnored(): Promise<void> {
  const { manager } = createHarness();
  const inner = manager as unknown as {
    worksheetMode: boolean;
    worksheetReadyForAnswers: boolean;
    worksheetProblems: Array<{
      id: number;
      kind: "compare_amounts";
      question: string;
      instructions: string[];
      hint: string;
      canonicalAnswer: string;
      leftAmountCents: number;
      rightAmountCents: number;
      askVisual: "greater";
      sourceAnswer: string;
      sourceCanvasDisplay: string;
    }>;
    worksheetProblemIndex: number;
    handleEndOfTurn: (text: string) => Promise<void>;
    handleCompanionTurn: (text: string) => Promise<void>;
    runCompanionResponse: (text: string) => Promise<void>;
  };

  inner.worksheetMode = true;
  inner.worksheetReadyForAnswers = true;
  inner.worksheetProblems = [
    {
      id: 4,
      kind: "compare_amounts",
      question: "Who has more money, 75 cents or 65 cents?",
      instructions: [],
      hint: "Compare the amounts.",
      canonicalAnswer: "75",
      leftAmountCents: 75,
      rightAmountCents: 65,
      askVisual: "greater",
      sourceAnswer: "75",
      sourceCanvasDisplay: "Two students with 75 cents and 65 cents.",
    },
  ];
  inner.worksheetProblemIndex = 0;

  let modelRuns = 0;
  inner.handleCompanionTurn = async () => {};
  inner.runCompanionResponse = async () => {
    modelRuns++;
  };

  await inner.handleEndOfTurn("Seventy five cents is bigger.");
  await inner.handleEndOfTurn("Seventy five cents is bigger is bigger.");

  assert.equal(inner.worksheetMode, false, "final correct answer should still retire worksheet mode");
  assert.equal(modelRuns, 0, "carryover after worksheet completion should not fall through to freeform companion praise");
}

async function testReviewModeDoesNotAutoAdvanceAfterThreeWrongAnswers(): Promise<void> {
  const { manager } = createHarness();
  const inner = manager as unknown as {
    worksheetMode: boolean;
    worksheetReadyForAnswers: boolean;
    worksheetInteractionMode: "review" | "answer_entry";
    worksheetProblems: Array<{
      id: number;
      kind: "compare_amounts";
      question: string;
      instructions: string[];
      hint: string;
      canonicalAnswer: string;
      leftAmountCents: number;
      rightAmountCents: number;
      askVisual: "greater";
      sourceAnswer: string;
      sourceCanvasDisplay: string;
    }>;
    worksheetProblemIndex: number;
    worksheetWrongForCurrent: number;
    advanceWorksheetAfterLogAttempt: (ok: boolean) => Promise<void>;
    handleCompanionTurn: (text: string) => Promise<void>;
  };

  inner.worksheetMode = true;
  inner.worksheetReadyForAnswers = true;
  inner.worksheetInteractionMode = "review";
  inner.worksheetProblems = [
    {
      id: 3,
      kind: "compare_amounts",
      question: "Who has more money, 62 cents or 52 cents?",
      instructions: [],
      hint: "Compare the amounts.",
      canonicalAnswer: "62",
      leftAmountCents: 62,
      rightAmountCents: 52,
      askVisual: "greater",
      sourceAnswer: "62",
      sourceCanvasDisplay: "Two students with 62 cents and 52 cents.",
    },
    {
      id: 4,
      kind: "compare_amounts",
      question: "Who has more money, 75 cents or 65 cents?",
      instructions: [],
      hint: "Compare the amounts.",
      canonicalAnswer: "75",
      leftAmountCents: 75,
      rightAmountCents: 65,
      askVisual: "greater",
      sourceAnswer: "75",
      sourceCanvasDisplay: "Two students with 75 cents and 65 cents.",
    },
  ];
  inner.worksheetProblemIndex = 0;

  let companionText = "";
  inner.handleCompanionTurn = async (text: string) => {
    companionText = text;
  };

  await inner.advanceWorksheetAfterLogAttempt(false);
  await inner.advanceWorksheetAfterLogAttempt(false);
  await inner.advanceWorksheetAfterLogAttempt(false);

  assert.equal(inner.worksheetProblemIndex, 0, "review mode should not auto-advance after three wrong answers");
  assert.equal(inner.worksheetWrongForCurrent, 0, "review mode should reset wrong count after a reveal/re-anchor");
  assert.match(companionText, /62|stay|same problem|look closely/i, "review mode should re-anchor instead of silently moving on");
}

async function testInstructionalGameClaimNeedsStructuredCompletion(): Promise<void> {
  const { manager } = createHarness();
  const inner = manager as unknown as {
    handleCompanionTurn: (text: string) => Promise<void>;
    handleEndOfTurn: (text: string) => Promise<void>;
    runCompanionResponse: (text: string) => Promise<void>;
  };

  manager.handleToolCall(
    "launchGame",
    { name: "store-game", type: "tool" },
    {
      ok: true,
      requestedName: "store-game",
      canonicalName: "store-game",
      type: "tool",
      availableGames: ["bd-reversal", "coin-counter", "spell-check", "store-game", "word-builder"],
    },
  );

  let modelRuns = 0;
  let companionText = "";
  inner.runCompanionResponse = async () => {
    modelRuns++;
  };
  inner.handleCompanionTurn = async (text: string) => {
    companionText = text;
  };

  await inner.handleEndOfTurn("I did it.");

  assert.equal(modelRuns, 0, "instructional game success should not be praised before a structured completion event");
  assert.match(companionText, /complete|finish|game/i, "server should ask for game-confirmed completion instead of freeform praise");
}

async function testWorksheetCompletionLaunchesInstructionalGameBeforeReward(): Promise<void> {
  const { sent, manager } = createHarness();
  const inner = manager as unknown as {
    ctx: ReturnType<typeof createSessionContext> | null;
    worksheetMode: boolean;
    worksheetReadyForAnswers: boolean;
    worksheetProblems: Array<{
      id: number;
      kind: "compare_amounts";
      question: string;
      instructions: string[];
      hint: string;
      canonicalAnswer: string;
      leftAmountCents: number;
      rightAmountCents: number;
      askVisual: "greater";
      sourceAnswer: string;
      sourceCanvasDisplay: string;
    }>;
    worksheetProblemIndex: number;
    worksheetSubjectLabel: string;
    assignmentManifest: ReturnType<typeof buildAssignmentManifestFromWorksheetProblems> | null;
    pendingEndSessionReward: boolean;
    advanceWorksheetAfterLogAttempt: (ok: boolean) => Promise<void>;
  };

  inner.ctx = createSessionContext({
    childName: "Reina",
    sessionType: "worksheet",
    companionName: "Matilda",
    assignment: {
      childName: "Reina",
      title: "Worksheet",
      source: "worksheet_pdf",
      createdAt: new Date().toISOString(),
      questions: [
        { index: 0, text: "Who has more money?", answerType: "numeric", correctAnswer: "75" },
      ],
    },
    canvasOwner: "server",
  });
  inner.worksheetMode = true;
  inner.worksheetReadyForAnswers = true;
  inner.worksheetSubjectLabel = "money counting and comparison";
  inner.worksheetProblems = [
    {
      id: 1,
      kind: "compare_amounts",
      question: "Who has more money, 51 cents or 75 cents?",
      instructions: [],
      hint: "Compare the amounts.",
      canonicalAnswer: "75",
      leftAmountCents: 51,
      rightAmountCents: 75,
      askVisual: "greater",
      sourceAnswer: "75",
      sourceCanvasDisplay: "Two students with 51 cents and 75 cents.",
    },
  ];
  inner.assignmentManifest = buildAssignmentManifestFromWorksheetProblems({
    assignmentId: "reina-arc",
    childName: "Reina",
    title: "Worksheet",
    createdAt: new Date().toISOString(),
    pdfAssetUrl: "/api/homework/Reina/2026-03-26/review.pdf",
    problems: inner.worksheetProblems,
  });
  inner.worksheetProblemIndex = 0;

  await inner.advanceWorksheetAfterLogAttempt(true);

  const launchedStoreGame = sent.some((msg) => msg.type === "canvas_draw" && msg.mode === "store-game");
  const launchedReward = sent.some((msg) => msg.type === "canvas_draw" && msg.mode === "space-invaders");

  assert.equal(inner.worksheetMode, false, "worksheet should retire before the instructional game arc");
  assert.equal(inner.pendingEndSessionReward, false, "instructional game should happen before reward is queued");
  assert.equal(launchedStoreGame, true, "worksheet completion should launch store-game first for money practice");
  assert.equal(launchedReward, false, "reward should not launch immediately after worksheet completion");
}

async function testInstructionalGameCompletionAsksFollowupsBeforeReward(): Promise<void> {
  const { sent, manager } = createHarness();
  const inner = manager as unknown as {
    ctx: ReturnType<typeof createSessionContext> | null;
    worksheetMode: boolean;
    worksheetReadyForAnswers: boolean;
    worksheetProblems: Array<{
      id: number;
      kind: "compare_amounts";
      question: string;
      instructions: string[];
      hint: string;
      canonicalAnswer: string;
      leftAmountCents: number;
      rightAmountCents: number;
      askVisual: "greater";
      sourceAnswer: string;
      sourceCanvasDisplay: string;
    }>;
    worksheetProblemIndex: number;
    worksheetSubjectLabel: string;
    assignmentManifest: ReturnType<typeof buildAssignmentManifestFromWorksheetProblems> | null;
    advanceWorksheetAfterLogAttempt: (ok: boolean) => Promise<void>;
    handleGameEvent: (event: Record<string, unknown>) => void;
    handleEndOfTurn: (text: string) => Promise<void>;
    handleCompanionTurn: (text: string) => Promise<void>;
    runCompanionResponse: (text: string) => Promise<void>;
  };

  inner.ctx = createSessionContext({
    childName: "Reina",
    sessionType: "worksheet",
    companionName: "Matilda",
    assignment: {
      childName: "Reina",
      title: "Worksheet",
      source: "worksheet_pdf",
      createdAt: new Date().toISOString(),
      questions: [
        { index: 0, text: "Who has more money?", answerType: "numeric", correctAnswer: "75" },
      ],
    },
    canvasOwner: "server",
  });
  inner.worksheetMode = true;
  inner.worksheetReadyForAnswers = true;
  inner.worksheetSubjectLabel = "money counting and comparison";
  inner.worksheetProblems = [
    {
      id: 1,
      kind: "compare_amounts",
      question: "Who has more money, 51 cents or 75 cents?",
      instructions: [],
      hint: "Compare the amounts.",
      canonicalAnswer: "75",
      leftAmountCents: 51,
      rightAmountCents: 75,
      askVisual: "greater",
      sourceAnswer: "75",
      sourceCanvasDisplay: "Two students with 51 cents and 75 cents.",
    },
  ];
  inner.assignmentManifest = buildAssignmentManifestFromWorksheetProblems({
    assignmentId: "reina-arc",
    childName: "Reina",
    title: "Worksheet",
    createdAt: new Date().toISOString(),
    pdfAssetUrl: "/api/homework/Reina/2026-03-26/review.pdf",
    problems: inner.worksheetProblems,
  });
  inner.worksheetProblemIndex = 0;

  const prompts: string[] = [];
  let modelRuns = 0;
  inner.handleCompanionTurn = async (text: string) => {
    prompts.push(text);
  };
  inner.runCompanionResponse = async () => {
    modelRuns++;
  };

  await inner.advanceWorksheetAfterLogAttempt(true);
  inner.handleGameEvent({ type: "game_complete" });
  await new Promise((resolve) => setImmediate(resolve));
  await inner.handleEndOfTurn("I had to compare the prices.");
  await inner.handleEndOfTurn("75 cents is bigger than 65 cents.");

  const launchedReward = sent.some((msg) => msg.type === "canvas_draw" && msg.mode === "space-invaders");

  assert.equal(modelRuns, 0, "server-owned follow-up questions should not fall back to freeform model replies");
  assert.equal(prompts.length >= 4, true, "arc should include completion, game follow-up prompts, and reward handoff");
  assert.match(prompts[1] ?? "", /store game|money/i, "first post-game prompt should stay tied to the instructional game");
  assert.match(prompts[2] ?? "", /bigger|compare|price/i, "second follow-up should reinforce the worksheet concept");
  assert.equal(launchedReward, true, "reward should launch after the instructional follow-up questions");
}

async function main(): Promise<void> {
  console.log("\nreward game handshake\n");
  testRewardGameRetriesStartAfterReady();
  console.log("  ✅ reward game retries start after ready");
  testRewardGameStartCarriesCompanionName();
  console.log("  ✅ reward game start includes companion name");
  await testPendingEndRewardLaunchesBeforeSessionEnds();
  console.log("  ✅ pending end reward launches before session ends");
  await testWorksheetInstructionalGameResumesSameProblem();
  console.log("  ✅ instructional game resumes the same worksheet problem");
  await testWorksheetCompletionRetiresWorksheetState();
  console.log("  ✅ worksheet completion retires worksheet state");
  await testDuplicateWorksheetTypedAndSpokenAnswerIsIgnoredOnce();
  console.log("  ✅ duplicate typed and spoken worksheet answers are only handled once");
  await testWorksheetClarificationReanchorsSameProblem();
  console.log("  ✅ worksheet clarification re-anchors same problem");
  await testWorksheetCorrectTurnUsesServerOwnedOutcome();
  console.log("  ✅ worksheet correct turn uses server-owned outcome");
  testBlockedStaleWorksheetToolCallDoesNotQueueProgress();
  console.log("  ✅ blocked stale worksheet tool calls do not queue progress");
  await testWorksheetCarryoverFragmentIsIgnoredAfterAdvance();
  console.log("  ✅ worksheet carryover fragment is ignored after advance");
  await testWorksheetPreviousAnswerRepeatIsIgnoredAfterAdvance();
  console.log("  ✅ previous worksheet answer repeat is ignored after advance");
  await testWorksheetCompletionCarryoverFragmentIsIgnored();
  console.log("  ✅ worksheet completion carryover fragment is ignored");
  await testReviewModeDoesNotAutoAdvanceAfterThreeWrongAnswers();
  console.log("  ✅ review mode does not auto advance after three wrong answers");
  await testInstructionalGameClaimNeedsStructuredCompletion();
  console.log("  ✅ instructional game claim needs structured completion");
  await testWorksheetCompletionLaunchesInstructionalGameBeforeReward();
  console.log("  ✅ worksheet completion launches instructional game before reward");
  await testInstructionalGameCompletionAsksFollowupsBeforeReward();
  console.log("  ✅ instructional game completion asks followups before reward");
  console.log("\n  All reward game handshake assertions passed\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
