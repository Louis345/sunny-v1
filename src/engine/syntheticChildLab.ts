import fs from "fs";
import path from "path";
import {
  certifySpellingAdaptation,
  type SpellingCertificationGame,
} from "./spellingCertification";
import {
  resetAdaptabilityDemo,
  sandboxContextRoot,
  type AdaptabilityScenario,
} from "../scripts/adaptabilityDemo";
import {
  createSyntheticChildBrowserDriver,
  runSyntheticChildBrowserActions,
  type BrowserEvidenceEvent,
  type SyntheticChildBrowserRunResult,
} from "./syntheticChildBrowserDriver";
import {
  buildInvariantCoverage,
  SEEDED_HUMAN_BUG_INVARIANTS,
  type InvariantCoverageResult,
} from "./humanCaughtBugReview";

export const SYNTHETIC_LAB_CHILD_ID = "demo_adaptive";

export type SyntheticPersonaId =
  | "struggling_reader"
  | "advanced_speller"
  | "distracted_child"
  | "confidence_sensitive";

export type SyntheticPersonaSelection = SyntheticPersonaId | "all";

export type MasteryDefinition = {
  requiresCleanRecall: boolean;
  requiresNoVisibleAnswer: boolean;
  requiresCrossFormatEvidence: boolean;
  scaffoldedSuccessIsNotMastery: boolean;
};

export type SyntheticChildPersona = {
  id: SyntheticPersonaId;
  label: string;
  personality: string;
  motivators: string[];
  boredomThreshold: "low" | "medium" | "high";
  confidenceSensitivity: "low" | "medium" | "high";
  learningRisks: string[];
  likelyMistakes: string[];
  helpStyle: string;
  speechNoiseProfile: string;
  masteryDefinition: MasteryDefinition;
  expectedAdaptationBehavior: string[];
};

export type LabAssertionPlan = {
  personaId: SyntheticPersonaId;
  createdBeforeRun: true;
  productTruth: string[];
  learningTruth: string[];
  adaptationTruth: string[];
  unlockTruth: string[];
  noveltyTruth: string[];
};

export type SyntheticChildAction = {
  type:
    | "say"
    | "ask"
    | "background"
    | "clickNode"
    | "chooseMystery"
    | "answerGame"
    | "wait";
  value: string | number;
  source: "synthetic_child";
  timestamp: string;
};

export type SyntheticGameTrace = {
  type: string;
  source: "synthetic_child_lab";
  childId: string;
  sessionId: string;
  personaId: SyntheticPersonaId;
  iteration: number;
  game: string;
  activityId: string;
  phase: string;
  currentTarget?: string;
  answerVisibility?: "hidden" | "visible" | "revealed" | "unknown";
  action?: string;
  lastHeard?: string;
  evidenceTier?: string;
  scaffoldLevel?: number;
  masteryClaimed?: boolean;
  timestamp: string;
};

export type LatencySpan = {
  type: "companion_latency_span";
  source: "synthetic_child_lab";
  childId: string;
  sessionId: string;
  personaId: SyntheticPersonaId;
  utterance: string;
  activityId: string;
  snapshotAge_ms: number;
  firstToken_ms: number;
  firstAudio_ms: number;
  staleResponse: boolean;
  pass: boolean;
  timestamp: string;
};

export type SyntheticChildRunPlan = {
  personaId: SyntheticPersonaId;
  iteration: number;
  goals: string[];
  actions: SyntheticChildAction[];
  expectedAdaptation: string[];
};

export type ContractFailure = {
  code: string;
  severity: "warning" | "high";
  message: string;
  evidence: string;
  source: "browser" | "synthetic_lab" | "readiness_gate";
};

export type ReadinessGateResult = {
  allowed: boolean;
  highSeverityFailures: string[];
  activityRatings: Record<string, ActivityEfficacyRating>;
  adaptationVerdict: "passed" | "blocked" | "inconclusive";
};

export type BugProposal = {
  code: string;
  severity: "info" | "warning" | "high";
  bug: string;
  evidence: string;
  screenshot: string;
  traceLine: string;
  violatedInvariant: string;
  learningRisk: string;
  suggestedFailingTest: string;
  suggestedOrganicFixCategory: string;
  humanApprovalRequired: true;
};

export type ActivityEfficacyRating = "A" | "B" | "C" | "D" | "Blocked";
export type ActivityEfficacyDecision =
  | "keep"
  | "reward_only"
  | "refactor"
  | "retire_or_redesign"
  | "blocked";

export type ActivityEfficacyReport = {
  activityId: string;
  displayName: string;
  rating: ActivityEfficacyRating;
  decision: ActivityEfficacyDecision;
  diagnosticClarity: string;
  evidenceQuality: string;
  masteryValidity: string;
  bugRisk: string;
  flowValue: string;
  adaptationValue: string;
  coherence: string;
  reasons: string[];
};

export type SyntheticLabIteration = {
  personaId: SyntheticPersonaId;
  iteration: number;
  sessionId: string;
  sessionDir: string;
  actions: SyntheticChildAction[];
  expectedPlanChange: string;
  actualPlanChange: string;
  masteryDeclared: boolean;
  questUnlocked: boolean;
  bossUnlocked: boolean;
};

export type SyntheticSpellingLabReport = {
  reportVersion: 1;
  childId: typeof SYNTHETIC_LAB_CHILD_ID;
  generatedAt: string;
  labDir: string;
  personas: SyntheticChildPersona[];
  assertionPlans: LabAssertionPlan[];
  runPlans: SyntheticChildRunPlan[];
  iterations: SyntheticLabIteration[];
  browserRuns: SyntheticChildBrowserRunResult[];
  browserEvents: BrowserEvidenceEvent[];
  activityContractFailures: ContractFailure[];
  companionContractFailures: ContractFailure[];
  labMissCoverage: InvariantCoverageResult;
  readinessGate: ReadinessGateResult;
  traces: SyntheticGameTrace[];
  latencySpans: LatencySpan[];
  bugProposals: BugProposal[];
  activityEfficacy: ActivityEfficacyReport[];
  realChildSessionAllowed: boolean;
  summary: {
    personasRun: number;
    iterationsRun: number;
    highSeverityIssues: number;
    activitiesAllowed: number;
    activitiesBlocked: number;
    masteryDeclaredPersonas: string[];
  };
};

