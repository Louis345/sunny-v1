import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdventureBoard } from "../components/AdventureBoard";
import {
  buildGrokFullExperienceBoard,
  grokFullExperienceBoard,
} from "../storybook/adventureBoardFixtures";

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

  it("resolves horizontal layout positions when planner JSON omits node positions", () => {
    const { container } = render(<AdventureBoard board={grokFullExperienceBoard} />);
    const wordRadar = screen.getByRole("button", { name: "Know / Write" });
    const boss = screen.getByRole("button", { name: /Boss/ });

    expect(grokFullExperienceBoard.nodes.every((node) => node.position == null)).toBe(true);
    expect(wordRadar).toHaveStyle({ left: "25%" });
    expect(boss).toHaveStyle({ left: "86%" });
    expect(container.querySelectorAll(".adventure-board__edge").length).toBeGreaterThan(0);
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
});
