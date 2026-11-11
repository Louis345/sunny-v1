import { familyDay } from "../utils/familyCalendar";
import type { LearningProfile } from "../context/schemas/learningProfile";

type Demographics = LearningProfile["demographics"];

/** A school year starts in August: 2026 means 2026-27. */
const schoolYearOf = (date: Date) => date.getUTCFullYear() - (date.getUTCMonth() < 7 ? 1 : 0);

/**
 * A child's facts as of today (2026-11-10: Ila was "grade 2" a year after she moved up; Reina was 7 in one file and
 * 8 in another). Age comes from her birthday when known; grade moves up each August from the school year it was
 * confirmed for. Facts with no date stay as typed and are named, so the reader knows they may be old.
 */
export function currentDemographics(facts: Demographics, today = new Date()): Demographics & { factsUndated?: string[] } {
  const undated: string[] = [];
  let age = facts.age;
  const birth = facts.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(facts.birthDate) ? new Date(`${facts.birthDate}T12:00:00Z`) : undefined;
  if (birth && facts.birthDate) {
    // Her birthday is a family calendar day: the evening before is still the day before (one family time zone).
    const [year, month, day] = familyDay(today).split("-").map(Number);
    const [bornYear, bornMonth, bornDay] = facts.birthDate.split("-").map(Number);
    age = year - bornYear;
    if (month < bornMonth || (month === bornMonth && day < bornDay)) age -= 1;
  } else undated.push("age");
  let grade = facts.grade;
  if (typeof facts.gradeSchoolYear === "number") grade = facts.grade + Math.max(0, schoolYearOf(today) - facts.gradeSchoolYear);
  else undated.push("grade");
  return { ...facts, age, grade, ...(undated.length ? { factsUndated: undated } : {}) };
}
