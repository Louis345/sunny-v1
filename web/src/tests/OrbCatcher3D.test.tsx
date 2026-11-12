import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { LUMIPUFF_MONSTER } from "../../../src/shared/capturedMonsterCatalog";
import { OrbCatcher3D } from "../components/OrbCatcher3D";

vi.mock("../utils/sparkOrbSfx", () => ({ playSparkOrbSfx: vi.fn(), startSparkOrbPullTone: () => null }));

// Prototype guard: where 3D cannot run (no WebGL), the stage says so instead of crashing the screen.
it("shows the creature, her throws, and a plain message when 3D is unavailable", () => {
  render(<OrbCatcher3D creature={LUMIPUFF_MONSTER} throws={3} timeOfDay="day" season="autumn" />);
  expect(screen.getByText("Lumipuff")).toBeInTheDocument();
  expect(screen.getByTestId("orb-3d-throws").children).toHaveLength(3);
  expect(screen.getByText(/3D is not available/)).toBeInTheDocument();
});
