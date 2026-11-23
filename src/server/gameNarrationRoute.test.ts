import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { GameNarrationRouter } from "./gameNarrationRoute";

// Reina, 2026-11-22: built games asked to say "Ray-nah, first puzzle is up…", "Not mate yet. Check what each number…",
// "check yourself like a champ", and the server spoke every line. Why the human caught it: the lines repeated word for
// word and never answered what she said. Why logs missed it: each narration_request was logged as spoken, never as
// "chat the game wrote". Why the lab missed it: narration tests only ever sent single test words.
// Rule: the narrator reads only what the game also put on screen (reportStep instruction, openItem problem, progress)
// or the test word itself; anything else reaches the companion as a fact, never her voice and never the narrator's.

const game = { launchToken: "launch-1", nodeId: "node-1", activityId: "generated-game" };
const names = ["Reina", "Ray-nah"];

function router() {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const r = new GameNarrationRouter();
  r.noteScreen({ ...game, currentChallenge: "Type where the kappa lands next", itemPrompt: "7 + 5 = ?", progress: "Camp 2 of 6" });
  return r;
}

describe("the narrator reads only on-screen game text", () => {
  it("reads the instruction and the problem the game reported on screen", () => {
    const r = router();
    expect(r.route("Type where the kappa lands next.", game, names)).toMatchObject({ to: "narrator", text: "Type where the kappa lands next." });
    expect(r.route("7 + 5 = ?", game, names)).toMatchObject({ to: "narrator" });
  });

  it("chat, praise and the child's name become a fact for the companion instead of speech", () => {
    const r = router();
    for (const line of ["Ray-nah, first puzzle is up!", "Not mate yet. Check what each number means.", "Check yourself like a champ!", "Reina, type where the kappa lands next."]) {
      const route = r.route(line, game, names);
      expect(route.to).toBe("companion");
      expect(route.to === "companion" && route.fact).toContain(line);
    }
  });

  it("the test word and a tapped chunk of it always go to the narrator (the measured path is unchanged)", () => {
    const r = router();
    expect(r.route("carnivore.", { ...game, word: "carnivore", assessmentMode: true, itemId: "w1" }, names)).toMatchObject({ to: "narrator" });
    expect(r.route("ight.", { ...game, word: "light", reason: "spelling_chunk" }, names)).toMatchObject({ to: "narrator" });
    expect(r.route("carnivore.", { ...game, word: "carnivore", reason: "target_word" }, names)).toMatchObject({ to: "narrator" });
    expect(r.route("carnivore.", { ...game, word: "carnivore", reason: "target_word" }, names)).toMatchObject({ to: "narrator" });
  });

  it("tells the companion what the narrator just read, so she never repeats it", () => {
    const route = router().route("Type where the kappa lands next.", game, names);
    expect(route.to === "narrator" && route.fact).toContain("Type where the kappa lands next.");
  });

  it("forgets the last game's screen when a new game opens", () => {
    const r = router();
    r.noteScreen({ launchToken: "launch-2", nodeId: "node-2", currentChallenge: "Tap the stone" });
    expect(r.route("Type where the kappa lands next.", { launchToken: "launch-2", nodeId: "node-2" }, names).to).toBe("companion");
  });
});

describe("the narrator never repeats the same line in a game unless she taps replay", () => {
  it("skips an identical screen line the second time, but reads it again on replay", () => {
    const r = router();
    expect(r.route("Type where the kappa lands next.", game, names).to).toBe("narrator");
    expect(r.route("Type where the kappa lands next.", game, names)).toEqual({ to: "skip", reason: "repeat" });
    expect(r.route("Type where the kappa lands next.", { ...game, reason: "replay" }, names).to).toBe("narrator");
  });

  it("the same line in a new game is read again", () => {
    const r = router();
    r.route("Type where the kappa lands next.", game, names);
    const next = { ...game, launchToken: "launch-9" };
    r.noteScreen({ ...next, currentChallenge: "Type where the kappa lands next" });
    expect(r.route("Type where the kappa lands next.", next, names).to).toBe("narrator");
  });
});

describe("every game narration request goes through the router", () => {
  it("both doors (session game events and the map iframe) ask the router, not the speaker", () => {
    const handler = fs.readFileSync(path.join(process.cwd(), "src/server/game-event-handler.ts"), "utf8");
    const map = fs.readFileSync(path.join(process.cwd(), "src/server/map-coordinator.ts"), "utf8");
    expect(handler).not.toMatch(/s\.speakGameNarration\?\.\(/);
    expect(map).not.toMatch(/sm\.speakGameNarration\(/);
    expect(handler).toMatch(/s\.requestGameNarration\?\.\(/);
    expect(map).toMatch(/sm\.requestGameNarration\(/);
    // Her scheduled check-in is a fresh companion model turn: her voice, never the narrator's.
    const bridge = fs.readFileSync(path.join(process.cwd(), "src/server/companion-bridge.ts"), "utf8");
    expect(bridge).toMatch(/runCompanionCheckIn\?\.\(facts\)/);
    expect(bridge).not.toMatch(/speakGameNarration/);
    const session = fs.readFileSync(path.join(process.cwd(), "src/server/session-manager.ts"), "utf8");
    expect(session).toMatch(/gameNarration\?\.noteScreen\(state\)/);
  });
});
