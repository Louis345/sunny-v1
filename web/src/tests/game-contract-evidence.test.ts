import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

function loadContract(url = "/games/letter-rush.html?childId=reina&sessionId=s1&nodeId=n1") {
  window.history.replaceState({}, "", url);
  delete (window as unknown as { GameBridge?: unknown }).GameBridge;
  delete (window as unknown as { SunnyEvidence?: unknown }).SunnyEvidence;
  const source = fs.readFileSync(
    path.join(process.cwd(), "public", "games", "_contract.js"),
    "utf8",
  );
  window.eval(source);
}

describe("_contract SunnyEvidence bridge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts canonical activity evidence from iframe games", () => {
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => {});
    loadContract();

    const sunnyEvidence = (window as unknown as {
      SunnyEvidence: {
        targetPresented: (payload: Record<string, unknown>) => void;
        attemptRecorded: (payload: Record<string, unknown>) => void;
      };
    }).SunnyEvidence;

    sunnyEvidence.targetPresented({
      activityId: "letter-rush",
      target: "knock",
      visibleState: { wordVisible: false, slotsVisible: true },
    });
    sunnyEvidence.attemptRecorded({
      activityId: "letter-rush",
      target: "knock",
      childAction: { normalizedResponse: "knock" },
      result: { correct: true, status: "correct" },
    });

    expect(postMessage).toHaveBeenCalledWith(
      {
        type: "activity_evidence",
        payload: expect.objectContaining({
          type: "activity_evidence",
          eventName: "target_presented",
          activityId: "letter-rush",
          childId: "reina",
          sessionId: "s1",
          nodeId: "n1",
          target: "knock",
          visibleState: { wordVisible: false, slotsVisible: true },
        }),
        version: "1.0",
      },
      "*",
    );
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: "activity_evidence",
        payload: expect.objectContaining({
          type: "activity_evidence",
          eventName: "attempt_recorded",
          activityId: "letter-rush",
          target: "knock",
          childAction: { normalizedResponse: "knock" },
          result: { correct: true, status: "correct" },
        }),
        version: "1.0",
      },
      "*",
    );
  });
});

describe("baseline activity evidence contracts", () => {
  const gameSource = (relativePath: string): string =>
    fs.readFileSync(path.join(process.cwd(), "public", "games", relativePath), "utf8");

  it.each([
    ["word-builder.html", "word-builder"],
    ["wordle.html", "wordle"],
    ["bd-reversal-game.html", "bd-reversal"],
    ["clock-game.html", "clock-game"],
    ["coin-counter.html", "coin-counter"],
    ["vault-cracker.html", "vault-cracker"],
  ])("%s reports target-level completion evidence", (file) => {
    const source = gameSource(file);

    expect(source).toMatch(/targetResults/);
    expect(source).toMatch(/sendNodeComplete\(\s*\{[\s\S]*targetResults/s);
  });

  it.each([
    ["word-builder.html", "word-builder"],
    ["wordle.html", "wordle"],
    ["bd-reversal-game.html", "bd-reversal"],
    ["clock-game.html", "clock-game"],
    ["coin-counter.html", "coin-counter"],
    ["vault-cracker.html", "vault-cracker"],
  ])("%s reports every assessable interaction", (file) => {
    const source = gameSource(file);

    expect(source).toMatch(/fireAttemptEvent|SunnyEvidence\.attemptRecorded|GameBridge\.reportAttempt/);
  });
});
