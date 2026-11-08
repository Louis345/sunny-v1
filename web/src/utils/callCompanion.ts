/** The companion an earned call opens on: the one its address names (BUGS.md 2026-11-08), else the first. */
export function callCompanionIndex(entries: ReadonlyArray<{ id: string }>, search: string): number {
  const wanted = new URLSearchParams(search).get("companion")?.trim().toLowerCase();
  const index = wanted ? entries.findIndex(entry => entry.id.toLowerCase() === wanted) : -1;
  return index >= 0 ? index : 0;
}

/**
 * The call she may take now (owner, 2026-11-08): an unopened ticket for this homework earned after the current
 * board was published, so it is offered at that board's end and during the next-board wait, and not after the
 * next board is up. Without a publish time (an older server), the newest unopened ticket.
 */
export function offerableCallTicket<T extends { homeworkId: string; earnedAt: string; openedAt?: string | null }>(
  tickets: readonly T[] | undefined, homeworkId: string | undefined, boardPublishedAt: string | null | undefined,
): T | undefined {
  const open = (tickets ?? []).filter(ticket => ticket.homeworkId === homeworkId && !ticket.openedAt);
  const fresh = boardPublishedAt ? open.filter(ticket => Date.parse(ticket.earnedAt) >= Date.parse(boardPublishedAt)) : open;
  return fresh.at(-1);
}
