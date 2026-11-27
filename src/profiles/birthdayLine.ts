/** Her birthday as a plain dated fact for every companion: today, or within the week ahead (owner 2026-11-15, 11/20). */
const BIRTHDAY_AHEAD_DAYS = 7;
const dayNumber = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / 86_400_000;
const daysBetween = (from: string, to: string) => Math.round(dayNumber(to) - dayNumber(from));
const spokenDay = (day: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(new Date(`${day}T12:00:00Z`));

/** `today` is her family calendar day (YYYY-MM-DD). */
export function birthdayLine(birthDate: string | undefined, today: string): string | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const year = Number(today.slice(0, 4));
  for (const candidateYear of [year, year + 1]) {
    const day = `${candidateYear}${birthDate.slice(4)}`;
    const until = daysBetween(today, day);
    if (until < 0) continue;
    if (until > BIRTHDAY_AHEAD_DAYS) return null;
    const turns = candidateYear - Number(birthDate.slice(0, 4));
    if (until === 0) return `Today is her birthday: she is ${turns} today.`;
    return `Her birthday is ${until === 1 ? "tomorrow" : `in ${until} days`} (${spokenDay(day)}); she turns ${turns}.`;
  }
  return null;
}
