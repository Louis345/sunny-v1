import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AdventureBoard, HORIZONTAL_ADVENTURE_SLOTS } from "../components/AdventureBoard";
import { AdventureBoardExperience } from "../components/AdventureBoardExperience";
import {
  buildGrokFullExperienceBoard,
  grokFullExperienceBoard,
  reinaCurrentHomeworkBoard,
  buildSlotLabBoard,
} from "../storybook/adventureBoardFixtures";
import adventureBoardStoriesMeta, {
  ReinaChartPacket,
  StressQuestUnlocked,
} from "../stories/AdventureBoard.stories";
import rawHorizontalBoardJson from "../storybook/raw-horizontal-adventure-board.json";
import reinaChartPacketJson from "../storybook/reina-chart-experience-packet.json";
import type { AdventureBoardJson } from "../../../src/shared/adventureBoardJson";
import type { ChildExperiencePacket } from "../../../src/profiles/childExperiencePacket";
import { DEFAULT_ADVENTURE_MAP_PROFILE } from "../../../src/context/schemas/learningProfile";
import { cloneCompanionDefaults } from "../../../src/shared/companionTypes";

const rawHorizontalBoard = rawHorizontalBoardJson as AdventureBoardJson;
const reinaChartPacket = reinaChartPacketJson as unknown as ChildExperiencePacket;

vi.mock("../components/CompanionLayer", () => ({
  CompanionLayer: (props: {
    childId: string | null;
    companion: { companionId: string; vrmUrl: string } | null;
    toggledOff: boolean;
    idlePose?: string;
  }) => (
    <div
      data-testid="companion-layer"
      data-child-id={props.childId ?? ""}
      data-companion-id={props.companion?.companionId ?? ""}
      data-vrm-url={props.companion?.vrmUrl ?? ""}
      data-toggled-off={String(props.toggledOff)}
      data-idle-pose={props.idlePose ?? ""}
    />
  ),
}));

function packetForBoard(
  board: AdventureBoardJson,
  overrides: Partial<ChildExperiencePacket["childChart"]["adventureMapProfile"]> = {},
): ChildExperiencePacket {
  const companion = {
    ...cloneCompanionDefaults(),
    companionId: "matilda",
    vrmUrl: "/companions/matilda.vrm",
    toggledOff: false,
  };

  return {
    childChart: {
      childId: board.childId,
      identity: {
        displayName: "Reina",
        ttsName: "Ray-nah",
      },
      companion: {
        id: "matilda",
        displayName: "Matilda",
        config: companion,
      },
      companionCare: {
        plan: {},
        view: {
          childId: board.childId,
          companionId: "matilda",
          displayName: "Matilda",
        },
        filePath: "",
        existed: false,
      } as ChildExperiencePacket["childChart"]["companionCare"],
      economy: {
        coinBalance: 0,
      },
      adventureMapProfile: {
        ...DEFAULT_ADVENTURE_MAP_PROFILE,
        ...overrides,
      },
    },
    activeSessionPlan: {
      planId: board.planId,
      childId: board.childId,
      createdAt: "2026-05-26T00:00:00.000Z",
      source: "ingest_human_loop",
      domain: board.domain,
      testDate: null,
      nodePlan: [],
      adventureBoard: board,
      variationPolicy: {
        avoidExactPreviousNodeOrder: true,
        avoidExactPreviousWordOrder: true,
        seed: "test",
        previousCompletedNodeCount: 0,
      },
      companionPolicy: {
        companionId: "matilda",
        displayName: "Matilda",
        openingLinePolicy: "silent",
        verbosity: "low",
        maxMicroProbes: 0,
      },
      evidenceUsed: [],
      openQuestions: [],
    },
  };
}

