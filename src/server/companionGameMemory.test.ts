import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyCompanionGameResult,
  maybeCompactCompanionInteractionMemory,
  recordCompanionGameResult,
  recordCompanionInteractionEvent,
  readCompanionInteractionEvents,
} from "./companionInteractionMemory";
import { buildShowroomTalkMemoryPrompt } from "./companionShowroomTalk";
import type { CompanionCarePlan } from "../shared/companionCareTypes";

const roots: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-game-memory-"));
  roots.push(root);
  return root;
}

function seedCarePlan(root: string, childId = "ila", companionId = "elli"): string {
  const dir = path.join(root, "src", "context", childId, "companion_care");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${companionId}.json`);
  const plan = {
    version: 1,
    childId,
    companionId,
    state: {},
    memory: { firstMetAt: new Date().toISOString() },
    inventory: { food: [], careItems: [] },
    economy: {},
    updatedAt: new Date().toISOString(),
  } as unknown as CompanionCarePlan;
  fs.writeFileSync(filePath, JSON.stringify(plan, null, 2));
  return filePath;
}

function readMemory(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8")).memory;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("companion game memory", () => {
  it("counts wins, losses and draws deterministically", () => {
    let record = applyCompanionGameResult(undefined, {
      activityId: "connect_four",
      result: "child_win",
    });
    record = applyCompanionGameResult(record, {
      activityId: "connect_four",
      result: "child_win",
    });
    record = applyCompanionGameResult(record, {
      activityId: "connect_four",
      result: "draw",
    });
    record = applyCompanionGameResult(record, {
      activityId: "connect_four",
      result: "companion_win",
    });

    expect(record.connect_four).toMatchObject({
      played: 4,
      childWins: 2,
      companionWins: 1,
      draws: 1,
    });
  });

  it("tracks streaks in both directions and resets them on a draw", () => {
    let record = applyCompanionGameResult(undefined, {
      activityId: "tic_tac_toe",
      result: "child_win",
    });
    record = applyCompanionGameResult(record, {
      activityId: "tic_tac_toe",
      result: "child_win",
    });
    expect(record.tic_tac_toe.currentStreak).toBe(2);

    record = applyCompanionGameResult(record, {
      activityId: "tic_tac_toe",
      result: "companion_win",
    });
    expect(record.tic_tac_toe.currentStreak).toBe(-1);

    record = applyCompanionGameResult(record, {
      activityId: "tic_tac_toe",
      result: "draw",
    });
    expect(record.tic_tac_toe.currentStreak).toBe(0);
  });

  it("keeps each activity's record separate", () => {
    let record = applyCompanionGameResult(undefined, {
      activityId: "tic_tac_toe",
      result: "child_win",
    });
    record = applyCompanionGameResult(record, {
      activityId: "connect_four",
      result: "companion_win",
    });
    expect(record.tic_tac_toe.childWins).toBe(1);
    expect(record.tic_tac_toe.companionWins).toBe(0);
    expect(record.connect_four.childWins).toBe(0);
    expect(record.connect_four.companionWins).toBe(1);
  });

  it("persists a finished round into companion care memory", () => {
    const root = makeRoot();
    const filePath = seedCarePlan(root);

    const result = recordCompanionGameResult(
      {
        childId: "ila",
        companionId: "elli",
        activityId: "connect_four",
        result: "child_win",
      },
      { rootDir: root },
    );

    expect(result.recorded).toBe(true);
    expect(readMemory(filePath).gameRecord.connect_four).toMatchObject({
      played: 1,
      childWins: 1,
    });
  });

  it("reports a missing care plan instead of failing silently", () => {
    const root = makeRoot();
    expect(
      recordCompanionGameResult(
        {
          childId: "ila",
          companionId: "elli",
          activityId: "connect_four",
          result: "draw",
        },
        { rootDir: root },
      ),
    ).toEqual({ recorded: false, reason: "missing_care_plan" });
  });

  it("never files a machine-authored game prompt as something the child said", () => {
    const root = makeRoot();
    seedCarePlan(root);

    recordCompanionInteractionEvent(
      {
        childId: "ila",
        companionId: "elli",
        callSource: "dev_preview",
        relationshipState: "selected",
        eventType: "companion_activity_completed",
        questionText: "You are about to place your O on square 5.",
        companionText: "Center square, mine!",
        commandCount: 1,
        visionUsed: false,
        activityContext: {
          activityId: "tic_tac_toe",
          eventType: "companion_move",
          machinePrompt: "You are about to place your O on square 5.",
        },
      },
      { rootDir: root },
    );

    const events = readCompanionInteractionEvents("ila", "elli", { rootDir: root });
    expect(events).toHaveLength(1);
    expect(events[0].questionText).toBe("");
    expect(events[0].activityContext).toMatchObject({
      activityId: "tic_tac_toe",
      eventType: "companion_move",
    });
  });

  it("still records real conversation as the child's words", () => {
    const root = makeRoot();
    seedCarePlan(root);

    recordCompanionInteractionEvent(
      {
        childId: "ila",
        companionId: "elli",
        callSource: "dev_preview",
        relationshipState: "selected",
        eventType: "companion_talk_completed",
        questionText: "what did you dream about?",
        companionText: "A library made of candy!",
        commandCount: 0,
        visionUsed: false,
      },
      { rootDir: root },
    );

    const events = readCompanionInteractionEvents("ila", "elli", { rootDir: root });
    expect(events[0].questionText).toBe("what did you dream about?");
    expect(events[0].activityContext).toBeUndefined();
  });

  it("puts the exact record in the prompt so the companion cannot invent a tally", () => {
    const prompt = buildShowroomTalkMemoryPrompt({
      firstMetAt: new Date().toISOString(),
      lastSessionSummary: "They played Connect Four.",
      gameRecord: {
        connect_four: {
          played: 3,
          childWins: 2,
          companionWins: 1,
          draws: 0,
          lastPlayedAt: new Date().toISOString(),
          currentStreak: 2,
        },
      },
      rivalryNote: "She is on a roll lately.",
      companionSelfNotes: ["plays boldly", "laughs at her own jokes"],
    });

    expect(prompt).toContain("Connect Four: 3 played, child won 2, you won 1, 0 drawn");
    expect(prompt).toContain("the child has won 2 in a row");
    expect(prompt).toContain("do not contradict or invent numbers");
    expect(prompt).toContain("Rivalry note: She is on a roll lately.");
    expect(prompt).toContain("plays boldly");
  });

  it("ignores a summarizer that tries to rewrite the win/loss record", async () => {
    const root = makeRoot();
    const filePath = seedCarePlan(root);

    recordCompanionGameResult(
      {
        childId: "ila",
        companionId: "elli",
        activityId: "connect_four",
        result: "child_win",
      },
      { rootDir: root },
    );
    for (let i = 0; i < 4; i += 1) {
      recordCompanionInteractionEvent(
        {
          childId: "ila",
          companionId: "elli",
          callSource: "dev_preview",
          relationshipState: "selected",
          eventType: "companion_talk_completed",
          questionText: `hello ${i}`,
          companionText: `hi ${i}`,
          commandCount: 0,
          visionUsed: false,
        },
        { rootDir: root },
      );
    }

    await maybeCompactCompanionInteractionMemory(
      { childId: "ila", companionId: "elli" },
      {
        rootDir: root,
        // A hostile summarizer: claims the companion is undefeated.
        summarize: async () =>
          ({
            lastSessionSummary: "They played a lot.",
            rivalryNote: "I have never lost.",
            gameRecord: {
              connect_four: {
                played: 99,
                childWins: 0,
                companionWins: 99,
                draws: 0,
                lastPlayedAt: new Date().toISOString(),
                currentStreak: -99,
              },
            },
          }) as never,
      },
    );

    // The narrative field is accepted; the arithmetic is not.
    const memory = readMemory(filePath);
    expect(memory.rivalryNote).toBe("I have never lost.");
    expect(memory.gameRecord.connect_four).toMatchObject({
      played: 1,
      childWins: 1,
      companionWins: 0,
    });
  });

  it("omits the game record entirely before any round is played", () => {
    const prompt = buildShowroomTalkMemoryPrompt({
      firstMetAt: new Date().toISOString(),
      lastSessionSummary: "They talked about dragons.",
      gameRecord: {},
    });
    expect(prompt).not.toContain("Game record");
  });
});
