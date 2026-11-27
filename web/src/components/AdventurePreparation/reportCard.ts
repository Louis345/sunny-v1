/**
 * The waiting screen as a report card (owner 2026-11-15: "show their improvements so it's encouraging, like a report
 * card"). Her answers are sorted honestly: on her own first try, fixed it, with help, still growing (and practised
 * when an answer has no mark). Progress compares her on-her-own count with the board before. Facts only; nothing is
 * upgraded: a helped answer is never "on her own".
 */
export type ReportItem = { face: string; spoken: string; correct?: boolean; helped?: boolean; own?: boolean; improved?: boolean };
export type ReportGroup = "own" | "fixed" | "helped" | "growing" | "practised";
export const REPORT_GROUPS: readonly ReportGroup[] = ["own", "fixed", "helped", "growing", "practised"];

export function reportGroupOf(item: ReportItem): ReportGroup {
  if (item.own && item.correct !== false) return "own";
  if (item.correct === true) return item.helped ? "helped" : "fixed";
  if (item.correct === false) return "growing";
  return "practised";
}

export function reportCardGroups<T extends ReportItem>(items: readonly T[]): Record<ReportGroup, Array<T & { index: number }>> {
  const groups: Record<ReportGroup, Array<T & { index: number }>> = { own: [], fixed: [], helped: [], growing: [], practised: [] };
  items.forEach((item, index) => groups[reportGroupOf(item)].push({ ...item, index }));
  return groups;
}

/** On-her-own count now, and on the board before when there was one. */
export function ownProgress(now: readonly ReportItem[], before: readonly ReportItem[] | undefined): { now: number; before: number | null } {
  const own = (list: readonly ReportItem[]) => list.filter(item => reportGroupOf(item) === "own").length;
  return { now: own(now), before: before?.length ? own(before) : null };
}
