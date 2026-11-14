import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { expect, it, vi } from "vitest";

// Measurement audit 2026-11-13 (b), AI-caught: a library 3D game reports Elli's help on each try (companionHelp), but
// the bridge's completion rows carried only the hint level, so a word she answered after Elli helped saved as on her
// own. The logs showed the attempt event with companionHelp:true; the lab never ran the bridge's completion rows.
it("sends Elli's help on a library game's first try with that item's completion row", () => {
  const sendNodeComplete = vi.fn();
  const window: Record<string, unknown> = {
    GAME_PARAMS: { itemBindings: [], spellingItemBindings: [] },
    SUNNY_GAME_CONFIG: { childId: "lab", subject: "spelling", gameId: "lab-game", items: [{ itemId: "n:w1", answer: "night" }, { itemId: "n:w2", answer: "light" }] },
    fireAttemptEvent: vi.fn(), fireCompanionEvent: vi.fn(), sendNodeComplete, reportStep: vi.fn(),
  };
  const context = vm.createContext({ window, document: { getElementById: () => null, title: "lab" }, location: { search: "" },
    URLSearchParams, console: { log: () => {}, warn: () => {} }, fetch: () => new Promise(() => {}), Promise, setTimeout, Object, Array, String, Number, RegExp, Math, Date });
  vm.runInContext(fs.readFileSync(path.join(process.cwd(), "web/public/games/cookoff/_library.js"), "utf8"), context);
  const evidence = window.SunnyEvidence as Record<string, (p: unknown) => void>;
  evidence.attemptRecorded({ target: "night", childAction: { typed: "night" }, result: { correct: true, hintLevel: 0, companionHelp: true } });
  evidence.attemptRecorded({ target: "light", childAction: { typed: "light" }, result: { correct: true, hintLevel: 0, companionHelp: false } });
  evidence.activityCompleted({ result: {} });
  const rows = sendNodeComplete.mock.calls[0][0].targetResults;
  expect(rows.find((row: { target: string }) => row.target === "n:w1")).toMatchObject({ companionHelp: true });
  expect(rows.find((row: { target: string }) => row.target === "n:w2")?.companionHelp).toBeUndefined();
});
