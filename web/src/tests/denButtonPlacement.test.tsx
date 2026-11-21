import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DenButton } from "../components/CreatureDenOverlay";
import { LEVEL_CARD_BOTTOM_PX } from "../components/XPBar";

// Owner, 2026-11-21 (Reina's board screenshot): the "Den · 1" pill sat on top of the "Level 77" card; both were pinned
// top-left (12 px and 16 px). Why the human caught it: overlapping labels are obvious on screen. Why logs missed it:
// layout is never logged. Why the lab missed it: the Den button is new and no test placed it against the level card.
describe("the Den button and the level card", () => {
  it("the Den button sits below the level card, not on it", () => {
    render(<DenButton creatureCount={1} onOpen={() => undefined} />);
    const top = parseFloat(screen.getByTestId("den-button").style.top);
    expect(top).toBeGreaterThanOrEqual(LEVEL_CARD_BOTTOM_PX + 8);
  });
});
