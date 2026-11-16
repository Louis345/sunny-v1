import { describe, expect, it } from "vitest";
import { arrangeShelf, daysUntil, pickerMode } from "../storybook/subjectShelf";
import { CALM_PICTURES_CONFIG, ILA_SHELF, MOCK_TODAY, NOTHING_DUE_SHELF, ONE_SUBJECT_SHELF, THREE_SUBJECT_SHELF } from "../storybook/subjectPickerFixtures";

describe("subject picker mockup rules (same for every child)", () => {
  it("counts sleeps until a dated test", () => {
    expect(daysUntil("2026-11-19", MOCK_TODAY)).toBe(3);
    expect(daysUntil(null, MOCK_TODAY)).toBeNull();
  });

  it("puts the suggested book first, then the soonest dated one", () => {
    expect(arrangeShelf(ILA_SHELF, MOCK_TODAY).map((s) => s.domain)).toEqual(["spelling", "math"]);
    expect(arrangeShelf(THREE_SUBJECT_SHELF, MOCK_TODAY).map((s) => s.domain)).toEqual(["math", "reading", "spelling"]);
    expect(arrangeShelf(NOTHING_DUE_SHELF, MOCK_TODAY).map((s) => s.domain)).toEqual(["math", "spelling"]);
  });

  it("skips the choice when the config says so and there is only one book", () => {
    expect(pickerMode(ONE_SUBJECT_SHELF, CALM_PICTURES_CONFIG)).toBe("auto-open");
    expect(pickerMode(ONE_SUBJECT_SHELF, { ...CALM_PICTURES_CONFIG, singleSubject: "show" })).toBe("choose");
    expect(pickerMode([], CALM_PICTURES_CONFIG)).toBe("empty");
  });
});