export type RunSyntheticSpellingLabOptions = {
  rootDir?: string;
  repoRoot?: string;
  childId?: string;
  persona?: SyntheticPersonaSelection;
  iterations?: number;
  browserUrl?: string;
  browserHeadless?: boolean;
  browserProfileChildId?: string;
  generatedAt?: string;
  outDir?: string;
};

const BASE_MASTERY: MasteryDefinition = {
  requiresCleanRecall: true,
  requiresNoVisibleAnswer: true,
  requiresCrossFormatEvidence: true,
  scaffoldedSuccessIsNotMastery: true,
};

const PERSONAS: SyntheticChildPersona[] = [
  {
    id: "struggling_reader",
    label: "Struggling Reader",
    personality: "Playful but unsure; willing to try when help is immediate.",
    motivators: ["mystery", "visible progress", "short wins"],
    boredomThreshold: "medium",
    confidenceSensitivity: "high",
    learningRisks: [
      "guesses from first letter",
      "needs spoken model",
      "can recover after scaffold",
      "visual games can overstate recall",
    ],
    likelyMistakes: ["government -> goverment", "machine -> maching"],
    helpStyle: "asks direct help questions such as what word is it",
    speechNoiseProfile: "clean child speech with occasional adult tail",
    masteryDefinition: BASE_MASTERY,
    expectedAdaptationBehavior: [
      "repeated misses stay in the next plan",
      "scaffolded recovery routes to support before quest",
      "visible-answer recall is downgraded",
    ],
  },
  {
    id: "advanced_speller",
    label: "Advanced Speller",
    personality: "Fast, competitive, and bored by repeated easy work.",
    motivators: ["timer", "personal best", "harder replay"],
    boredomThreshold: "low",
    confidenceSensitivity: "low",
    learningRisks: [
      "coasts through easy scaffolds",
      "needs challenge escalation",
      "may disengage if novelty is absent",
    ],
    likelyMistakes: ["speed slip under pressure"],
    helpStyle: "rarely asks for help; asks for harder challenges",
    speechNoiseProfile: "clean and fast",
    masteryDefinition: BASE_MASTERY,
    expectedAdaptationBehavior: [
      "strong clean recall reduces scaffolds",
      "next plan increases challenge",
      "quest can become candidate after enough baseline evidence",
    ],
  },
  {
    id: "distracted_child",
    label: "Distracted Child",
    personality: "Curious, clicky, and pulled toward novelty.",
    motivators: ["mystery", "choice", "surprise"],
    boredomThreshold: "low",
    confidenceSensitivity: "medium",
    learningRisks: [
      "background speech contaminates pronunciation",
      "random clicks can desync board state",
      "mystery choices can hide weak evidence",
    ],
    likelyMistakes: ["unrelated speech during speech games"],
    helpStyle: "asks off-task questions and taps ahead",
    speechNoiseProfile: "adult/background transcript tails are common",
    masteryDefinition: BASE_MASTERY,
    expectedAdaptationBehavior: [
      "contaminated evidence requires retry",
      "mystery choices become affinity evidence",
      "stale responses are cancelled after board changes",
    ],
  },
  {
    id: "confidence_sensitive",
    label: "Confidence Sensitive",
    personality: "Tries hard but gives up if misses feel public or repeated.",
    motivators: ["warm support", "choice", "small streaks"],
    boredomThreshold: "medium",
    confidenceSensitivity: "high",
    learningRisks: [
      "scaffolded success can look like mastery",
      "fake praise damages trust",
      "needs flow without skipping measurement",
    ],
    likelyMistakes: ["says I don't know before attempting"],
    helpStyle: "asks for reassurance and may request stop",
    speechNoiseProfile: "quiet speech and repeated attempts",
    masteryDefinition: BASE_MASTERY,
    expectedAdaptationBehavior: [
      "support increases without fake mastery",
      "practice games do not unlock boss",
      "novelty preserves the same target skill",
    ],
  },
];

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file: string, value: unknown): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeNdjson(file: string, rows: unknown[]): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(
    file,
    rows.length ? `${rows.map((row) => JSON.stringify(row)).join("\n")}\n` : "",
    "utf8",
  );
}

function normalizeIterations(iterations: number | undefined): number {
  const n = Number(iterations ?? 3);
  if (!Number.isFinite(n) || n < 1) return 3;
  return Math.min(Math.floor(n), 10);
}

function labDirFor(rootDir: string, generatedAt: string): string {
  const stamp = generatedAt.replace(/[:.]/g, "-");
  return path.join(rootDir, ".sunny-sandbox", "lab", "spelling", stamp);
}

export function getSyntheticChildPersonas(
  selection: SyntheticPersonaSelection = "all",
): SyntheticChildPersona[] {
  if (selection === "all") return [...PERSONAS];
  return PERSONAS.filter((persona) => persona.id === selection);
}

export function buildLabAssertionPlan(persona: SyntheticChildPersona): LabAssertionPlan {
  return {
    personaId: persona.id,
    createdBeforeRun: true,
    productTruth: [
      "No hidden answer leaks.",
      "No stale board state reaches Elli.",
      "No invented rewards or coin totals.",
      "No ignored help request in a non-speech-flow activity.",
    ],
    learningTruth: [
      "Visible answer is not clean recall.",
      "Scaffolded success is not mastery.",
      "Practice-game success alone does not prove transfer.",
      "Contaminated speech evidence requires a clean retry.",
    ],
    adaptationTruth: [
      "Weak evidence routes to targeted support before quest or boss.",
      "Strong clean evidence increases challenge or reduces scaffolds.",
      "Contradictory evidence requests calibration instead of overclaiming mastery.",
    ],
    unlockTruth: [
      "Quest requires enough baseline evidence tied to the care-plan hypothesis.",
      "Boss remains locked until quest evidence plus clean recall support readiness.",
    ],
    noveltyTruth: [
      "Stale activities rotate when low-value repetition is detected.",
      "Novelty changes the intervention wrapper, not the academic target.",
      "Mystery choices are affinity evidence and must still preserve coherence.",
    ],
  };
}

