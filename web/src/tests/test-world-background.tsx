import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WorldBackground } from "../components/WorldBackground";

afterEach(() => {
  cleanup();
});

describe("WorldBackground", () => {
  it("uses palette sky→ground gradient when url is absent", () => {
    render(
      <WorldBackground
        url={undefined}
        paletteSky="#1a1a2e"
        paletteGround="#228b5c"
      />,
    );
    const el = screen.getByTestId("world-background-gradient");
    const attr = el.getAttribute("style") ?? "";
    expect(attr).toContain("linear-gradient");
    expect(attr).toMatch(/rgb\(26,\s*26,\s*46\)|#1a1a2e/i);
    expect(attr).toMatch(/rgb\(34,\s*139,\s*92\)|#228b5c/i);
    expect(attr).not.toMatch(/background:\s*#0{3,6}\b/i);
  });

  it("uses default non-black gradient when url and palette are absent", () => {
    render(<WorldBackground url={null} />);
    const el = screen.getByTestId("world-background-gradient");
    const attr = el.getAttribute("style") ?? "";
    expect(attr).toContain("linear-gradient");
    expect(attr).not.toMatch(/:\s*#0{6}\b/);
  });
});
