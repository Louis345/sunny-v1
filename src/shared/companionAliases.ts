/**
 * Old companion ids that now name another companion (owner, 2026-11-10: "Matilda is Hikari"). Saved data, logs and
 * kiosk storage keep their old ids; every lookup goes through here so they reach the one companion.
 */
export const COMPANION_ID_ALIASES: Readonly<Record<string, string>> = { matilda: "hikari" };

export function canonicalCompanionId(id: string): string {
  const normalized = id.trim().toLowerCase();
  return COMPANION_ID_ALIASES[normalized] ?? normalized;
}

/** The old ids a companion's saved files may still carry, oldest data last. */
export function legacyCompanionIds(id: string): string[] {
  const canonical = canonicalCompanionId(id);
  return Object.keys(COMPANION_ID_ALIASES).filter((alias) => COMPANION_ID_ALIASES[alias] === canonical);
}