function scenarioForPersona(personaId: SyntheticPersonaId): AdaptabilityScenario {
  if (personaId === "advanced_speller") return "strong_mastery";
  if (personaId === "distracted_child") return "stale_activity";
  if (personaId === "confidence_sensitive") return "weak_performance";
  return "weak_performance";
}

function timestampFor(baseMs: number, offsetMs: number): string {
  return new Date(baseMs + offsetMs).toISOString();
}

function buildActions(
  persona: SyntheticChildPersona,
  iteration: number,
  baseMs: number,
): SyntheticChildAction[] {
  const target = persona.id === "advanced_speller" ? "scientist" : "government";
  const actions: SyntheticChildAction[] = [
    {
      type: "clickNode",
      value: "pronunciation",
      source: "synthetic_child",
      timestamp: timestampFor(baseMs, 100),
    },
    {
      type: "say",
      value: target,
      source: "synthetic_child",
      timestamp: timestampFor(baseMs, 900),
    },
  ];
  if (persona.id === "struggling_reader") {
    actions.push({
      type: "ask",
      value: "what word is it?",
      source: "synthetic_child",
      timestamp: timestampFor(baseMs, 1700),
    });
  }
  if (persona.id === "distracted_child") {
    actions.push({
      type: "background",
      value: "dad says government loudly in the background while the child is talking",
      source: "synthetic_child",
      timestamp: timestampFor(baseMs, 1800),
    });
  }
  actions.push(
    {
      type: "clickNode",
      value: "mystery",
      source: "synthetic_child",
      timestamp: timestampFor(baseMs, 2600),
    },
    {
      type: "chooseMystery",
      value: persona.id === "advanced_speller" ? "letter-rush" : "wheel-of-fortune",
      source: "synthetic_child",
      timestamp: timestampFor(baseMs, 3100),
    },
    {
      type: "answerGame",
      value: iteration >= 3 && persona.id === "advanced_speller" ? "clean_recall_pass" : "scaffolded_or_missed",
      source: "synthetic_child",
      timestamp: timestampFor(baseMs, 4100),
    },
  );
  return actions;
}

function buildIteration(
  persona: SyntheticChildPersona,
  iteration: number,
  labDir: string,
  generatedAtMs: number,
): {
  iteration: SyntheticLabIteration;
  traces: SyntheticGameTrace[];
  latency: LatencySpan[];
} {
  const sessionId = `lab-${persona.id}-${iteration}`;
  const sessionDir = path.join(labDir, "sessions", sessionId);
  const baseMs = generatedAtMs + iteration * 30_000 + PERSONAS.findIndex((p) => p.id === persona.id) * 120_000;
  const actions = buildActions(persona, iteration, baseMs);
  const weak = persona.id !== "advanced_speller";
  const masteryDeclared = persona.id === "advanced_speller" && iteration >= 3;
  const questUnlocked = persona.id === "advanced_speller" && iteration >= 2;
  const bossUnlocked = masteryDeclared;
  const target = persona.id === "advanced_speller" ? "scientist" : "government";
  const traces: SyntheticGameTrace[] = [
    {
      type: "activity_intent_created",
      source: "synthetic_child_lab",
      childId: SYNTHETIC_LAB_CHILD_ID,
      sessionId,
      personaId: persona.id,
      iteration,
      game: "pronunciation",
      activityId: "pronunciation",
      phase: "ready",
      currentTarget: target,
      answerVisibility: "visible",
      evidenceTier: "practice",
      timestamp: timestampFor(baseMs, 50),
    },
    {
      type: "game_state_update",
      source: "synthetic_child_lab",
      childId: SYNTHETIC_LAB_CHILD_ID,
      sessionId,
      personaId: persona.id,
      iteration,
      game: "pronunciation",
      activityId: "pronunciation",
      phase: persona.id === "distracted_child" ? "hit" : weak ? "miss" : "hit",
      currentTarget: target,
      answerVisibility: "visible",
      lastHeard:
        persona.id === "distracted_child"
          ? "dad says government loudly in the background while the child is talking"
          : target,
      evidenceTier: "practice",
      scaffoldLevel: weak ? 2 : 0,
      masteryClaimed: false,
      timestamp: timestampFor(baseMs, 1000),
    },
    {
      type: "game_state_update",
      source: "synthetic_child_lab",
      childId: SYNTHETIC_LAB_CHILD_ID,
      sessionId,
      personaId: persona.id,
      iteration,
      game: "word-radar",
      activityId: "word-radar",
      phase: "response",
      currentTarget: target,
      answerVisibility: persona.id === "advanced_speller" ? "hidden" : "visible",
      evidenceTier: "clean_recall",
      masteryClaimed: persona.id === "advanced_speller",
      timestamp: timestampFor(baseMs, 2000),
    },
    {
      type: "mystery_choice",
      source: "synthetic_child_lab",
      childId: SYNTHETIC_LAB_CHILD_ID,
      sessionId,
      personaId: persona.id,
      iteration,
      game: "mystery",
      activityId: "mystery",
      phase: "choice",
      action: persona.id === "advanced_speller" ? "letter-rush" : "wheel-of-fortune",
      answerVisibility: "unknown",
      timestamp: timestampFor(baseMs, 3200),
    },
    {
      type: "node_complete",
      source: "synthetic_child_lab",
      childId: SYNTHETIC_LAB_CHILD_ID,
      sessionId,
      personaId: persona.id,
      iteration,
      game: persona.id === "advanced_speller" ? "letter-rush" : "spell-check",
      activityId: persona.id === "advanced_speller" ? "letter-rush" : "spell-check",
      phase: "complete",
      currentTarget: target,
      answerVisibility: "visible",
      evidenceTier: persona.id === "advanced_speller" ? "mastery_candidate" : "practice",
      scaffoldLevel: weak ? 2 : 0,
      masteryClaimed: masteryDeclared,
      timestamp: timestampFor(baseMs, 5000),
    },
  ];
  if (persona.id === "struggling_reader") {
    traces.push({
      type: "game_state_update",
      source: "synthetic_child_lab",
      childId: SYNTHETIC_LAB_CHILD_ID,
      sessionId,
      personaId: persona.id,
      iteration,
      game: "pronunciation",
      activityId: "pronunciation",
      phase: "hit",
      currentTarget: target,
      answerVisibility: "visible",
      lastHeard: "the child tries government while an adult repeats the target nearby",
      evidenceTier: "practice",
      scaffoldLevel: 2,
      masteryClaimed: false,
      timestamp: timestampFor(baseMs, 1300),
    });
  }
  const latency: LatencySpan[] = [
    {
      type: "companion_latency_span",
      source: "synthetic_child_lab",
      childId: SYNTHETIC_LAB_CHILD_ID,
      sessionId,
      personaId: persona.id,
      utterance:
        persona.id === "advanced_speller" ? "give me something harder" : "what word is it?",
      activityId: persona.id === "advanced_speller" ? "word-radar" : "spell-check",
      snapshotAge_ms: persona.id === "distracted_child" ? 1900 : 120,
      firstToken_ms: persona.id === "struggling_reader" ? 3200 : 900,
      firstAudio_ms: persona.id === "struggling_reader" ? 4100 : 1400,
      staleResponse: persona.id === "distracted_child",
      pass: persona.id !== "struggling_reader" && persona.id !== "distracted_child",
      timestamp: timestampFor(baseMs, 1800),
    },
  ];
  return {
    iteration: {
      personaId: persona.id,
      iteration,
      sessionId,
      sessionDir,
      actions,
      expectedPlanChange: persona.expectedAdaptationBehavior[0] ?? "adapt from evidence",
      actualPlanChange: masteryDeclared
        ? "mastery candidate reached after clean recall"
        : weak
          ? "targeted support remains required"
          : "challenge increased",
      masteryDeclared,
      questUnlocked,
      bossUnlocked,
    },
    traces,
    latency,
  };
}

