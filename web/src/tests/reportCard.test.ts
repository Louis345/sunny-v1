import { expect, it } from "vitest";
import { ownProgress, reportCardGroups, reportGroupOf } from "../components/AdventurePreparation/reportCard";

// 2026-11-15 (Ila on the waiting screen, owner): marks must be honest and the screen should show her improvement like
// a report card. Every answer lands in exactly one group; a helped answer is never "on her own".
it("sorts every answer into one honest group", () => {
  expect(reportGroupOf({ face: "60", spoken: "", own: true, correct: true })).toBe("own");
  expect(reportGroupOf({ face: "36", spoken: "", correct: true })).toBe("fixed");
  expect(reportGroupOf({ face: "50", spoken: "", correct: true, helped: true })).toBe("helped");
  expect(reportGroupOf({ face: "50", spoken: "", own: false, correct: true, helped: true })).toBe("helped");
  expect(reportGroupOf({ face: "45", spoken: "", correct: false })).toBe("growing");
  expect(reportGroupOf({ face: "26", spoken: "", correct: false, helped: true })).toBe("growing");
  expect(reportGroupOf({ face: "?", spoken: "" })).toBe("practised");
  const groups = reportCardGroups([{ face: "60", spoken: "a", own: true, correct: true }, { face: "45", spoken: "b", correct: false }]);
  expect(groups.own.map(item => [item.face, item.index])).toEqual([["60", 0]]);
  expect(groups.growing.map(item => [item.face, item.index])).toEqual([["45", 1]]);
});

it("compares her on-her-own count with the board before", () => {
  const now = [{ face: "1", spoken: "", own: true, correct: true }, { face: "2", spoken: "", own: true, correct: true }, { face: "3", spoken: "", correct: true }];
  expect(ownProgress(now, [{ face: "x", spoken: "", own: true, correct: true }])).toEqual({ now: 2, before: 1 });
  expect(ownProgress(now, undefined)).toEqual({ now: 2, before: null });
});