describe("AdventureBoard", () => {
  it("renders JSON-provided background and node thumbnails", () => {
    const { container } = render(<AdventureBoard board={grokFullExperienceBoard} />);

    const board = container.querySelector(".adventure-board") as HTMLElement | null;
    expect(board?.style.backgroundImage).toContain(
      "/generated/adventure-board-demo/silent-letter-world.jpeg",
    );
    expect(
      container.querySelector(
        'img.adventure-board__node-thumbnail[src="/generated/adventure-board-demo/word-radar.jpeg"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        'img.adventure-board__node-thumbnail[src="/generated/adventure-board-demo/mystery.jpeg"]',
      ),
    ).not.toBeNull();
  });

  it("renders raw JSON slots through the fixed horizontal template", () => {
    const { container } = render(<AdventureBoard board={rawHorizontalBoard} />);
    const wordRadar = screen.getByRole("button", { name: "Know / Write" });
    const boss = screen.getByRole("button", { name: /Boss/ });

    expect(rawHorizontalBoard.nodes.every((node) => node.position == null && node.slot != null)).toBe(true);
    expect(wordRadar).toHaveStyle({ left: "25%" });
    expect(boss).toHaveStyle({ left: "86%" });
    expect(container.querySelectorAll(".adventure-board__edge").length).toBeGreaterThan(0);
  });

  it("maps every horizontal adventure slot to the approved coordinate", () => {
    expect(HORIZONTAL_ADVENTURE_SLOTS).toEqual({
      "1": { x: 0.1, y: 0.82 },
      "2": { x: 0.25, y: 0.7 },
      "3": { x: 0.38, y: 0.56 },
      "4": { x: 0.52, y: 0.56 },
      "5a.1": { x: 0.44, y: 0.3 },
      "5a.2": { x: 0.58, y: 0.26 },
      "5b.1": { x: 0.46, y: 0.76 },
      "5b.2": { x: 0.58, y: 0.72 },
      "5c.1": { x: 0.57, y: 0.48 },
      "5c.2": { x: 0.61, y: 0.52 },
      "6": { x: 0.64, y: 0.46 },
      "7": { x: 0.76, y: 0.34 },
      "8": { x: 0.86, y: 0.18 },
    });
  });

  it("renders slot-based JSON without raw positions", () => {
    const slotBoard = buildSlotLabBoard({ routeShape: "upper" });
    render(<AdventureBoard board={slotBoard} />);

    expect(slotBoard.nodes.every((node) => node.position == null)).toBe(true);
    expect(screen.getByRole("button", { name: "Start" })).toHaveStyle({ left: "10%" });
    expect(screen.getByRole("button", { name: "Light Check" })).toHaveStyle({ left: "44%" });
  });

  it("renders a three-way slot route into Mystery", () => {
    const slotBoard = buildSlotLabBoard({ routeShape: "three-way" });
    render(<AdventureBoard board={slotBoard} />);

    expect(screen.getByRole("button", { name: "Light Check" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Story Spark" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Quick Jump" })).toBeVisible();
    expect(slotBoard.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "choose-path", to: "light-check" }),
        expect.objectContaining({ from: "choose-path", to: "story-spark" }),
        expect.objectContaining({ from: "choose-path", to: "quick-jump" }),
        expect.objectContaining({ from: "quick-jump", to: "mystery" }),
      ]),
    );
  });

  it("keeps slot-only Storybook controls tied to the slot lab", () => {
    expect(adventureBoardStoriesMeta.argTypes?.slotChosenRoute).toMatchObject({
      if: { arg: "scenario", eq: "slotLab" },
    });
    expect(adventureBoardStoriesMeta.argTypes?.routeShape).toMatchObject({
      if: { arg: "scenario", eq: "slotLab" },
    });
    expect(StressQuestUnlocked.args).not.toHaveProperty("slotChosenRoute");
    expect(StressQuestUnlocked.args).not.toHaveProperty("routeShape");
  });

  it("applies slotChosenRoute to the slot lab exclusive routes", () => {
    render(
      <AdventureBoard
        board={buildSlotLabBoard({
          routeShape: "three-way",
          chosenRoute: "5b",
          routeChoiceBehavior: "exclusive",
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "Story Spark" })).not.toHaveClass(
      "adventure-board__node--locked",
    );
    expect(screen.getByRole("button", { name: "Light Check, Route not picked" })).toHaveClass(
      "adventure-board__node--locked",
    );
    expect(screen.getByRole("button", { name: "Quick Jump, Route not picked" })).toHaveClass(
      "adventure-board__node--locked",
    );
  });

  it("does not invent coordinates for nodes missing position and slot", () => {
    const boardWithoutStartPositionOrSlot: AdventureBoardJson = {
      ...rawHorizontalBoard,
      nodes: rawHorizontalBoard.nodes.map((node) => {
        if (node.id !== "start") return node;
        const { position: _position, slot: _slot, ...withoutPlacement } = node;
        return withoutPlacement;
      }),
    };

    render(<AdventureBoard board={boardWithoutStartPositionOrSlot} />);

    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
  });

  it("renders optional Verify to Choose Path route only when planner JSON includes it", () => {
    render(<AdventureBoard board={buildGrokFullExperienceBoard({ branchDensity: "none" })} />);

    expect(screen.queryByRole("button", { name: "Light Check" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Choose Path, Unlocks after current check" })).toBeNull();
  });

  it("disables sibling route nodes for exclusive route choices marked in JSON", () => {
    render(
      <AdventureBoard
        board={buildGrokFullExperienceBoard({
          branchDensity: "two",
          routeChoiceBehavior: "exclusive",
          chosenRoute: "upper",
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "Audio Slots, Route not picked" })).toHaveClass(
      "adventure-board__node--locked",
    );
    expect(screen.getByRole("button", { name: "Light Check" })).not.toHaveClass(
      "adventure-board__node--locked",
    );
  });

  it("keeps sibling routes available for parallel route choices", () => {
    render(
      <AdventureBoard
        board={buildGrokFullExperienceBoard({
          branchDensity: "two",
          routeChoiceBehavior: "parallel",
          chosenRoute: "upper",
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "Audio Slots" })).not.toHaveClass(
      "adventure-board__node--locked",
    );
  });

  it("renders JSON-provided choice thumbnails inside the choice modal", () => {
    const { container } = render(<AdventureBoard board={grokFullExperienceBoard} />);

    fireEvent.click(screen.getByRole("button", { name: "Mystery" }));

    expect(
      container.querySelector(
        'img[src="/thumbnails/activities/karaoke.svg"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        'img[src="/thumbnails/activities/speed-catcher.svg"]',
      ),
    ).not.toBeNull();
  });

  it("does not repair real planner boards that omit explicit positions", () => {
    render(<AdventureBoard board={reinaCurrentHomeworkBoard} />);

    expect(reinaCurrentHomeworkBoard.layout?.companionSlot).toBe("right");
    expect(reinaCurrentHomeworkBoard.nodes.some((node) => node.position == null)).toBe(true);
    expect(screen.queryByRole("button", { name: /Start/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Choose Path/ })).toBeNull();
  });
});

describe("AdventureBoardExperience", () => {
  it("renders the board from the child experience packet", () => {
    render(<AdventureBoardExperience packet={packetForBoard(grokFullExperienceBoard)} />);

    expect(screen.getByRole("button", { name: "Start" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Mystery" })).toBeVisible();
  });

  it("renders the companion from the child chart packet", () => {
    render(<AdventureBoardExperience packet={packetForBoard(grokFullExperienceBoard)} />);

    expect(screen.getByTestId("companion-layer")).toHaveAttribute("data-child-id", "reina");
    expect(screen.getByTestId("companion-layer")).toHaveAttribute("data-companion-id", "matilda");
    expect(screen.getByTestId("companion-layer")).toHaveAttribute("data-vrm-url", "/companions/matilda.vrm");
  });

  it("hides the companion when the story visibility toggle is off", () => {
    render(
      <AdventureBoardExperience
        packet={packetForBoard(grokFullExperienceBoard)}
        showCompanion={false}
      />,
    );

    expect(screen.queryByTestId("companion-layer")).toBeNull();
  });

  it("hides the companion when the child chart reserves no companion slot", () => {
    render(
      <AdventureBoardExperience
        packet={packetForBoard(grokFullExperienceBoard, { companionSlot: "none" })}
      />,
    );

    expect(screen.queryByTestId("companion-layer")).toBeNull();
  });

  it("preserves board node and choice callbacks through the wrapper", () => {
    const nodeClick = vi.fn();
    const choiceClick = vi.fn();
    render(
      <AdventureBoardExperience
        packet={packetForBoard(grokFullExperienceBoard)}
        onNodeClick={nodeClick}
        onChoiceClick={choiceClick}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mystery" }));
    expect(nodeClick).toHaveBeenCalledWith(expect.objectContaining({ id: "mystery" }));

    fireEvent.click(screen.getByRole("button", { name: /Story Challenge/ }));
    expect(choiceClick).toHaveBeenCalledWith(expect.objectContaining({ id: "story-challenge" }));
  });

  it("renders a serialized Reina chart packet with Matilda and an active board", () => {
    expect(reinaChartPacket.childChart.childId).toBe("reina");
    expect(reinaChartPacket.childChart.companion.id).toBe("matilda");
    expect(reinaChartPacket.childChart.companion.config.companionId).toBe("matilda");
    expect(reinaChartPacket.childChart.adventureMapProfile.companionSlot).toBe("right");
    expect(reinaChartPacket.activeSessionPlan?.adventureBoard?.nodes.length).toBeGreaterThan(0);

    render(<AdventureBoardExperience packet={reinaChartPacket} />);

    expect(screen.getByTestId("companion-layer")).toHaveAttribute("data-child-id", "reina");
    expect(screen.getByTestId("companion-layer")).toHaveAttribute("data-companion-id", "matilda");
    expect(screen.getByRole("button", { name: "Start" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Mystery" })).toBeVisible();
  });

  it("exports a Reina chart packet Storybook story", () => {
    expect(ReinaChartPacket.render).toBeTypeOf("function");
  });

  it("keeps Storybook from bypassing the child experience packet for companion identity", () => {
    const source = readFileSync(
      resolve(__dirname, "../stories/AdventureBoard.stories.tsx"),
      "utf8",
    );

    expect(source).not.toContain("COMPANION_MANIFEST");
    expect(source).not.toContain("mergeCompanionConfigWithDefaults");
  });
});
