import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { WardrobeCompatibilityLab } from "../components/WardrobeCompatibilityLab";
import {
  WARDROBE_STORE_CERTIFICATION_CASES,
} from "../lib/wardrobeBodyProfiles";
import { WARDROBE_STORE_CATALOG } from "../lib/wardrobeStore";

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
    expect(css).toMatch(
      /wardrobe-compatibility-lab__viewport\s*>\s*:first-child\s*\{[\s\S]*?transform:\s*scale\(1\.34\)\s*!important;/,
    );
  });

  it("presents every model at one consistent full-body review stage", () => {
    const onExit = vi.fn();
    render(
      <WardrobeCompatibilityLab
        cases={WARDROBE_STORE_CERTIFICATION_CASES}
        items={WARDROBE_STORE_CATALOG}
        onExit={onExit}
        renderSourceCompanion={(testCase) => (
          <div data-testid="source-preview">{testCase.companionId}</div>
        )}
        renderCompanion={(testCase, item, calibration) => (
          <div data-testid="compatibility-preview">
            {testCase.modelUrl}:{item.id}:{calibration.identityScale.toFixed(2)}:
            {calibration.identityOffsetY.toFixed(2)}
          </div>
        )}
      />,
    );

    expect(
      screen.getByRole("region", { name: "VRM clothing compatibility lab" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Wardrobe Certification Lab" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Review/ })).toHaveLength(
      WARDROBE_STORE_CERTIFICATION_CASES.length,
    );
    expect(screen.getByTestId("compatibility-preview")).toHaveTextContent(
      "/companions/elli-wardrobe-identity-preserved-v1.vrm:sleeveless-dress:1.00:0.00",
    );
    expect(screen.getByTestId("source-preview")).toHaveTextContent("elli");
    expect(screen.getByText("Original character")).toBeTruthy();
    expect(screen.getByText("Wardrobe fit")).toBeTruthy();
    expect(screen.getByText("0 of 8 companions approved")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Preview Teal Ribbon Dress" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Review Kefla identity on standard body" }));

    expect(screen.getByTestId("compatibility-preview")).toHaveTextContent(
      "/companions/sample.vrm:sleeveless-dress:1.00:0.00",
    );
    expect(screen.getByTestId("source-preview")).toHaveTextContent("kefla");
    expect(screen.getByText("Quarantined — human review required")).toBeTruthy();
    expect(screen.getAllByText("sunny-standard-v1").length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: "Preview Teal Ribbon Dress" }));
    expect(screen.getByTestId("compatibility-preview")).toHaveTextContent(
      "/companions/sample.vrm:teal-ribbon-dress:1.00:0.00",
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Review Matilda prepared identity",
      }),
    );

    expect(screen.getByText("Prepared complete identity · candidate")).toBeTruthy();
    expect(screen.getAllByText("identity proof").length).toBeGreaterThan(0);
    expect(screen.getByText("Quarantined — human review required")).toBeTruthy();
  });

  it("calibrates only the dressed preview and resets to the reviewed profile", () => {
    render(
      <WardrobeCompatibilityLab
        cases={WARDROBE_STORE_CERTIFICATION_CASES}
        items={WARDROBE_STORE_CATALOG}
        onExit={vi.fn()}
        renderSourceCompanion={(testCase) => (
          <div data-testid="source-preview">{testCase.companionId}</div>
        )}
        renderCompanion={(testCase, _item, calibration) => (
          <div data-testid="calibrated-preview">
            {testCase.companionId}:{calibration.identityScale.toFixed(2)}:
            {calibration.identityOffsetY.toFixed(2)}
          </div>
        )}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Review Princess identity on standard body",
      }),
    );
    expect(screen.getByTestId("calibrated-preview")).toHaveTextContent(
      "princess:1.28:0.00",
    );

    fireEvent.click(screen.getByRole("button", { name: "Increase head size" }));
    fireEvent.click(screen.getByRole("button", { name: "Move head down" }));
    expect(screen.getByTestId("calibrated-preview")).toHaveTextContent(
      "princess:1.32:-0.01",
    );
    expect(screen.getByTestId("source-preview")).toHaveTextContent("princess");

    fireEvent.click(screen.getByRole("button", { name: "Reset calibration" }));
    expect(screen.getByTestId("calibrated-preview")).toHaveTextContent(
      "princess:1.28:0.00",
    );
  });
});

it('applies the same inspection view and movement to original and dressed companions', () => {
  const original = vi.fn((..._args: unknown[]) => <div />);
  const dressed = vi.fn((..._args: unknown[]) => <div />);
  render(<WardrobeCompatibilityLab cases={WARDROBE_STORE_CERTIFICATION_CASES} items={WARDROBE_STORE_CATALOG} onExit={() => {}} renderSourceCompanion={original} renderCompanion={dressed} />);
  fireEvent.change(screen.getByLabelText('Inspection view'), {target:{value:'side'}});
  fireEvent.change(screen.getByLabelText('Inspection movement'), {target:{value:'arms-up'}});
  fireEvent.change(screen.getByLabelText('Inspection accessory'), {target:{value:'crown'}});
  expect(original.mock.calls.at(-1)?.[1]).toMatchObject({view:'side',pose:'arms-up',accessory:'crown'});
  expect(dressed.mock.calls.at(-1)?.[3]).toMatchObject({view:'side',pose:'arms-up',accessory:'crown'});
});
