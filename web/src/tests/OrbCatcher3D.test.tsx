import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LUMIPUFF_MONSTER } from "../../../src/shared/capturedMonsterCatalog";
import { OrbCatcher3D } from "../components/OrbCatcher3D";
import { CHAMPIONSHIP_PACK, YOKAI_NIGHT_PACK } from "../components/orbThemePacks";

vi.mock("../utils/sparkOrbSfx", () => ({ playSparkOrbSfx: vi.fn(), startSparkOrbPullTone: () => null }));

// Prototype guard: where 3D cannot run (no WebGL), the stage says so instead of crashing the screen.
it("shows the creature, her throws, and a plain message when 3D is unavailable", () => {
  render(<OrbCatcher3D creature={LUMIPUFF_MONSTER} throws={3} timeOfDay="day" season="autumn" />);
  expect(screen.getByText("Lumipuff")).toBeInTheDocument();
  expect(screen.getByTestId("orb-3d-throws").children).toHaveLength(3);
  expect(screen.getByText(/3D is not available/)).toBeInTheDocument();
});

// Owner, 2026-11-11: a drill the Planner calibrates. Each right answer loads one orb; a wrong one is said
// gently and that question comes back later in the round.
describe("drill mode: answer to load an orb", () => {
  const drill = {
    plannedRounds: 3,
    questions: [
      { id: "q1", kind: "math" as const, prompt: "7 × 8", answer: "56", choices: ["54", "56", "64"] },
      { id: "q2", kind: "spelling" as const, prompt: "carnival", answer: "carnival" },
    ],
  };

  it("asks first, gently moves on after a miss, and loads the orb on a right answer", () => {
    render(<OrbCatcher3D creature={LUMIPUFF_MONSTER} throws={3} drill={drill} theme={YOKAI_NIGHT_PACK} timeOfDay="night" season="autumn" />);
    expect(screen.getByTestId("orb-3d-question")).toHaveTextContent("7 × 8");
    fireEvent.click(screen.getByRole("button", { name: "54" }));
    expect(screen.getByText(YOKAI_NIGHT_PACK.wrongLine.text)).toBeInTheDocument();
    expect(screen.getByLabelText("Spell the word")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Spell the word"), { target: { value: "Carnival " } });
    fireEvent.click(screen.getByRole("button", { name: "Load it!" }));
    expect(screen.queryByTestId("orb-3d-question")).not.toBeInTheDocument();
    expect(screen.getByText(/Ready\? Go!/)).toBeInTheDocument();
  });

  it("each child's pack carries her own count and lines over the same game", () => {
    expect(CHAMPIONSHIP_PACK.shakeLabels).toEqual(["One!", "Two!", "Three!"]);
    expect(YOKAI_NIGHT_PACK.wrongLine.text).not.toMatch(/wrong|no\b/i);
    expect(CHAMPIONSHIP_PACK.caughtLine.some((line) => line.lang === "ja")).toBe(true);
  });
});

it("music can be switched off and the choice is remembered on this device", () => {
  window.localStorage.removeItem("sunny.orb.music");
  const { unmount } = render(<OrbCatcher3D creature={LUMIPUFF_MONSTER} throws={3} timeOfDay="day" season="autumn" />);
  fireEvent.click(screen.getByRole("button", { name: "Music on" }));
  expect(screen.getByRole("button", { name: "Music off" })).toHaveAttribute("aria-pressed", "false");
  unmount();
  render(<OrbCatcher3D creature={LUMIPUFF_MONSTER} throws={3} timeOfDay="day" season="autumn" />);
  expect(screen.getByRole("button", { name: "Music off" })).toBeInTheDocument();
});
