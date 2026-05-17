import fs from "fs";
import path from "path";

type AuditIssue = {
  severity: "info" | "warning" | "high";
  code: string;
  message: string;
};

type AuditReport = {
  sessionDir: string;
  issues: AuditIssue[];
  counts: Record<string, number>;
};

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

function countMentions(text: string, pattern: RegExp): number {
  return Array.from(text.matchAll(pattern)).length;
}

function summaryTotalAttempts(summary: string): number | null {
  const direct = summary.match(/session finalized:\s*(\d+)\s*attempts/i);
  if (direct) return Number(direct[1]);
  const compact = summary.match(/session_finalized[^\n]*\btotalAttempts\s*=\s*(\d+)/i);
  if (compact) return Number(compact[1]);
  const json = summary.match(/"totalAttempts"\s*:\s*(\d+)/);
  return json ? Number(json[1]) : null;
}

function traceNumber(row: Record<string, unknown>, key: string): number {
  const n = Number(row[key]);
  return Number.isFinite(n) ? n : 0;
}

function wordCount(text: string): number {
  return text.split(/\s+/).map((word) => word.trim()).filter(Boolean).length;
}

export function auditSessionDirectory(sessionDir: string): AuditReport {
  const resolved = path.resolve(sessionDir);
  const transcript = readText(path.join(resolved, "transcript.md"));
  const summary = readText(path.join(resolved, "summary.md"));
  const events = readNdjson(path.join(resolved, "events.ndjson"));
  const traces = readNdjson(path.join(resolved, "game-traces.ndjson"));
  const issues: AuditIssue[] = [];

  const add = (severity: AuditIssue["severity"], code: string, message: string) => {
    issues.push({ severity, code, message });
  };

  if (!fs.existsSync(path.join(resolved, "game-traces.ndjson"))) {
    add("high", "missing_game_trace", "Session has no game-traces.ndjson; AI cannot audit exact game state.");
  }

  const launchedGames = new Set(
    traces
      .map((row) => String(row.game ?? row.activityId ?? "").toLowerCase())
      .filter(Boolean),
  );
  const openerFirstNode = transcript.match(/First map node:\s*([a-z0-9-]+)/i)?.[1]?.toLowerCase();
  const launchedFirstGame = traces
    .map((row) => String(row.type ?? "") === "node_launched" ? String(row.game ?? row.activityId ?? "").toLowerCase() : "")
    .find(Boolean);
  if (openerFirstNode && launchedFirstGame && openerFirstNode !== launchedFirstGame) {
    add(
      "high",
      "opener_game_mismatch",
      `Session opener named ${openerFirstNode}, but the first launched game was ${launchedFirstGame}.`,
    );
  }
  if (countMentions(transcript, /\bword radar\b/gi) > 0 && !launchedGames.has("word-radar")) {
    add("high", "impossible_activity_mention", "Companion mentioned Word Radar, but game traces do not show Word Radar active.");
  }

  let syntheticPromptLeakReported = false;
  let wordRadarVisibleReported = false;
  let pronunciationBackgroundHitReported = false;
  for (const row of traces) {
    const game = String(row.game ?? "").toLowerCase();
    const visibility = String(row.answerVisibility ?? "");
    const phase = String(row.phase ?? "");
    const word = String(row.currentWord ?? "");
    const transcriptText = String(row.transcript ?? "");
    const lastHeard = String(row.lastHeard ?? "");
    if (!syntheticPromptLeakReported && /\[Session start\b|homework map mounted|First map node:/i.test(lastHeard)) {
      syntheticPromptLeakReported = true;
      add("high", "synthetic_prompt_in_game_state", `Synthetic session prompt leaked into ${game || "game"} state.`);
    }
    if (game.includes("wheel") && visibility === "hidden" && word && transcript.toLowerCase().includes(word.toLowerCase())) {
      add("high", "hidden_answer_leak_risk", `Wheel target "${word}" appeared in transcript while answerVisibility=hidden.`);
    }
    if (
      !wordRadarVisibleReported &&
      game.includes("word-radar") &&
      visibility === "visible" &&
      (String(row.currentTarget ?? row.currentWord ?? row.expected ?? "").trim() ||
        String(row.phase ?? "") === "response")
    ) {
      wordRadarVisibleReported = true;
      add(
        "high",
        "word_radar_answer_visible",
        "Word Radar exposed the target during a recall/response state; this invalidates recall evidence.",
      );
    }
    if (
      !pronunciationBackgroundHitReported &&
      game.includes("pronunciation") &&
      phase === "hit" &&
      wordCount(lastHeard) > 6
    ) {
      pronunciationBackgroundHitReported = true;
      add(
        "high",
        "pronunciation_background_hit_risk",
        `Pronunciation scored a hit from a long transcript tail (${wordCount(lastHeard)} words); likely background or stale speech contamination.`,
      );
    }
    if (
      String(row.type ?? "") === "transcript_suppressed" &&
      /\b(what word|which word|say the word|say it|didn'?t say|did not say|help|that'?s wrong|not right|game skipped|it skipped)\b/i.test(transcriptText)
    ) {
      add("high", "suppressed_help_request", `Suppressed child help/product utterance during ${game || "active game"}: "${transcriptText.slice(0, 120)}"`);
    }
    if (game.includes("pronunciation") && phase === "complete") {
      const hitEvents = traceNumber(row, "hitEvents") || traceNumber(row, "wordsHit");
      const totalWords = traceNumber(row, "totalWords");
      const uniqueTargets = traceNumber(row, "uniqueTargetsAttempted") || totalWords;
      if (totalWords > 0 && hitEvents > totalWords * 2 && uniqueTargets <= totalWords) {
        add("high", "pronunciation_hit_inflation", `Pronunciation logged ${hitEvents} hit events for ${totalWords} targets; audit unique target evidence before adapting.`);
      }
    }
  }

  const attempts = summaryTotalAttempts(summary);
  const chartAttemptEvents = events.filter((row) =>
    ["attempt_event", "session_finalized"].includes(String(row.action ?? "")) ||
    String(row.component ?? "") === "engine",
  );
  if (attempts === 0 && traces.some((row) => String(row.type ?? "") === "node_complete")) {
    add("high", "zero_attempt_summary_mismatch", "Summary reports zero attempts even though game traces include completed nodes.");
  }

  const repeatedAheadHelp = countMentions(transcript, /a-head|uh-head|ahead/gi);
  if (repeatedAheadHelp >= 5) {
    add("warning", "repeated_help_loop", `Transcript contains ${repeatedAheadHelp} ahead/a-head help mentions; check scaffold escalation.`);
  }
  if (/\b(cashew|cash shoe)\b/i.test(transcript)) {
    add("warning", "misheard_off_topic_response", "Transcript includes likely off-topic cashew/cash-shoe response.");
  }
  if (/\bnot (ee-lah|ila)|\bayla\b|\bisla\b/i.test(transcript)) {
    add("warning", "child_name_pronunciation", "Child corrected name pronunciation; verify spoken-name preference.");
  }

  return {
    sessionDir: resolved,
    issues,
    counts: {
      events: events.length,
      gameTraces: traces.length,
      chartAttemptEvents: chartAttemptEvents.length,
      transcriptWordRadarMentions: countMentions(transcript, /\bword radar\b/gi),
    },
  };
}

export function renderAuditMarkdown(report: AuditReport): string {
  const lines = [
    "# Sunny Session Audit",
    "",
    `sessionDir: ${report.sessionDir}`,
    "",
    "## Counts",
    ...Object.entries(report.counts).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Issues",
  ];
  if (report.issues.length === 0) {
    lines.push("- none detected");
  } else {
    for (const issue of report.issues) {
      lines.push(`- [${issue.severity}] ${issue.code}: ${issue.message}`);
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function parseDirArg(argv: string[]): string {
  const flag = argv.find((arg) => arg.startsWith("--dir="));
  if (flag) return flag.slice("--dir=".length);
  const idx = argv.indexOf("--dir");
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1]!;
  throw new Error("usage: npm run sunny:session:audit -- --dir=/path/to/session");
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const dir = parseDirArg(process.argv.slice(2));
  const report = auditSessionDirectory(dir);
  const markdown = renderAuditMarkdown(report);
  fs.writeFileSync(path.join(report.sessionDir, "audit.md"), markdown, "utf8");
  process.stdout.write(markdown);
}