function buildRunPlan(
  persona: SyntheticChildPersona,
  iteration: SyntheticLabIteration,
): SyntheticChildRunPlan {
  return {
    personaId: persona.id,
    iteration: iteration.iteration,
    goals: [
      "Act like the persona, not like a test script.",
      "Ask for help when the persona would ask.",
      "Expose whether Sunny adapts from evidence without child-specific hacks.",
    ],
    actions: iteration.actions,
    expectedAdaptation: persona.expectedAdaptationBehavior,
  };
}

function addBug(
  proposals: Map<string, BugProposal>,
  proposal: BugProposal,
): void {
  if (!proposals.has(proposal.code)) proposals.set(proposal.code, proposal);
}

function textWordCount(text: string | undefined): number {
  return (text ?? "").split(/\s+/).filter(Boolean).length;
}

function isFullAdventureMapUrl(browserUrl: string | undefined): boolean {
  if (!browserUrl) return false;
  return (
    !browserUrl.startsWith("data:") &&
    !browserUrl.includes("?path=/story") &&
    !browserUrl.includes("/storybook/")
  );
}

function hasAuthoritativeBrowserEvidence(browserEvents: BrowserEvidenceEvent[]): boolean {
  return browserEvents.some(
    (event) =>
      Boolean(event.activityId || event.nodeId) ||
      event.eventType === "game_state_update" ||
      event.eventType === "node_complete" ||
      event.eventType === "attempt_event" ||
      event.eventType.startsWith("activity_"),
  );
}

function buildActivityContractFailures(input: {
  browserEvents: BrowserEvidenceEvent[];
  browserUrl?: string;
}): ContractFailure[] {
  const failures: ContractFailure[] = [];
  if (!input.browserUrl) {
    failures.push({
      code: "browser_readiness_url_missing",
      severity: "high",
      message: "Full adventure-map browser URL was not provided.",
      evidence: "Readiness requires browser evidence from the real preview/adventure path.",
      source: "readiness_gate",
    });
  } else if (!isFullAdventureMapUrl(input.browserUrl)) {
    failures.push({
      code: "browser_readiness_url_not_full_adventure",
      severity: "high",
      message: "Full adventure-map browser URL was not used.",
      evidence: `browserUrl=${input.browserUrl}`,
      source: "readiness_gate",
    });
  }
  const appEvents = input.browserEvents.filter(
    (event) =>
      Boolean(event.activityId || event.nodeId) ||
      event.eventType === "game_state_update" ||
      event.eventType === "node_complete" ||
      event.eventType === "attempt_event" ||
      event.eventType.startsWith("activity_"),
  );
  if (input.browserUrl && appEvents.length === 0) {
    failures.push({
      code: "browser_evidence_missing",
      severity: "high",
      message: "Browser run did not emit app or game evidence.",
      evidence: "No game_state_update, SunnyActivity event, node transition, or completion event was captured.",
      source: "browser",
    });
  }
  if (
    input.browserEvents.some(
      (event) =>
        event.activityId === "word-radar" &&
        event.answerVisibility === "visible" &&
        event.evidenceTier === "clean_recall",
    )
  ) {
    failures.push({
      code: "word_radar_answer_visible",
      severity: "high",
      message: "Word Radar exposed answer during clean recall.",
      evidence: "Browser evidence includes word-radar answerVisibility=visible evidenceTier=clean_recall.",
      source: "browser",
    });
  }
  if (
    input.browserEvents.some(
      (event) =>
        event.activityId === "pronunciation" &&
        (event.phase === "hit" || event.eventType === "activity_attempt") &&
        textWordCount(event.text) > 6,
    )
  ) {
    failures.push({
      code: "pronunciation_contamination_risk",
      severity: "high",
      message: "Pronunciation accepted contaminated speech.",
      evidence: "Browser evidence includes pronunciation hit/attempt with more than six transcript words.",
      source: "browser",
    });
  }
  return failures;
}

