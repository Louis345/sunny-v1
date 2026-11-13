import { expect, it } from "vitest";
import { currentDemographics } from "../profiles/currentDemographics";

// 2026-11-10, Fable audit plus the owner: the AIs were told Ila is in grade 2 (she is in grade 3 at Pashley), and
// Reina's age was 7 in one file and 8 in another. Ages and grades were numbers typed once that never moved. A
// child's facts now carry dates: her age comes from her birthday, and her grade from the school year it was
// confirmed for, moving up each August. "We need to remember kids' ages."
const base = { age: 8, grade: 2, diagnoses: [], learningStyle: "mixed" as const, attentionSpan: "moderate" as const, iepActive: false };

it("works out today's age from her birthday and her grade from the school year it was confirmed for", () => {
  const facts = { ...base, birthDate: "2018-03-14", grade: 3, gradeSchoolYear: 2026 };
  expect(currentDemographics(facts, new Date("2026-11-10T12:00:00Z"))).toMatchObject({ age: 8, grade: 3 });
  expect(currentDemographics(facts, new Date("2027-03-14T12:00:00Z"))).toMatchObject({ age: 9, grade: 3 });
  expect(currentDemographics(facts, new Date("2027-09-02T12:00:00Z"))).toMatchObject({ age: 9, grade: 4 });
});

it("keeps typed numbers as they are when no date is known, and says so", () => {
  expect(currentDemographics(base, new Date("2026-11-10T12:00:00Z"))).toMatchObject({ age: 8, grade: 2, factsUndated: ["age", "grade"] });
});
