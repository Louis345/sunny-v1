import fs from "fs";
import path from "path";

export type LabMissCause =
  | "child_perception_not_asserted"
  | "log_signal_missing"
  | "lab_assertion_missing"
  | "evidence_truth_not_compared";

export type LabInvariant = {
  code: string;
  source: "human_caught_bug" | "lab_seed" | "regression";
  invariant: string;
  suggestedFailingTest: string;
};

export type InvariantCoverageItem = {
  invariantCode: string;
  covered: boolean;
  blocking: boolean;
  invariant: string;
  suggestedFailingTest: string;
};

export type InvariantCoverageResult = {
  knownCount: number;
  coveredCount: number;
  missingCount: number;
  blockingFailures: string[];
  items: InvariantCoverageItem[];
};

export type HumanCaughtBugEvidence = {
  code: string;
  severity: "info" | "warning" | "high";
  source: "session_logs" | "transcript" | "human_observation" | "repo_state";
  evidence: string;
};

export type HumanCaughtBugReview = {
  reviewVersion: 1;
  generatedAt: string;
  sessionDir: string;
  outDir: string;
  humanObservation: string;
  sessionEvidence: HumanCaughtBugEvidence[];
  logEvidence: string[];
  labMissCause: LabMissCause[];
  labGap: string;
  missingAssertion: string;
  proposedInvariant: string;
  suggestedFailingTest: string;
  suggestedOrganicFixCategory: string;
  humanApprovalRequired: true;
};

export type BuildHumanCaughtBugReviewInput = {
  rootDir?: string;
  sessionDir: string;
  bug: string;
  generatedAt?: string;
  outDir?: string;
  writeFiles?: boolean;
};