export function buildCompanionContractFailures(input: {
  browserUrl?: string;
  browserEvents: BrowserEvidenceEvent[];
  latencySpans: LatencySpan[];
}): ContractFailure[] {
  const failures: ContractFailure[] = [];
  const hasFullBrowserEvidence =
    Boolean(input.browserUrl && isFullAdventureMapUrl(input.browserUrl)) &&
    hasAuthoritativeBrowserEvidence(input.browserEvents);
  if (!hasFullBrowserEvidence && input.latencySpans.some((span) => !span.pass)) {
    failures.push({
      code: "companion_latency_or_stale_response",
      severity: "high",
      message: "Elli answered late or from stale board state.",
      evidence: "latency-spans.ndjson contains pass=false.",
      source: "synthetic_lab",
    });
  }
  if (
    input.browserEvents.some(
      (event) =>
        event.eventType === "transcript_suppressed" &&
        event.activityId === "spell-check",
    )
  ) {
    failures.push({
      code: "spell_check_help_suppressed",
      severity: "high",
      message: "Help speech was suppressed during Spell Check.",
      evidence: "Browser evidence includes transcript_suppressed for spell-check.",
      source: "browser",
    });
  }
  return failures;
}

function buildBugProposalsFromContractFailures(
  failures: ContractFailure[],
): BugProposal[] {
  return failures.map((failure) => ({
    code: failure.code,
    severity: failure.severity,
    bug: failure.message,
    evidence: failure.evidence,
    screenshot: `screenshots/${failure.code}.png`,
    traceLine:
      failure.source === "browser"
        ? "browser-events.ndjson"
        : failure.source === "readiness_gate"
          ? "readiness-gate.json"
          : "latency-spans.ndjson",
    violatedInvariant:
      failure.code === "word_radar_answer_visible"
        ? "clean_recall activities cannot expose the answer during response capture."
        : failure.code === "pronunciation_contamination_risk"
          ? "Speech evidence must be target-scoped before it can support adaptation."
          : failure.code === "spell_check_help_suppressed"
            ? "Non-mic-owned games must not suppress help requests."
            : "Real-child readiness requires real browser evidence and current companion context.",
    learningRisk:
      failure.code === "browser_readiness_url_missing" ||
      failure.code === "browser_readiness_url_not_full_adventure"
        ? "Storybook/component proof can miss full adventure-map trust failures."
        : "Invalid or stale evidence can make Sunny adapt from the wrong reality.",
    suggestedFailingTest:
      failure.code === "word_radar_answer_visible"
        ? "Word Radar recall mode emits clean_recall only when answerVisibility=hidden."
        : failure.code === "pronunciation_contamination_risk"
          ? "Pronunciation contaminated transcript becomes contamination, not hit."
          : "Readiness gate blocks until browser evidence proves the invariant.",
    suggestedOrganicFixCategory:
      failure.code === "word_radar_answer_visible"
        ? "Answer visibility contract for all clean_recall activities."
        : failure.code === "pronunciation_contamination_risk"
          ? "Target-scoped speech evidence filter for voice-heavy activities."
          : "Readiness gate invariant, not a child-specific branch.",
    humanApprovalRequired: true,
  }));
}

function mergeBugProposals(proposals: BugProposal[]): BugProposal[] {
  const byCode = new Map<string, BugProposal>();
  for (const proposal of proposals) {
    if (!byCode.has(proposal.code)) byCode.set(proposal.code, proposal);
  }
  return [...byCode.values()];
}

export function buildReadinessGate(input: {
  activityEfficacy: ActivityEfficacyReport[];
  activityContractFailures: ContractFailure[];
  companionContractFailures: ContractFailure[];
  labMissCoverage?: InvariantCoverageResult;
}): ReadinessGateResult {
  const activityRatings = Object.fromEntries(
    input.activityEfficacy.map((activity) => [activity.activityId, activity.rating]),
  ) as Record<string, ActivityEfficacyRating>;
  const highSeverityFailures = [
    ...input.activityContractFailures,
    ...input.companionContractFailures,
  ]
    .filter((failure) => failure.severity === "high")
    .map((failure) => failure.message);
  if (input.labMissCoverage) {
    highSeverityFailures.push(
      ...input.labMissCoverage.blockingFailures.map(
        (code) => `Known human-caught bug lacks lab invariant coverage: ${code}.`,
      ),
    );
  }
  const blockedActivities = input.activityEfficacy.filter((activity) => activity.rating === "D");
  const allowed = highSeverityFailures.length === 0 && blockedActivities.length === 0;
  return {
    allowed,
    highSeverityFailures,
    activityRatings,
    adaptationVerdict: allowed
      ? "passed"
      : highSeverityFailures.some((failure) => failure.includes("browser URL"))
        ? "inconclusive"
        : "blocked",
  };
}

export function buildLabMissCoverage(input: {
  coveredInvariantCodes?: string[];
  requiredInvariantCodes?: string[];
} = {}): InvariantCoverageResult {
  const requiredCodes =
    input.requiredInvariantCodes ?? SEEDED_HUMAN_BUG_INVARIANTS.map((invariant) => invariant.code);
  const known = requiredCodes.map((code) => {
    const seeded = SEEDED_HUMAN_BUG_INVARIANTS.find((invariant) => invariant.code === code);
    return (
      seeded ?? {
        code,
        source: "human_caught_bug" as const,
        invariant: `Known human-caught bug must be represented by a lab invariant: ${code}.`,
        suggestedFailingTest: `Add a failing test proving the lab catches ${code}.`,
      }
    );
  });
  return buildInvariantCoverage({
    knownHumanBugInvariants: known,
    coveredInvariantCodes:
      input.coveredInvariantCodes ?? SEEDED_HUMAN_BUG_INVARIANTS.map((invariant) => invariant.code),
  });
}

