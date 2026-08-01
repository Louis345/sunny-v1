import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  HATCH_HUNT_THEME,
  HatchHuntExperience,
} from "../components/HatchHuntExperience";
import { MOSSBACK_MONSTER } from "../components/capturedMonsterCatalog";
import { MOSSY_HATCH_HUNT_QUESTIONS } from "../stories/HatchHunt.stories";

describe("Hatch Hunt Sunny visual language", () => {
  it("shares Orb Catcher's cyan, gold, cream, and ink palette", () => {
    expect(HATCH_HUNT_THEME).toMatchObject({
      sky: "#84d5f3",
      cyanEnergy: "#7cfff1",
      goldEnergy: "#ffe46b",
      creamSurface: "#fffdf2",
      ink: "#10202d",
      lavenderDepth: "#b9b6ef",
      mossAccent: "#5f9d50",
    });
  });

  it("identifies the grove as part of the Sunny Orb visual family", () => {
    render(
      <HatchHuntExperience
        encounterId="mossy-visual-1"
        childId="ila"
        creature={MOSSBACK_MONSTER}
        questions={MOSSY_HATCH_HUNT_QUESTIONS}
      />,
    );

    expect(screen.getByRole("main")).toHaveAttribute(
      "data-visual-family",
      "sunny-orb",
    );
  });
});
