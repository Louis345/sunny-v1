import { describe, expect, it } from "vitest";
import { selectQuestBossLabCandidate } from "./questBossLabSelection";

const candidates = [
  { candidateId: "speed-racing-championship", title: "Speed Racing Championship" },
  { candidateId: "ice-palace-explorer", title: "Ice Palace Explorer" },
  { candidateId: "monster-tower-defender", title: "Monster Tower Defender" },
];

describe("quest boss lab candidate selection", () => {
  it("selects an explicit 1-based candidate index instead of silently taking candidate zero", () => {
    const selection = selectQuestBossLabCandidate({
      candidates,
      requestedSelection: "2",
      stage: "quest",
      allowDefaultFirst: false,
    });

    expect(selection.candidate.candidateId).toBe("ice-palace-explorer");
    expect(selection.source).toBe("explicit_index");
  });

  it("selects an explicit candidate id", () => {
    const selection = selectQuestBossLabCandidate({
      candidates,
      requestedSelection: "monster-tower-defender",
      stage: "boss",
      allowDefaultFirst: false,
    });

    expect(selection.candidate.candidateId).toBe("monster-tower-defender");
    expect(selection.source).toBe("explicit_id");
  });

  it("requires an explicit selection unless default-first is intentionally allowed", () => {
    expect(() =>
      selectQuestBossLabCandidate({
        candidates,
        requestedSelection: null,
        stage: "boss",
        allowDefaultFirst: false,
      }),
    ).toThrow(/Boss candidate selection required/);
  });

  it("reports available candidates when the requested candidate is missing", () => {
    expect(() =>
      selectQuestBossLabCandidate({
        candidates,
        requestedSelection: "crystal-forge",
        stage: "quest",
        allowDefaultFirst: false,
      }),
    ).toThrow(/Available: 1:speed-racing-championship, 2:ice-palace-explorer, 3:monster-tower-defender/);
  });

  it("can still use candidate zero when the lab explicitly requests legacy default-first behavior", () => {
    const selection = selectQuestBossLabCandidate({
      candidates,
      requestedSelection: null,
      stage: "quest",
      allowDefaultFirst: true,
    });

    expect(selection.candidate.candidateId).toBe("speed-racing-championship");
    expect(selection.source).toBe("default_first");
  });
});