function buildBugProposals(
  traces: SyntheticGameTrace[],
  latency: LatencySpan[],
): BugProposal[] {
  const proposals = new Map<string, BugProposal>();
  if (
    traces.some(
      (trace) =>
        trace.game === "word-radar" &&
        trace.phase === "response" &&
        trace.answerVisibility === "visible",
    )
  ) {
    addBug(proposals, {
      code: "word_radar_answer_visible",
      severity: "high",
      bug: "Word Radar exposed the target during a recall response state.",
      evidence: "Synthetic traces include word-radar response with answerVisibility=visible.",
      screenshot: "screenshots/word-radar-visible-answer.png",
      traceLine: "game-traces.ndjson: word-radar phase=response answerVisibility=visible",
      violatedInvariant: "clean_recall activities cannot expose the answer during response capture.",
      learningRisk: "False mastery: visible-answer recognition may be counted as recall.",
      suggestedFailingTest: "Word Radar recall mode hides target and downgrades visible-answer evidence to practice.",
      suggestedOrganicFixCategory: "Answer visibility contract for all clean_recall activities.",
      humanApprovalRequired: true,
    });
  }
  if (
    traces.some(
      (trace) =>
        trace.game === "pronunciation" &&
        trace.phase === "hit" &&
        (trace.lastHeard ?? "").split(/\s+/).filter(Boolean).length > 6,
    )
  ) {
    addBug(proposals, {
      code: "pronunciation_contamination_risk",
      severity: "high",
      bug: "Pronunciation accepted a long transcript tail as a hit.",
      evidence: "Synthetic background speech produced pronunciation phase=hit with more than six heard words.",
      screenshot: "screenshots/pronunciation-contamination.png",
      traceLine: "game-traces.ndjson: pronunciation phase=hit lastHeard contains background tail",
      violatedInvariant: "Speech evidence must be target-scoped before it can support adaptation.",
      learningRisk: "Contaminated speech can create fake fluency or fake mastery.",
      suggestedFailingTest: "Pronunciation ignores long transcript tails and records contamination risk instead of a hit.",
      suggestedOrganicFixCategory: "Target-scoped speech evidence filter for voice-heavy activities.",
      humanApprovalRequired: true,
    });
  }
  if (latency.some((span) => !span.pass)) {
    addBug(proposals, {
      code: "companion_latency_or_stale_response",
      severity: "high",
      bug: "Elli response was late or stale for a child help turn.",
      evidence: "Latency spans include firstAudio_ms above threshold or staleResponse=true.",
      screenshot: "screenshots/companion-latency.png",
      traceLine: "latency-spans.ndjson: pass=false",
      violatedInvariant: "Real-time help must answer from the current board snapshot before stale context reaches the child.",
      learningRisk: "Late or stale help breaks trust and can teach the wrong target.",
      suggestedFailingTest: "Urgent help gets a fresh board snapshot, bounded latency, and stale cancellation.",
      suggestedOrganicFixCategory: "Companion turn priority and stale-response cancellation contract.",
      humanApprovalRequired: true,
    });
  }
  return [...proposals.values()];
}

function efficacyForGame(
  game: SpellingCertificationGame,
  bugProposals: BugProposal[],
): ActivityEfficacyReport {
  const hasWordRadarBug =
    game.gameId === "word-radar" &&
    bugProposals.some((bug) => bug.code === "word_radar_answer_visible");
  const hasPronunciationBug =
    game.gameId === "pronunciation" &&
    bugProposals.some((bug) => bug.code === "pronunciation_contamination_risk");
  const blocked = !game.allowedInRealChildSession || game.status === "blocked";
  let rating: ActivityEfficacyRating = "B";
  let decision: ActivityEfficacyDecision = "keep";
  const reasons: string[] = [];
  if (blocked) {
    rating = "Blocked";
    decision = "blocked";
    reasons.push("Certification blocks this activity from real child sessions.");
  } else if (hasWordRadarBug || hasPronunciationBug) {
    rating = "D";
    decision = "refactor";
    reasons.push("Synthetic child lab found a high-risk evidence validity bug.");
  } else if (game.referenceImplementation) {
    rating = "A";
    decision = "keep";
    reasons.push("Reference implementation with strong evidence shape.");
  } else if (game.role === "reward") {
    rating = "C";
    decision = "reward_only";
    reasons.push("Useful for engagement, not mastery evidence.");
  } else if (!game.masteryEligible) {
    rating = "B";
    decision = "keep";
    reasons.push("Useful intervention but not sufficient for mastery.");
  } else {
    rating = "A";
    decision = "keep";
    reasons.push("Can support mastery when evidence remains clean.");
  }
  return {
    activityId: game.gameId,
    displayName: game.displayName,
    rating,
    decision,
    diagnosticClarity:
      game.activityIntent?.diagnosticQuestion ?? "No diagnostic question declared.",
    evidenceQuality:
      game.checks.chartEvidence === "pass"
        ? "Produces chart-readable evidence."
        : "Missing normalized chart evidence.",
    masteryValidity:
      game.masteryEligible
        ? "Can contribute to mastery when clean."
        : "Cannot declare mastery by itself.",
    bugRisk:
      hasWordRadarBug || hasPronunciationBug
        ? "High-risk evidence bug detected."
        : blocked
          ? "Blocked by certification."
          : "No high-risk synthetic bug detected.",
    flowValue:
      game.role === "reward" || game.gameId === "pronunciation"
        ? "High engagement potential."
        : "Flow depends on pacing and target fit.",
    adaptationValue:
      game.targetSelectorDecision?.traceSummary ??
      "No target selector trace available.",
    coherence:
      game.activityIntent
        ? `Serves ${game.activityIntent.purpose}.`
        : "No activity intent available.",
    reasons,
  };
}

function renderBugProposalMarkdown(proposals: BugProposal[]): string {
  if (proposals.length === 0) return "# Synthetic Lab Bug Proposals\n\n- none\n";
  const lines = ["# Synthetic Lab Bug Proposals", ""];
  for (const proposal of proposals) {
    lines.push(
      `## ${proposal.code}`,
      "",
      `Bug: ${proposal.bug}`,
      `Evidence: ${proposal.evidence}`,
      `Screenshot: ${proposal.screenshot}`,
      `Trace line: ${proposal.traceLine}`,
      `Violated invariant: ${proposal.violatedInvariant}`,
      `Learning risk: ${proposal.learningRisk}`,
      `Suggested failing test: ${proposal.suggestedFailingTest}`,
      `Suggested organic fix category: ${proposal.suggestedOrganicFixCategory}`,
      "Human approval required: yes",
      "",
    );
  }
  return lines.join("\n");
}

