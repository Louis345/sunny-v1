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

/** The call the map offers: her saved tickets plus the one the server just returned for this board (BUGS.md
 * 2026-11-09, Reina's map had no Call button because the saved list predates the ticket). Same freshness rule. */
export function boardCallTicket<T extends { homeworkId: string; earnedAt: string; openedAt?: string | null }>(
  saved: readonly T[] | undefined, serverTicket: T | undefined, homeworkId: string | undefined, boardPublishedAt: string | null | undefined,
): T | undefined {
  const known = (saved ?? []).some(ticket => serverTicket && ticket.homeworkId === serverTicket.homeworkId && ticket.earnedAt === serverTicket.earnedAt);
  return offerableCallTicket([...(saved ?? []), ...(serverTicket && !known ? [serverTicket] : [])], homeworkId, boardPublishedAt);
}

/**
 * What the call's portrait draws (BUGS.md 2026-11-08: a bought dress was missing in the call): in an earned
 * call, the dressable body wearing her outfit and accessory; otherwise the plain companion.
 */
export function callPortraitLook<E, V>(input: {
  shopEnabled: boolean; current: E; dressable: E | null; outfitId: string; accessoryId: string; materialVariant: V | null;
  /** The dressable body failed to load (2026-11-10, Princess had no face): draw her own model instead. */
  dressableFailed?: boolean;
}): { entry: E; outfitId: string; accessoryId: string; materialVariant: V | null } {
  if (!input.shopEnabled || !input.dressable || input.dressableFailed) return { entry: input.current, outfitId: "none", accessoryId: "none", materialVariant: null };
  return { entry: input.dressable, outfitId: input.outfitId, accessoryId: input.accessoryId, materialVariant: input.materialVariant };
}
