import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { WardrobeCompatibilityLab } from "../components/WardrobeCompatibilityLab";
import { WARDROBE_COMPATIBILITY_CASES } from "../lib/wardrobeBodyProfiles";

describe("WardrobeCompatibilityLab", () => {
  it("keeps the full-body comparison canvas inside one viewport", () => {
    const css = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/WardrobeCompatibilityLab.css"),
      "utf8",
    );

    expect(css).toMatch(
      /\.wardrobe-compatibility-lab\s*\{[\s\S]*?\n\s{2}height:\s*100dvh;/,
    );
    expect(css).toMatch(/wardrobe-compatibility-lab__viewport\s*\{[\s\S]*?min-height:\s*0;/);
  });

  it("presents every model at one consistent full-body review stage", () => {
    const onExit = vi.fn();
    render(
      <WardrobeCompatibilityLab
        cases={WARDROBE_COMPATIBILITY_CASES}
        onExit={onExit}
        renderCompanion={(testCase) => (
          <div data-testid="compatibility-preview">{testCase.modelUrl}</div>
        )}
      />,
    );

    expect(
      screen.getByRole("region", { name: "VRM clothing compatibility lab" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Ribbon Dress Compatibility Lab" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Review/ })).toHaveLength(
      WARDROBE_COMPATIBILITY_CASES.length,
    );
    expect(screen.getByTestId("compatibility-preview")).toHaveTextContent(
      "/companions/sample.vrm",
    );

    fireEvent.click(screen.getByRole("button", { name: "Review Kefla source model" }));

    expect(screen.getByTestId("compatibility-preview")).toHaveTextContent(
      "/companions/Kefla.vrm",
    );
    expect(screen.getByText("Candidate — human review required")).toBeTruthy();
    expect(screen.getAllByText("kefla-v1").length).toBeGreaterThanOrEqual(1);
  });
});
