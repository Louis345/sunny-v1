/**
 * The kiosk's report of what the child is looking at is the only screen description Elli receives.
 * It is checked against the server's current board; anything unconfirmed is reported as unknown or
 * updating, never guessed.
 */
export type ScreenKind = "loading" | "unavailable" | "evaluation" | "waiting" | "board" | "activity";

export type ScreenReport = {
  screen: ScreenKind;
  boardId?: string;
  boardTitle?: string;
  nodeId?: string;
  activityTitle?: string;
  waiting?: { step?: string; detail?: string; ready?: number; total?: number };
};

const KINDS = new Set<ScreenKind>(["loading", "unavailable", "evaluation", "waiting", "board", "activity"]);
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : undefined);
const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined);

export function normalizeScreenReport(raw: unknown): ScreenReport | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (!KINDS.has(row.screen as ScreenKind)) return null;
  const waiting = row.waiting && typeof row.waiting === "object" ? row.waiting as Record<string, unknown> : undefined;
  return {
    screen: row.screen as ScreenKind,
    ...(text(row.boardId) ? { boardId: text(row.boardId) } : {}),
    ...(text(row.boardTitle) ? { boardTitle: text(row.boardTitle) } : {}),
    ...(text(row.nodeId) ? { nodeId: text(row.nodeId) } : {}),
    ...(text(row.activityTitle) ? { activityTitle: text(row.activityTitle) } : {}),
    ...(waiting ? { waiting: { step: text(waiting.step), detail: text(waiting.detail), ready: count(waiting.ready), total: count(waiting.total) } } : {}),
  };
}

/** The homework's published boards (the kiosk may show any of them) and the newest one, when known. */
export type ServerBoards = { published: string[]; newest: string | undefined };
type ScreenCheck = { report: ScreenReport | null; boards: ServerBoards; activityNodeId: string | undefined };

/** A board the server has not published for this homework cannot be described. */
function boardUnknown(report: ScreenReport, boards: ServerBoards): boolean {
  return Boolean(report.boardId) && boards.published.length > 0 && !boards.published.includes(report.boardId!);
}

/** True only when the kiosk reports, on a known board, the exact activity the live state belongs to. */
export function screenShowsActivity(input: ScreenCheck): boolean {
  const { report } = input;
  if (!report || (report.screen !== "activity" && report.screen !== "evaluation")) return false;
  if (boardUnknown(report, input.boards)) return false;
  return Boolean(report.nodeId) && report.nodeId === input.activityNodeId;
}

export function describeScreenForCompanion(input: {
  report: ScreenReport | null;
  boards: ServerBoards;
  /** Live state of the activity the server last heard from, and which node it belongs to. */
  activityContext: string;
  activityNodeId: string | undefined;
}): string {
  const { report } = input;
  const header = "[Screen: what the child sees, reported by the kiosk]";
  if (!report) return `${header}\nThe screen is unknown (the kiosk has not reported yet). Do not describe the screen.`;
  if (boardUnknown(report, input.boards)) return `${header}\nThe screen is updating. Do not describe the screen yet.`;
  // The kiosk keeps the finished board for this visit; by contract the newer board opens at the next visit.
  const nextVisit = report.boardId && input.boards.newest && report.boardId !== input.boards.newest
    ? "The next board is ready for the next visit." : undefined;
  switch (report.screen) {
    case "loading": return `${header}\nSunny is still loading.`;
    case "unavailable": return `${header}\nThe board could not be loaded.`;
    case "waiting": {
      const progress = report.waiting?.total ? `${report.waiting.ready ?? 0} of ${report.waiting.total} activities ready.` : undefined;
      return [header, "The waiting screen is showing.", report.waiting?.step, report.waiting?.detail, progress].filter(Boolean).join("\n");
    }
    case "board":
      return [header, `The board is showing${report.boardTitle ? `: ${report.boardTitle}` : ""}. No activity is open.`, nextVisit].filter(Boolean).join("\n");
    case "evaluation":
    case "activity": {
      const title = report.activityTitle ?? (report.screen === "evaluation" ? "The spelling check" : "An activity");
      // Activity details describe the screen only when they come from the activity that is actually open.
      if (!screenShowsActivity(input) || !input.activityContext) return `${header}\n${title} is opening.`;
      return `${header}\n${title} is open.\n\n${input.activityContext}`;
    }
  }
}
