import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NodeConfig } from "../../../src/shared/adventureTypes";
import { buildNodeLaunchAction } from "../../../src/shared/homeworkNodeRouting";
import { NodeCard } from "../components/NodeCard.tsx";
import { QuestBriefingModal } from "../components/quest/QuestBriefingModal";
import childrenCfg from "../../../children.config.json";
import { isChildQuestUnlocked } from "../utils/childQuestConfig";
import { questBriefingWordsFromMap } from "../components/AdventureMap";

describe("quest unlock policy (children.config questUnlocked)", () => {
  it("returns true only when child profile has questUnlocked: true", () => {
    expect(isChildQuestUnlocked("ila", { ila: { questUnlocked: true } })).toBe(
      true,
    );
    expect(isChildQuestUnlocked("ila", { ila: { questUnlocked: false } })).toBe(
      false,
    );
    expect(
      isChildQuestUnlocked("reina", { reina: { questUnlocked: undefined } }),
    ).toBe(false);
  });

  it("repo children.config: Ila and Reina are manually quest-unlocked for spelling-test day", () => {
    const profiles = childrenCfg.childProfiles as Record<
      string,
      { questUnlocked?: boolean }
    >;
    expect(isChildQuestUnlocked("ila", profiles)).toBe(true);
    expect(isChildQuestUnlocked("reina", profiles)).toBe(true);
  });
});

describe("QuestBriefingModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows at most 5 reinforce words as pills", () => {
    render(
      <QuestBriefingModal
        open
        reinforceWords={["one", "two", "three", "four", "five", "six"]}
        childId="ila"
        companionId="elli"
        onDismiss={() => {}}
        onStartQuest={() => {}}
      />,
    );
    expect(screen.getByText("one")).toBeTruthy();
    expect(screen.getByText("five")).toBeTruthy();
    expect(screen.queryByText("six")).toBeNull();
  });

  it("Start Quest invokes callback", () => {
    const onStart = vi.fn();
    render(
      <QuestBriefingModal
        open
        reinforceWords={["zip"]}
        childId="reina"
        companionId="matilda"
        onDismiss={() => {}}
        onStartQuest={onStart}
      />,
    );
    fireEvent.click(screen.getByTestId("quest-briefing-start"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe("quest briefing word source", () => {
  it("falls back to quest node words when profile reinforceWords is already empty", () => {
    const questNode: NodeConfig = {
      id: "q1",
      type: "quest",
      isLocked: false,
      isCompleted: false,
      isGoal: false,
      difficulty: 2,
      words: ["zigzag", "inventor"],
    };
    expect(questBriefingWordsFromMap([questNode], [])).toEqual([
      "zigzag",
      "inventor",
    ]);
  });

  it("prefers fresh profile reinforceWords over quest node words", () => {
    const questNode: NodeConfig = {
      id: "q1",
      type: "quest",
      isLocked: false,
      isCompleted: false,
      isGoal: false,
      difficulty: 2,
      words: ["old"],
    };
    expect(questBriefingWordsFromMap([questNode], ["fresh"])).toEqual([
      "fresh",
    ]);
  });
});

describe("NodeCard quest ceremony lock", () => {
  afterEach(() => {
    cleanup();
  });

  it("forceLocked blocks tap even when server node is unlocked", () => {
    const onClick = vi.fn();
    const node: NodeConfig = {
      id: "q1",
      type: "quest",
      isLocked: false,
      isCompleted: false,
      isGoal: false,
      difficulty: 2,
    };
    render(
      <NodeCard
        node={node}
        position={{ x: 100, y: 100 }}
        onClick={onClick}
        onHoverChange={() => {}}
        isActive={false}
        forceLocked
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("quest game launch (GAME_PARAMS / URL)", () => {
  it("buildNodeLaunchAction includes isQuest, dyslexiaMode, and words in quest game URL", () => {
    const questNode: NodeConfig = {
      id: "n-quest",
      type: "quest",
      isLocked: false,
      isCompleted: false,
      isGoal: false,
      difficulty: 2,
      words: ["alpha", "beta"],
      gameFile: "monster-stampede.html",
    };
    const action = buildNodeLaunchAction(questNode, {
      childId: "ila",
      childName: "Ee-lah",
      companion: "elli",
      companionName: "Elli",
      isDiagMode: false,
      iframePreviewParam: "false",
      isQuest: true,
      dyslexiaMode: true,
    });
    expect(action.kind).toBe("iframe");
    if (action.kind !== "iframe") throw new Error("expected iframe");
    expect(action.url).toContain("/games/monster-stampede.html?");
    expect(action.url).toContain("isQuest=true");
    expect(action.url).toContain("dyslexiaMode=true");
    expect(action.url).toContain("words=alpha%2Cbeta");
    expect(action.url).toContain("childId=ila");
  });
});