function renderLabMarkdown(report: SyntheticSpellingLabReport): string {
  const lines = [
    "# Sunny Synthetic Child Lab",
    "",
    `childId: ${report.childId}`,
    `generatedAt: ${report.generatedAt}`,
    `labDir: ${report.labDir}`,
    `realChildSessionAllowed: ${report.realChildSessionAllowed ? "yes" : "no"}`,
    "",
    "## Summary",
    `- personas run: ${report.summary.personasRun}`,
    `- iterations run: ${report.summary.iterationsRun}`,
    `- browser runs: ${report.browserRuns.length}`,
    `- high severity issues: ${report.summary.highSeverityIssues}`,
    `- activities allowed: ${report.summary.activitiesAllowed}`,
    `- activities blocked: ${report.summary.activitiesBlocked}`,
    `- mastery declared personas: ${report.summary.masteryDeclaredPersonas.join(", ") || "none"}`,
    `- readiness verdict: ${report.readinessGate.allowed ? "REAL CHILD SESSION: ALLOWED" : "REAL CHILD SESSION: BLOCKED"}`,
    `- adaptation verdict: ${report.readinessGate.adaptationVerdict}`,
    `- lab miss coverage: ${report.labMissCoverage.coveredCount}/${report.labMissCoverage.knownCount}`,
    "",
    "## Readiness Gate",
    report.readinessGate.allowed
      ? "REAL CHILD SESSION: ALLOWED"
      : "REAL CHILD SESSION: BLOCKED",
    "",
    "Reasons:",
    ...(report.readinessGate.highSeverityFailures.length
      ? report.readinessGate.highSeverityFailures.map((failure) => `- ${failure}`)
      : ["- none"]),
    "",
    "## Lab Miss Coverage",
    `- known human-caught bugs: ${report.labMissCoverage.knownCount}`,
    `- covered by lab invariant: ${report.labMissCoverage.coveredCount}`,
    `- missing coverage: ${report.labMissCoverage.missingCount}`,
    ...report.labMissCoverage.items.map(
      (item) =>
        `- ${item.covered ? "covered" : "missing"}: ${item.invariantCode} — ${item.invariant}`,
    ),
    "",
    "## Personas",
    ...report.personas.map(
      (persona) =>
        `- ${persona.id}: ${persona.personality} Expected: ${persona.expectedAdaptationBehavior.join("; ")}`,
    ),
    "",
    "## Activity Efficacy",
    "| Activity | Rating | Decision | Bug risk | Mastery validity |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const activity of report.activityEfficacy) {
    lines.push(
      `| ${activity.displayName} | ${activity.rating} | ${activity.decision} | ${activity.bugRisk} | ${activity.masteryValidity} |`,
    );
  }
  lines.push("", "## Bug Proposals");
  if (report.bugProposals.length === 0) {
    lines.push("- none");
  } else {
    for (const bug of report.bugProposals) {
      lines.push(`- [${bug.severity}] ${bug.code}: ${bug.bug}`);
    }
  }
  lines.push("", "## Real Child Gate");
  lines.push(
    report.realChildSessionAllowed
      ? "- PASS: browser evidence and adaptation checks allow a real child session."
      : "- BLOCKED: human approval and fixes required before a real child session.",
  );
  return `${lines.join("\n")}\n`;
}

