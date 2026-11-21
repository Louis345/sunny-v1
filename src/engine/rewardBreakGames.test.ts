import { expect, it } from "vitest";

// 2026-11-09 owner (Reina): she won the Asteroid card, but every reward break opened Space Invaders (a fixed
// fallback in the node registry) and the card's Play said "played from your map". The human caught it because
// Reina asked to play Asteroid; logs recorded the card and the launch but nothing joined them; the lab tested the
// break's launch, never what she owns. Facts, not a rule: the break offers the games she owns; with none, all of them.
it("offers the games she owns at a reward break, and every arcade game when she owns none", async () => {
  const { rewardBreakGameChoices } = await import("../shared/rewardBreakGames");
  expect(rewardBreakGameChoices(["outfit:cat-ears", "game:asteroid"]).map(row => row.gameId)).toEqual(["asteroid"]);
  expect(rewardBreakGameChoices(["game:asteroid"])[0]).toMatchObject({ name: "Asteroid", file: "asteroid.html" });
  expect(rewardBreakGameChoices([]).map(row => row.gameId).sort()).toEqual(["asteroid", "space-frogger", "space-invaders"]);
  expect(rewardBreakGameChoices(undefined).length).toBe(3);
});
