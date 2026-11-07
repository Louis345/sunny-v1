import * as engineering from "../lib/wardrobeBodyProfiles";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { WardrobeCompatibilityLab } from "../components/WardrobeCompatibilityLab";
import {
  WARDROBE_STORE_CERTIFICATION_CASES,
} from "../lib/wardrobeBodyProfiles";
import { WARDROBE_STORE_CATALOG } from "../lib/wardrobeStore";

beforeEach(()=>vi.spyOn(engineering,"isWardrobeReadyForHumanReview").mockReturnValue(true));
afterEach(()=>vi.restoreAllMocks());
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
        renderCompanion={(testCase, item) => (
          <div data-testid="compatibility-preview">
            {testCase.modelUrl}:{item.id}
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
      "/companions/elli-wardrobe-identity-preserved-v1.vrm:sleeveless-dress",
    );
    expect(screen.getByTestId("source-preview")).toHaveTextContent("elli");
    expect(screen.getByText("Original character")).toBeTruthy();
    expect(screen.getByText("Wardrobe fit")).toBeTruthy();
    expect(screen.getByText("0 of 8 companions approved")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Preview Teal Ribbon Dress" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Review Kefla prepared identity" }));

    expect(screen.getByTestId("compatibility-preview")).toHaveTextContent(
      "/companions/kefla-wardrobe-native-identity-v1.vrm:sleeveless-dress",
    );
    expect(screen.getByTestId("source-preview")).toHaveTextContent("kefla");
    expect(screen.getByText("Awaiting human approval")).toBeTruthy();
    expect(screen.getAllByText("kefla-v1").length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: "Preview Teal Ribbon Dress" }));
    expect(screen.getByTestId("compatibility-preview")).toHaveTextContent(
      "/companions/kefla-wardrobe-native-identity-v1.vrm:teal-ribbon-dress",
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Review Matilda prepared identity",
      }),
    );

    expect(screen.getByText("Prepared complete identity · candidate")).toBeTruthy();
    expect(screen.getAllByText("identity proof").length).toBeGreaterThan(0);
    expect(screen.getByText("Awaiting human approval")).toBeTruthy();
  });

  it("never offers head scaling or identity substitution controls", () => {
    render(<WardrobeCompatibilityLab cases={WARDROBE_STORE_CERTIFICATION_CASES} items={WARDROBE_STORE_CATALOG} onExit={vi.fn()} renderSourceCompanion={()=>null} renderCompanion={testCase=><div data-testid="native-preview">{testCase.companionId}</div>} />);
    fireEvent.click(screen.getByRole("button",{name:"Review Princess prepared identity"}));
    expect(screen.getByTestId("native-preview")).toHaveTextContent("princess");
    expect(screen.queryByRole("button",{name:"Increase head size"})).toBeNull();
    expect(screen.queryByRole("button",{name:"Move head down"})).toBeNull();
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
  expect(dressed.mock.calls.at(-1)?.[2]).toMatchObject({view:'side',pose:'arms-up',accessory:'crown'});
});
it('offers distinct hoodie and blazer candidates in the diagnostic lab',()=>{
 render(<WardrobeCompatibilityLab cases={WARDROBE_STORE_CERTIFICATION_CASES} items={WARDROBE_STORE_CATALOG} onExit={vi.fn()} renderSourceCompanion={()=>null} renderCompanion={(_c,item)=><div data-testid="candidate-id">{item.asset.kind==='outfit'?item.asset.outfitId:''}</div>}/>);
  fireEvent.click(screen.getByRole('button',{name:'Preview Comet Hoodie'}));
 expect(screen.getByTestId('candidate-id')).toHaveTextContent('comet-hoodie');
  fireEvent.click(screen.getByRole('button',{name:'Preview Constellation Blazer'}));
 expect(screen.getByTestId('candidate-id')).toHaveTextContent('constellation-blazer');
 expect(screen.getByText('Awaiting human approval')).toBeTruthy();
});
it('never renders an unfitted external accessory when changing prepared characters',()=>{
 const dressed=vi.fn(()=>null);render(<WardrobeCompatibilityLab cases={WARDROBE_STORE_CERTIFICATION_CASES} items={WARDROBE_STORE_CATALOG} onExit={vi.fn()} renderSourceCompanion={()=>null} renderCompanion={dressed}/>);
 fireEvent.change(screen.getByLabelText('Inspection accessory'),{target:{value:'crown'}});
 fireEvent.click(screen.getByRole('button',{name:'Review Kefla prepared identity'}));
 expect(screen.getByRole('option',{name:'Crown'})).toBeDisabled();
 expect((dressed.mock.calls.at(-1) as unknown[]|undefined)?.[2]).toMatchObject({accessory:'none'});
});

it('labels unchecked diagnostic previews as engineering work rather than a human-review candidate',()=>{
 vi.mocked(engineering.isWardrobeReadyForHumanReview).mockReturnValue(false);
 render(<WardrobeCompatibilityLab cases={WARDROBE_STORE_CERTIFICATION_CASES} items={WARDROBE_STORE_CATALOG} onExit={vi.fn()} renderSourceCompanion={()=>null} renderCompanion={()=>null}/>);
 expect(screen.getByText('Engineering verification pending')).toBeTruthy();
 expect(screen.queryByText('Awaiting human approval')).toBeNull();
});