export const SEEDED_HUMAN_BUG_INVARIANTS: LabInvariant[] = [
  {
    code: "word_radar_audio_affordance_requires_narration",
    source: "human_caught_bug",
    invariant:
      "A visible hear/mic affordance in a recall activity must produce audio proof through narration_request or local preview audio.",
    suggestedFailingTest:
      "Word Radar response state with a visible mic automatically or explicitly emits narration_request for the current target.",
  },
  {
    code: "word_radar_hidden_scaffold_not_fillable_boxes",
    source: "human_caught_bug",
    invariant:
      "Hidden recall scaffolds must not look like fillable answer boxes unless the activity actually fills them.",
    suggestedFailingTest:
      "Word Radar partial visual recall labels blank scaffolds as a length hint and does not call them boxes.",
  },
  {
    code: "companion_claim_must_match_activity_evidence",
    source: "human_caught_bug",
    invariant:
      "Companion summaries must not claim perfect mastery when the authoritative activity evidence is below perfect.",
    suggestedFailingTest:
      "Companion/session summary generation cannot say 100 percent perfect when Word Radar node evidence is 60 percent.",
  },
];

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file: string, value: unknown): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readText(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function readNdjson(file: string): Record<string, unknown>[] {
  return readText(file)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((row): row is Record<string, unknown> => row !== null);
}

function missReviewDirFor(rootDir: string, generatedAt: string): string {
  return path.join(
    rootDir,
    ".sunny-sandbox",
    "lab",
    "miss-reviews",
    generatedAt.replace(/[:.]/g, "-"),
  );
}

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function eventHasWordRadarNarrationRequest(row: Record<string, unknown>): boolean {
  const joined = JSON.stringify(row).toLowerCase();
  const isNarration =
    String(row.type ?? "").toLowerCase() === "narration_request" ||
    String(row.action ?? "").toLowerCase() === "narration_request" ||
    String(row.trigger ?? "").toLowerCase() === "narration_request" ||
    joined.includes('"type":"narration_request"') ||
    joined.includes('"trigger":"narration_request"');
  return isNarration && joined.includes("word-radar");
}

function wordRadarCompletionPercent(traces: Record<string, unknown>[]): number | null {
  const row = traces
    .filter((candidate) => String(candidate.game ?? candidate.activityId ?? "").toLowerCase() === "word-radar")
    .reverse()
    .find((candidate) => {
      const type = String(candidate.type ?? "");
      return type === "node_complete" || type === "game_complete" || candidate.accuracy !== undefined;
    });
  if (!row) return null;
  const accuracy = Number(row.accuracy);
  return Number.isFinite(accuracy) ? Math.round(accuracy * 100) : null;
}

export function buildInvariantCoverage(input: {
  knownHumanBugInvariants: LabInvariant[];
  coveredInvariantCodes: string[];
}): InvariantCoverageResult {
  const covered = new Set(input.coveredInvariantCodes);
  const items = input.knownHumanBugInvariants.map((invariant) => {
    const isCovered = covered.has(invariant.code);
    return {
      invariantCode: invariant.code,
      covered: isCovered,
      blocking: !isCovered,
      invariant: invariant.invariant,
      suggestedFailingTest: invariant.suggestedFailingTest,
    };
  });
  return {
    knownCount: items.length,
    coveredCount: items.filter((item) => item.covered).length,
    missingCount: items.filter((item) => !item.covered).length,
    blockingFailures: items.filter((item) => item.blocking).map((item) => item.invariantCode),
    items,
  };
}

export function buildHumanCaughtBugReview(
  input: BuildHumanCaughtBugReviewInput,
): HumanCaughtBugReview {
  const rootDir = input.rootDir ?? process.cwd();
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const sessionDir = path.resolve(input.sessionDir);
  const outDir = input.outDir ?? missReviewDirFor(rootDir, generatedAt);
  const bugText = input.bug.trim();
  if (!bugText) {
    throw new Error("--bug is required for a human-caught bug review");
  }

  const transcript = readText(path.join(sessionDir, "transcript.md"));
  const events = readNdjson(path.join(sessionDir, "events.ndjson"));
  const traces = readNdjson(path.join(sessionDir, "game-traces.ndjson"));
  const evidence: HumanCaughtBugEvidence[] = [];
  const logEvidence: string[] = [];
  const missCauses = new Set<LabMissCause>();
  const lowerBug = bugText.toLowerCase();

  const percent = wordRadarCompletionPercent(traces);
  if (percent !== null) {
    logEvidence.push(`Word Radar completed at ${percent}%`);
  }

  const humanNoticedAudio = includesAny(lowerBug, [/mic|microphone|sound|audio|hear|play/]);
  const wordRadarNarrationRequestSeen = [...events, ...traces].some(eventHasWordRadarNarrationRequest);
  if (humanNoticedAudio && !wordRadarNarrationRequestSeen) {
    evidence.push({
      code: "word_radar_narration_request_missing",
      severity: "high",
      source: "session_logs",
      evidence: "Word Radar ran, but logs contain no word-radar narration_request for the visible hear/mic affordance.",
    });
    logEvidence.push("Logs caught the absence only indirectly: no Word Radar narration_request was recorded.");
    missCauses.add("log_signal_missing");
    missCauses.add("lab_assertion_missing");
  }

  if (includesAny(lowerBug, [/box|boxes|fill|blank|empty/])) {
    evidence.push({
      code: "word_radar_fillable_box_affordance_unchecked",
      severity: "high",
      source: "human_observation",
      evidence:
        "Human observed that hidden recall blanks looked like fillable boxes even though the activity did not fill them.",
    });
    logEvidence.push("Logs did not capture child-perception affordance: blank scaffold looked fillable.");
    missCauses.add("child_perception_not_asserted");
    missCauses.add("lab_assertion_missing");
  }

  const overpraiseSeen =
    /\b(100 percent|100%|perfect|crushed)\b/i.test(transcript) &&
    percent !== null &&
    percent < 95;
  if (overpraiseSeen) {
    evidence.push({
      code: "word_radar_overpraise_contradicts_evidence",
      severity: "high",
      source: "transcript",
      evidence: `Transcript used perfect/100% language while Word Radar evidence was ${percent}%.`,
    });
    logEvidence.push("Transcript contradicted activity evidence; logs had both facts but no invariant compared them.");
    missCauses.add("evidence_truth_not_compared");
    missCauses.add("lab_assertion_missing");
  }

  if (evidence.length === 0) {
    evidence.push({
      code: "human_bug_needs_manual_classification",
      severity: "warning",
      source: "human_observation",
      evidence: "The human observation did not match a seeded detector yet; add a new invariant before trusting readiness.",
    });
    missCauses.add("lab_assertion_missing");
  }

  const review: HumanCaughtBugReview = {
    reviewVersion: 1,
    generatedAt,
    sessionDir,
    outDir,
    humanObservation: bugText,
    sessionEvidence: evidence,
    logEvidence,
    labMissCause: [...missCauses],
    labGap:
      "The lab checked runtime contracts, but did not fully assert child-perception affordances or compare companion claims against authoritative activity evidence.",
    missingAssertion:
      "A visible mic/hear control must prove audio happened, hidden recall scaffolds must not look like fillable boxes unless they fill, and companion praise must match game evidence.",
    proposedInvariant:
      "Add product invariant coverage so human-caught child-session bugs become reusable lab assertions instead of one-off fixes.",
    suggestedFailingTest:
      "Word Radar hidden/visual recall must emit audio proof, label hidden scaffolds as non-fillable length hints, and block perfect companion summaries when evidence is below perfect.",
    suggestedOrganicFixCategory:
      "Domain-neutral lab invariant and activity contract coverage, not a child-specific or word-specific branch.",
    humanApprovalRequired: true,
  };

  if (input.writeFiles) {
    ensureDir(outDir);
    writeJson(path.join(outDir, "human-caught-bug-review.json"), review);
    fs.writeFileSync(
      path.join(outDir, "human-caught-bug-review.md"),
      renderHumanCaughtBugReviewMarkdown(review),
      "utf8",
    );
  }
  return review;
}

export function renderHumanCaughtBugReviewMarkdown(review: HumanCaughtBugReview): string {
  const lines = [
    "# Human-Caught Bug Review",
    "",
    `generatedAt: ${review.generatedAt}`,
    `sessionDir: ${review.sessionDir}`,
    "",
    "## Human Observation",
    review.humanObservation,
    "",
    "## Why did the human catch it?",
    "- The child-facing affordance violated expectation in the live experience.",
    "",
    "## Why did logs catch or miss it?",
    ...(review.logEvidence.length ? review.logEvidence.map((item) => `- ${item}`) : ["- No useful log evidence found."]),
    "",
    "## Why did the AI lab miss it?",
    `- ${review.labGap}`,
    "",
    "## Session Evidence",
    ...review.sessionEvidence.map((item) => `- [${item.severity}] ${item.code}: ${item.evidence}`),
    "",
    "## New Invariant",
    review.proposedInvariant,
    "",
    `Missing assertion: ${review.missingAssertion}`,
    `Suggested failing test: ${review.suggestedFailingTest}`,
    `Suggested organic fix category: ${review.suggestedOrganicFixCategory}`,
    "Human approval required: yes",
    "",
  ];
  return `${lines.join("\n")}`;
}
