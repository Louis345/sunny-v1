/**
 * One family calendar (teaching-record spec, revision 9). Timestamps stay UTC; every "which day was it" question is
 * answered in the family's time zone: SUNNY_FAMILY_TIME_ZONE, else the machine's own zone (Saori's), else UTC.
 */
export function familyTimeZone(): string {
  const zone = process.env.SUNNY_FAMILY_TIME_ZONE?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
    return zone;
  } catch {
    console.warn(` 🎮 [family-calendar] [time-zone] [unknown] zone=${zone} using=UTC`);
    return "UTC";
  }
}

/** The family's calendar day (YYYY-MM-DD) for a timestamp. A plain date is already a day and is kept as it is. */
export function familyDay(value: string | Date | undefined | null): string {
  if (value == null || value === "") return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return typeof value === "string" ? value.slice(0, 10) : "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: familyTimeZone(), year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
