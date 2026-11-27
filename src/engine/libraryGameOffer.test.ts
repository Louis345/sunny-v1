import { expect, it } from "vitest";
import { libraryGameOffer } from "./libraryGames";

// Owner-caught 2026-11-25: "I don't recall a parent's note." The four hand-built 3D games were on the tutor's menu only
// while a dated owner note was active (11/11-11/15, 11/18-11/19), so since 11/19 no board could choose them. Why the
// human caught it: the audit said "offered only when there's a parent note" and he never wrote one this week. Why the
// logs did not: no line is written when no note applies. Why the lab missed it: no test asked what the menu holds on
// an ordinary day. Rule now: full toolbox, every stage; the tutor always sees the games for this subject.
it("offers the hand-built 3D games for this subject on any day, with no note", () => {
  const math = libraryGameOffer({ subject: "math", encounterOffered: true });
  expect(math.games.map(game => game.id).sort()).toEqual(["fable-reina", "opus-reina"]);
  expect(math.line).toContain("Squad Gym");
  expect(math.line).toContain("library_game");
  const spelling = libraryGameOffer({ subject: "spelling", encounterOffered: true });
  expect(spelling.games.map(game => game.id).sort()).toEqual(["fable-ila", "opus-ila"]);
});

it("names the games but no way to place one when this stage offers no Quest or Boss", () => {
  const offer = libraryGameOffer({ subject: "math", encounterOffered: false });
  expect(offer.games).toHaveLength(2);
  expect(offer.line).toBe("");
});
