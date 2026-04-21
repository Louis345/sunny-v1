/** DEBUG_CLAUDE logging — session is SessionManager. */
// @ts-nocheck
import { isDebugClaude } from "../utils/runtimeMode";

export function debugSafeJson(value: unknown, maxLen = 4000): string {
  try {
    const s =
      typeof value === "string"
        ? JSON.stringify(value)
        : JSON.stringify(value, (_k, v) =>
            typeof v === "bigint" ? String(v) : v,
          );
    return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
  } catch {
    return JSON.stringify(String(value));
  }
}

export function debugPrintClaudePreRun(
  session: any,
  rawUserMessage: string,
): void {
  if (!isDebugClaude()) return;
  const c = session.ctx?.canvas.current;
  const modeStr = String(
    c?.mode ??
      (session.currentCanvasState as { mode?: string } | null)?.mode ??
      "idle",
  );
  let showing = "(idle)";
  if (modeStr === "worksheet_pdf" && c?.activeProblemId) {
    showing = `problem ${c.activeProblemId} image`;
  } else if (modeStr === "teaching" && c?.content) {
    const full = String(c.content);
    const t = full.replace(/\s+/g, " ").slice(0, 80);
    showing = t.length < full.length ? `${t}…` : t;
  } else if (modeStr !== "idle") {
    showing = modeStr;
  }

  const lines: string[] = [
    "═══════════════════════════════",
    "CLAUDE SEES THIS:",
    "───────────────────────────────",
    "[Canvas State]",
    `Mode: ${modeStr}`,
    `Showing: ${showing}`,
    `canvasShowing: ${modeStr}`,
    "",
    "[Session State]",
  ];

  if (session.worksheetSession) {
    const st = session.worksheetSession.getSessionStatus();
    lines.push(
      `Problems: ${st.problemsCompleted}/${st.problemsTotal} complete`,
    );
    lines.push(`Reward threshold: ${st.rewardThreshold}`);
  } else if (session.ctx?.assignment) {
    const a = session.ctx.assignment;
    const done = a.attempts.filter((x) => x.correct).length;
    lines.push(
      `Problems: ${done}/${a.questions.length} correct (q index ${a.currentIndex})`,
    );
    lines.push(`Reward threshold: —`);
  } else {
    lines.push("Problems: —");
    lines.push(
      `Reward threshold: ${session.worksheetMode ? String(session.worksheetRewardAfterN) : "—"}`,
    );
  }

  const elapsedMin =
    session.sessionStartTime > 0
      ? Math.max(0, Math.round((Date.now() - session.sessionStartTime) / 60000))
      : 0;
  lines.push(
    `Elapsed: ${session.sessionStartTime > 0 ? `${elapsedMin} min` : "—"}`,
  );
  lines.push("");
  lines.push("[User said]");
  lines.push(JSON.stringify(rawUserMessage));
  lines.push("═══════════════════════════════");
  console.log(lines.join("\n"));
}

export function debugLogToolCall(
  session: any,
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
): void {
  if (!isDebugClaude()) return;
  const argStr = debugSafeJson(args, 3000);
  const resStr = debugSafeJson(
    result === undefined ? "(undefined)" : result,
    3000,
  );
  console.log(`→ TOOL: ${toolName}(${argStr})`);
  console.log(`← RESULT: ${resStr}`);
}

export function debugCreatorOpeningLineForSession(session: any): string {
  const name = session.companion.name;
  const child = session.sessionTtsLabel;
  const worksheetBit = session.worksheetMode
    ? " Worksheet is loaded — grade from the pinned image, and drive canvasShow, sessionLog, canvasClear, sessionStatus, and launchGame."
    : "";
  return (
    `Hi creator — ${name} here, DEBUG session.${worksheetBit} ` +
    `I'm not running a normal kid session with ${child}; you're stress-testing reasoning and tool use. ` +
    `Tell me what to verify first and I'll say what I'm doing and why.`
  );
}

export function applyDebugClaudeOpeningLineForSession(session: any): void {
  if (!isDebugClaude()) return;
  session.companion = {
    ...session.companion,
    openingLine: debugCreatorOpeningLineForSession(session),
  };
}

/** Prepends developer-testing instructions when DEBUG_CLAUDE=true. */
export function prependDebugClaudeDeveloperBlock(prompt: string): string {
  if (!isDebugClaude()) return prompt;
  return (
    `⚠️  DEBUG MODE — DEVELOPER IS TESTING YOU\n\n` +
    `You are NOT tutoring a child. You are a test harness.\n` +
    `A developer is verifying your capabilities and reasoning.\n\n` +
    `YOUR ONLY JOB:\n` +
    `- Demonstrate capabilities when asked\n` +
    `- Show what you can and cannot do\n` +
    `- Be direct about what tools you have\n` +
    `- Execute requests immediately — no redirecting\n\n` +
    `RULES:\n` +
    `- If asked to show a riddle → show it using canvasShow with the best available type\n` +
    `- If asked to show math → show it\n` +
    `- If asked to clear → clear it\n` +
    `- Do NOT say 'but we should do the worksheet first'\n` +
    `- Do NOT redirect to homework unprompted\n` +
    `- Do NOT act like a tutor\n\n` +
    `CAPABILITY LOGIC:\n` +
    `When asked to display something:\n` +
    `  1. Check if a specific canvas type fits (riddle, place_value, spelling, etc.)\n` +
    `  2. If yes → use it\n` +
    `  3. If no dedicated type → use svg_raw or text\n` +
    `  4. Never say 'I can't' if text or svg can achieve it\n\n` +
    `The worksheet is present but irrelevant unless the developer specifically asks about it.\n` +
    `Confirm every tool call you make and why.\n\n` +
    prompt
  );
}