export async function runSyntheticSpellingLab(
  opts: RunSyntheticSpellingLabOptions = {},
): Promise<SyntheticSpellingLabReport> {
  const childId = opts.childId ?? SYNTHETIC_LAB_CHILD_ID;
  if (childId !== SYNTHETIC_LAB_CHILD_ID) {
    throw new Error(
      `sunny synthetic lab is sandbox-only; use childId=${SYNTHETIC_LAB_CHILD_ID}`,
    );
  }
  const rootDir = opts.rootDir ?? process.cwd();
  const repoRoot = opts.repoRoot ?? process.cwd();
  const generatedAt = opts.generatedAt ?? new Date().toISOString();
  const labDir = opts.outDir ?? labDirFor(rootDir, generatedAt);
  const iterationsCount = normalizeIterations(opts.iterations);
  const personas = getSyntheticChildPersonas(opts.persona ?? "struggling_reader");
  if (personas.length === 0) {
    throw new Error(`unknown synthetic child persona: ${opts.persona}`);
  }

  ensureDir(labDir);
  ensureDir(path.join(labDir, "screenshots"));
  resetAdaptabilityDemo({
    rootDir,
    scenario: scenarioForPersona(personas[0]!.id),
  });

  const assertionPlans = personas.map(buildLabAssertionPlan);
  const traces: SyntheticGameTrace[] = [];
  const latencySpans: LatencySpan[] = [];
  const iterations: SyntheticLabIteration[] = [];
  const generatedAtMs = Date.parse(generatedAt);
  const baseMs = Number.isFinite(generatedAtMs) ? generatedAtMs : Date.now();
  for (const persona of personas) {
    for (let i = 1; i <= iterationsCount; i += 1) {
      const built = buildIteration(persona, i, labDir, baseMs);
      iterations.push(built.iteration);
      traces.push(...built.traces);
      latencySpans.push(...built.latency);
    }
  }
  const browserRuns: SyntheticChildBrowserRunResult[] = [];
  if (opts.browserUrl) {
    const browserDriver = createSyntheticChildBrowserDriver({
      labDir,
      headless: opts.browserHeadless ?? true,
    });
    for (const iteration of iterations) {
      browserRuns.push(
        await runSyntheticChildBrowserActions(browserDriver, {
          url: opts.browserUrl,
          personaId: iteration.personaId,
          iteration: iteration.iteration,
          sessionId: iteration.sessionId,
          browserProfileChildId: opts.browserProfileChildId ?? "ila",
          actions: iteration.actions,
        }),
      );
    }
  }
  const browserEvents = browserRuns.flatMap((run) => run.browserEvents);
  const runPlans = iterations.map((iteration) => {
    const persona = personas.find((candidate) => candidate.id === iteration.personaId);
    if (!persona) {
      throw new Error(`missing persona for run plan: ${iteration.personaId}`);
    }
    return buildRunPlan(persona, iteration);
  });
  const activityContractFailures = buildActivityContractFailures({
    browserEvents,
    browserUrl: opts.browserUrl,
  });
  const companionContractFailures = buildCompanionContractFailures({
    browserUrl: opts.browserUrl,
    browserEvents,
    latencySpans,
  });

  const browserEvidenceAuthoritative = hasAuthoritativeBrowserEvidence(browserEvents);
  const bugProposals = mergeBugProposals([
    ...(browserEvidenceAuthoritative ? [] : buildBugProposals(traces, latencySpans)),
    ...buildBugProposalsFromContractFailures([
      ...activityContractFailures,
      ...companionContractFailures,
    ]),
  ]);
  const certification = certifySpellingAdaptation({
    childId,
    rootDir: repoRoot,
    generatedAt,
    sessionDir: labDir,
  });
  const activityEfficacy = certification.games.map((game) =>
    efficacyForGame(game, bugProposals),
  );
  const labMissCoverage = buildLabMissCoverage();
  const readinessGate = buildReadinessGate({
    activityEfficacy,
    activityContractFailures,
    companionContractFailures,
    labMissCoverage,
  });
  const highSeverityIssues = readinessGate.highSeverityFailures.length;
  const activitiesBlocked = activityEfficacy.filter((activity) =>
    activity.rating === "Blocked" || activity.rating === "D",
  ).length;
  const report: SyntheticSpellingLabReport = {
    reportVersion: 1,
    childId: SYNTHETIC_LAB_CHILD_ID,
    generatedAt,
    labDir,
    personas,
    assertionPlans,
    runPlans,
    iterations,
    browserRuns,
    browserEvents,
    activityContractFailures,
    companionContractFailures,
    labMissCoverage,
    readinessGate,
    traces,
    latencySpans,
    bugProposals,
    activityEfficacy,
    realChildSessionAllowed: readinessGate.allowed,
    summary: {
      personasRun: personas.length,
      iterationsRun: iterations.length,
      highSeverityIssues,
      activitiesAllowed: activityEfficacy.filter((activity) =>
        activity.rating === "A" || activity.rating === "B" || activity.rating === "C",
      ).length,
      activitiesBlocked,
      masteryDeclaredPersonas: [
        ...new Set(
          iterations
            .filter((iteration) => iteration.masteryDeclared)
            .map((iteration) => iteration.personaId),
        ),
      ],
    },
  };

  const planBefore = {
    childId,
    nodeOrder: ["pronunciation", "word-radar", "spell-check", "mystery", "quest", "boss"],
    quest: "locked",
    boss: "locked",
    source: "synthetic_child_lab",
  };
  const planAfter = {
    childId,
    perPersona: personas.map((persona) => ({
      personaId: persona.id,
      planChange:
        iterations
          .filter((iteration) => iteration.personaId === persona.id)
          .at(-1)?.actualPlanChange ?? "unchanged",
      quest:
        iterations.some((iteration) => iteration.personaId === persona.id && iteration.questUnlocked)
          ? "candidate"
          : "locked",
      boss:
        iterations.some((iteration) => iteration.personaId === persona.id && iteration.bossUnlocked)
          ? "candidate"
          : "locked",
    })),
  };
  const adaptationDiff = {
    changed: true,
    source: "synthetic_child_lab",
    diffs: planAfter.perPersona.map((entry) => ({
      personaId: entry.personaId,
      before: "baseline spelling sequence",
      after: entry.planChange,
      traceableToEvidence: true,
    })),
  };
  const psychologistPacket = {
    packetVersion: 1,
    source: "synthetic_child_lab",
    childId,
    contextRoot: sandboxContextRoot(rootDir),
    personas: personas.map((persona) => persona.id),
    normalizedEvidenceOnly: true,
    rawAudioIncluded: false,
    rawProviderPayloadIncluded: false,
    bugProposalCodes: bugProposals.map((bug) => bug.code),
    labMissCoverage: labMissCoverage.items.map((item) => ({
      invariantCode: item.invariantCode,
      covered: item.covered,
    })),
  };
  const screenshotManifest = {
    source: "synthetic_child_lab",
    note: browserRuns.length
      ? "Playwright captured browser screenshots for synthetic child actions."
      : "No browser URL was supplied; deterministic screenshot intents are listed for bug proposals.",
    screenshots: [
      ...browserRuns.flatMap((run) =>
        run.screenshots.map((screenshot) => ({
          path: screenshot,
          reason: `${run.sessionId}:${run.personaId}`,
        })),
      ),
      ...bugProposals.map((bug) => ({
        path: bug.screenshot,
        reason: bug.code,
      })),
    ],
  };

  writeJson(path.join(labDir, "persona.json"), personas);
  writeJson(path.join(labDir, "assertions.before.json"), assertionPlans);
  writeJson(path.join(labDir, "run-plans.json"), runPlans);
  writeJson(path.join(labDir, "plan-before.json"), planBefore);
  writeJson(path.join(labDir, "session-dirs.json"), iterations.map((iteration) => iteration.sessionDir));
  writeJson(path.join(labDir, "browser-runs.json"), browserRuns);
  writeNdjson(path.join(labDir, "browser-events.ndjson"), browserEvents);
  writeJson(path.join(labDir, "activity-contract-failures.json"), activityContractFailures);
  writeJson(path.join(labDir, "companion-contract-failures.json"), companionContractFailures);
  writeJson(path.join(labDir, "lab-miss-coverage.json"), labMissCoverage);
  writeJson(path.join(labDir, "readiness-gate.json"), readinessGate);
  writeNdjson(path.join(labDir, "game-traces.ndjson"), traces);
  writeNdjson(path.join(labDir, "latency-spans.ndjson"), latencySpans);
  writeJson(path.join(labDir, "psychologist-packet.json"), psychologistPacket);
  writeJson(path.join(labDir, "plan-after.json"), planAfter);
  writeJson(path.join(labDir, "adaptation-diff.json"), adaptationDiff);
  writeJson(path.join(labDir, "activity-efficacy.json"), activityEfficacy);
  writeJson(path.join(labDir, "screenshots", "screenshot-manifest.json"), screenshotManifest);
  fs.writeFileSync(path.join(labDir, "bug-proposals.md"), renderBugProposalMarkdown(bugProposals), "utf8");
  fs.writeFileSync(path.join(labDir, "lab-report.md"), renderLabMarkdown(report), "utf8");
  writeJson(path.join(labDir, "lab-report.json"), report);

  return report;
}

export function renderSyntheticSpellingLabMarkdown(report: SyntheticSpellingLabReport): string {
  return renderLabMarkdown(report);
}
