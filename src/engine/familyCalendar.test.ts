import { afterEach, describe, expect, it, vi } from "vitest";
import { currentDemographics } from "../profiles/currentDemographics";
import { minutesByDay } from "./sessionTime";
import { familyDay, familyTimeZone } from "../utils/familyCalendar";

// 2026-11-10: Ila plays after school into the evening. 7:30pm in Glenville is 00:30 the next day in UTC, so days
// cut from UTC timestamps put an evening session on "tomorrow". One family time zone; timestamps stay UTC.
afterEach(() => vi.unstubAllEnvs());
const minutes = { learning: 10, play: 0, call: 0, waiting: 0, map: 0, other: 0, unmeasured: 0, total: 10 };

describe("one family calendar", () => {
  it("names the day an evening session happened in the family's time zone", () => {
    vi.stubEnv("SUNNY_FAMILY_TIME_ZONE", "America/New_York");
    expect(familyTimeZone()).toBe("America/New_York");
    expect(familyDay("2026-11-11T00:30:00.000Z")).toBe("2026-11-10");
    expect(familyDay(new Date("2026-11-11T15:00:00.000Z"))).toBe("2026-11-11");
  });

  it("keeps a plain date as the date it names", () => {
    vi.stubEnv("SUNNY_FAMILY_TIME_ZONE", "America/New_York");
    expect(familyDay("2026-11-12")).toBe("2026-11-12");
    expect(familyDay(undefined)).toBe("");
  });

  it("falls back to UTC for a time zone the machine does not know", () => {
    vi.stubEnv("SUNNY_FAMILY_TIME_ZONE", "Not/AZone");
    expect(familyTimeZone()).toBe("UTC");
  });

  it("adds an evening session's minutes to that evening, not the next day", () => {
    vi.stubEnv("SUNNY_FAMILY_TIME_ZONE", "America/New_York");
    expect(minutesByDay([{ startedAt: "2026-11-11T00:30:00.000Z", minutes }]).map(row => row.day)).toEqual(["2026-11-10"]);
  });

  it("does not turn her a year older on the evening before her birthday", () => {
    vi.stubEnv("SUNNY_FAMILY_TIME_ZONE", "America/New_York");
    const facts = { birthDate: "2017-11-21", age: 8, grade: 3 } as never;
    expect(currentDemographics(facts, new Date("2026-11-21T01:00:00.000Z")).age).toBe(8);
    expect(currentDemographics(facts, new Date("2026-11-21T15:00:00.000Z")).age).toBe(9);
  });
});
