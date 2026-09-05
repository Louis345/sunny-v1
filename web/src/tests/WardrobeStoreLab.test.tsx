import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WardrobeStoreLab } from "../components/WardrobeStoreLab";
import {
  WARDROBE_STORE_CATALOG,
  WARDROBE_STORE_STORAGE_KEY,
  createCompanionShoppingVisit,
  createInitialWardrobeStoreState,
  getCompatibleWardrobeItems,
} from "../lib/wardrobeStore";

const companion = {
  id: "elli",
  name: "Elli",
  modelUrl: "/companions/sample.vrm",
};

function createCallProps() {
  return {
    talkPhase: "idle" as const,
    responseText: "That one definitely caught my eye.",
    error: null,
    onAskVoice: vi.fn(),
  };
}

describe("WardrobeStoreLab shopping call", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it("opens at the entrance with the full companion and no selected product", () => {
    render(
      <WardrobeStoreLab
        companion={companion}
        companionPreview={<div data-testid="companion-vrm">full body VRM</div>}
        call={createCallProps()}
        onWardrobeChange={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Shopping with Elli" })).toBeTruthy();
    expect(screen.getByLabelText("Elli store entrance")).toContainElement(
      screen.getByTestId("companion-vrm"),
    );
    expect(screen.queryByRole("heading", { name: "Royal Crown" })).toBeNull();
    expect(screen.queryByLabelText("Elli live")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Talk to Elli" })).toBeNull();
    expect(screen.queryByLabelText("Talk with Elli")).toBeNull();
    expect(screen.getByRole("complementary", { name: "Shop items" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "View Royal Crown, 20 coins" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "View Navy Ribbon Dress, 60 coins" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Blue Celtic Sweater/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Galaxy Hero Outfit/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Comet Hoodie/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Constellation Blazer/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "The Lantern Room" })).toBeNull();
  });

  it("renders variant-specific garment thumbnails instead of duplicate emoji", () => {
    render(
      <WardrobeStoreLab
        companion={companion}
        companionPreview={<div data-testid="companion-vrm">full body VRM</div>}
        call={createCallProps()}
        onWardrobeChange={vi.fn()}
        onExit={vi.fn()}
        visitSeed="thumbnail-variants"
      />,
    );

    expect(screen.getByTestId("wardrobe-thumbnail-rose-ribbon-dress")).toHaveAttribute(
      "data-thumbnail-color",
      "#ff8fb2",
    );
    expect(screen.getByTestId("wardrobe-thumbnail-plum-ribbon-dress")).toHaveAttribute(
      "data-thumbnail-color",
      "#c878ff",
    );
    expect(screen.getByTestId("wardrobe-thumbnail-teal-ribbon-dress")).toHaveAttribute(
      "data-thumbnail-silhouette",
      "dress",
    );
  });

  it("moves one live companion renderer to try-on and waits for the child to start the conversation", () => {
    const onWardrobeChange = vi.fn();
    const call = createCallProps();
    const renderCompanion = vi.fn((view: "full_body" | "portrait") => (
      <div data-testid="companion-vrm">{view} VRM</div>
    ));
    const { rerender } = render(
      <WardrobeStoreLab
        companion={companion}
        companionPreview={renderCompanion}
        call={call}
        onWardrobeChange={onWardrobeChange}
        onExit={vi.fn()}
        visitSeed="ui-flow"
      />,
    );

    expect(renderCompanion).toHaveBeenLastCalledWith("full_body");

    fireEvent.click(
      screen.getByRole("button", { name: "View Navy Ribbon Dress, 60 coins" }),
    );
    expect(renderCompanion).toHaveBeenLastCalledWith("portrait");
    expect(screen.getByLabelText("Elli live")).toContainElement(
      screen.getByTestId("companion-vrm"),
    );
    expect(screen.queryByLabelText("Elli is thinking")).toBeNull();
    expect(screen.queryByText("That one definitely caught my eye.")).toBeNull();

    rerender(
      <WardrobeStoreLab
        companion={companion}
        companionPreview={renderCompanion}
        call={{ ...call, talkPhase: "thinking" }}
        onWardrobeChange={onWardrobeChange}
        onExit={vi.fn()}
        visitSeed="ui-flow"
      />,
    );
    expect(screen.getByLabelText("Elli is thinking")).toBeTruthy();
    expect(screen.queryByText("That one definitely caught my eye.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Talk to Elli by voice" }));
    expect(call.onAskVoice).toHaveBeenCalledTimes(0);

    rerender(
      <WardrobeStoreLab
        companion={companion}
        companionPreview={renderCompanion}
        call={call}
        onWardrobeChange={onWardrobeChange}
        onExit={vi.fn()}
        visitSeed="ui-flow"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Talk to Elli by voice" }));
    expect(call.onAskVoice).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Try on Navy Ribbon Dress" }));

    expect(renderCompanion).toHaveBeenLastCalledWith("full_body");
    expect(screen.getByLabelText("Elli try-on stage")).toContainElement(
      screen.getByTestId("companion-vrm"),
    );
    expect(screen.queryByLabelText("Elli live")).toBeNull();
    expect(screen.getAllByTestId("companion-vrm")).toHaveLength(1);
    expect(call.onAskVoice).toHaveBeenCalledTimes(1);
    expect(onWardrobeChange).toHaveBeenLastCalledWith({
      accessoryId: "none",
      outfitId: "sleeveless-dress",
      outfitMaterialVariant: {
        id: "sleeveless-dress",
        tint: "#ffffff",
      },
    });
    const tryOnTalkButton = screen.getByRole("button", {
      name: "Talk to Elli by voice",
    });
    fireEvent.click(tryOnTalkButton);
    expect(call.onAskVoice).toHaveBeenCalledTimes(2);

    rerender(
      <WardrobeStoreLab
        companion={companion}
        companionPreview={renderCompanion}
        call={{
          ...call,
          talkPhase: "speaking",
          responseText: "The navy ribbon is lovely, but it is not my mood today.",
        }}
        onWardrobeChange={onWardrobeChange}
        onExit={vi.fn()}
        visitSeed="ui-flow"
      />,
    );
    expect(screen.getByLabelText("Elli is speaking")).toHaveTextContent("Speaking");
    expect(screen.queryByLabelText("Elli’s generated opinion")).toBeNull();
    expect(
      screen.queryByText("The navy ribbon is lovely, but it is not my mood today."),
    ).toBeNull();
  });

  it("shows an explicit provider failure on the try-on stage instead of looking canned", () => {
    render(
      <WardrobeStoreLab
        companion={companion}
        companionPreview={<div data-testid="companion-vrm">full body VRM</div>}
        call={{
          ...createCallProps(),
          error: "Live companion voice is unavailable.",
        }}
        onWardrobeChange={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "View Navy Ribbon Dress, 60 coins" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try on Navy Ribbon Dress" }));

    expect(screen.getByRole("alert")).toHaveAccessibleName("Elli is unavailable");
    expect(screen.getByRole("alert")).toHaveTextContent("Unavailable");
    expect(screen.queryByText("Live companion voice is unavailable.")).toBeNull();
  });

  it("keeps a real voice control available after the companion puts an item on", () => {
    const call = createCallProps();
    render(
      <WardrobeStoreLab
        companion={companion}
        companionPreview={<div data-testid="companion-vrm">full body VRM</div>}
        call={call}
        onWardrobeChange={vi.fn()}
        onExit={vi.fn()}
        visitSeed="try-on-voice"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "View Navy Ribbon Dress, 60 coins" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try on Navy Ribbon Dress" }));
    fireEvent.click(screen.getByRole("button", { name: "Talk to Elli by voice" }));

    expect(call.onAskVoice).toHaveBeenCalledTimes(1);
  });

  it("keeps the fitting room open while the child cycles directly through items", () => {
    const onWardrobeChange = vi.fn();
    const onDebugEvent = vi.fn();
    render(
      <WardrobeStoreLab
        companion={companion}
        companionPreview={<div data-testid="companion-vrm">full body VRM</div>}
        call={createCallProps()}
        onWardrobeChange={onWardrobeChange}
        onDebugEvent={onDebugEvent}
        onExit={vi.fn()}
        visitSeed="sticky-fitting-room"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "View Navy Ribbon Dress, 60 coins" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try on Navy Ribbon Dress" }));
    expect(screen.getByLabelText("Elli try-on stage")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "View Royal Crown, 20 coins" }),
    );

    expect(screen.getByLabelText("Elli try-on stage")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Royal Crown" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try on Royal Crown" })).toBeNull();
    expect(onWardrobeChange).toHaveBeenLastCalledWith({
      accessoryId: "crown",
      outfitId: "none",
    });
    expect(
      onDebugEvent.mock.calls.filter(
        ([event]) => event.type === "wardrobe_try_on_started",
      ),
    ).toHaveLength(2);
  });

  it("preserves the product palette when cycling between variants of one silhouette", () => {
    const onWardrobeChange = vi.fn();
    render(
      <WardrobeStoreLab
        companion={companion}
        companionPreview={<div data-testid="companion-vrm">full body VRM</div>}
        call={createCallProps()}
        onWardrobeChange={onWardrobeChange}
        onExit={vi.fn()}
        visitSeed="palette-cycle"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "View Navy Ribbon Dress, 60 coins" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try on Navy Ribbon Dress" }));
    fireEvent.click(
      screen.getByRole("button", { name: "View Rose Ribbon Dress, 65 coins" }),
    );

    expect(onWardrobeChange).toHaveBeenLastCalledWith({
      accessoryId: "none",
      outfitId: "sleeveless-dress",
      outfitMaterialVariant: {
        id: "rose-ribbon-dress",
        tint: "#ff8fb2",
      },
    });
  });

  it("anchors the state bubble to the live VRM head instead of a fixed stage percentage", () => {
    const call = { ...createCallProps(), talkPhase: "listening" as const };
    const { rerender } = render(
      <WardrobeStoreLab
        companion={companion}
        companionPreview={<div data-testid="companion-vrm">full body VRM</div>}
        companionHeadAnchor={{ x: 0.28, y: 0.2 }}
        call={call}
        onWardrobeChange={vi.fn()}
        onExit={vi.fn()}
        visitSeed="head-anchor"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "View Navy Ribbon Dress, 60 coins" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try on Navy Ribbon Dress" }));

    const rightBubble = screen.getByLabelText("Elli is listening");
    expect(rightBubble).toHaveClass("is-head-anchored", "is-anchor-right");
    expect(rightBubble).toHaveStyle({
      "--companion-head-x": "28%",
      "--companion-head-y": "20%",
    });

    rerender(
      <WardrobeStoreLab
        companion={companion}
        companionPreview={<div data-testid="companion-vrm">full body VRM</div>}
        companionHeadAnchor={{ x: 0.86, y: 0.18 }}
        call={call}
        onWardrobeChange={vi.fn()}
        onExit={vi.fn()}
        visitSeed="head-anchor"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "View Navy Ribbon Dress, 60 coins" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try on Navy Ribbon Dress" }));

    expect(screen.getByLabelText("Elli is listening")).toHaveClass(
      "is-head-anchored",
      "is-anchor-left",
    );
  });

  it("keeps purchase arithmetic and confirmation inside the same shopping screen", () => {
    const visitSeed = "purchase-flow";
    const state = createInitialWardrobeStoreState();
    const items = getCompatibleWardrobeItems(
      WARDROBE_STORE_CATALOG,
      companion.modelUrl,
      companion.id,
    );
    const visit = createCompanionShoppingVisit({
      companionId: companion.id,
      items,
      state,
      visitSeed,
    });
    const acceptedItem = items.find(
      (item) => visit.itemOpinions[item.id]?.companionConsentsToWear,
    );
    expect(acceptedItem).toBeTruthy();
    const onExit = vi.fn();
    render(
      <WardrobeStoreLab
        companion={companion}
        companionPreview={<div data-testid="companion-vrm">full body VRM</div>}
        call={createCallProps()}
        onWardrobeChange={vi.fn()}
        onExit={onExit}
        exitLabel="Back to the showroom"
        visitSeed={visitSeed}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: `View ${acceptedItem?.name}, ${acceptedItem?.price} coins`,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: `Try on ${acceptedItem?.name}` }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: `Buy and wear ${acceptedItem?.name} for ${acceptedItem?.price} coins`,
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      `${acceptedItem?.name} added to Elli’s closet · 100 → ${100 - (acceptedItem?.price ?? 0)} coins`,
    );
    expect(screen.getByRole("heading", { name: "Shopping with Elli" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: /receipt/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Back to the showroom" }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("keeps unapproved downloaded outfits out of other character stores", () => {
    render(
      <WardrobeStoreLab
        companion={{
          id: "kefla",
          name: "Kefla",
          modelUrl: "/companions/Kefla.vrm",
        }}
        companionPreview={<div data-testid="companion-vrm">full body VRM</div>}
        call={createCallProps()}
        onWardrobeChange={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /Navy Ribbon Dress/ })).toBeNull();
    expect(screen.getByRole("button", { name: "View Royal Crown, 20 coins" })).toBeTruthy();
  });

  it("publishes exact store truth for the companion conversation", async () => {
    const onShoppingContextChange = vi.fn();
    render(
      <WardrobeStoreLab
        companion={companion}
        companionPreview={<div data-testid="companion-vrm">full body VRM</div>}
        call={createCallProps()}
        onWardrobeChange={vi.fn()}
        onShoppingContextChange={onShoppingContextChange}
        onExit={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(onShoppingContextChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mode: "entrance",
          walletBalance: 100,
          selectedItem: null,
        }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "View Royal Crown, 20 coins" }));

    await waitFor(() =>
      expect(onShoppingContextChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mode: "review",
          selectedItem: expect.objectContaining({ id: "royal-crown" }),
        }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Try on Royal Crown" }));

    await waitFor(() =>
      expect(onShoppingContextChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mode: "try_on",
          selectedItem: expect.objectContaining({ id: "royal-crown" }),
        }),
      ),
    );
  });

  it("exposes an opt-in copyable debug trace and records the store-to-conversation lifecycle", async () => {
    const call = createCallProps();
    const onDebugEvent = vi.fn();
    const onCopyDebugTraceLink = vi.fn();
    const onExit = vi.fn();

    render(
      <WardrobeStoreLab
        companion={companion}
        companionPreview={<div data-testid="companion-vrm">full body VRM</div>}
        call={call}
        onWardrobeChange={vi.fn()}
        onExit={onExit}
        exitLabel="Back to the showroom"
        visitSeed="debug-lifecycle"
        debugTraceLink="http://127.0.0.1:5187/api/companions/video-call-traces/trace123"
        debugTraceCopyStatus="Debug log copied"
        onCopyDebugTraceLink={onCopyDebugTraceLink}
        onDebugEvent={onDebugEvent}
      />,
    );

    expect(screen.getByText("Debug log copied")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy debug log" }));
    expect(onCopyDebugTraceLink).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(onDebugEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "wardrobe_store_mounted",
          context: expect.objectContaining({ mode: "entrance", selectedItem: null }),
        }),
      ),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "View Navy Ribbon Dress, 60 coins" }),
    );
    await waitFor(() =>
      expect(onDebugEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "wardrobe_item_reviewed",
          context: expect.objectContaining({
            mode: "review",
            selectedItem: expect.objectContaining({ id: "sleeveless-dress" }),
          }),
        }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Try on Navy Ribbon Dress" }));
    await waitFor(() =>
      expect(onDebugEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "wardrobe_try_on_started",
          context: expect.objectContaining({
            mode: "try_on",
            selectedItem: expect.objectContaining({ id: "sleeveless-dress" }),
          }),
        }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Talk to Elli by voice" }));
    expect(onDebugEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "wardrobe_voice_requested",
        context: expect.objectContaining({ mode: "try_on" }),
      }),
    );
    expect(call.onAskVoice).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Back to the showroom" }));
    expect(onDebugEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "wardrobe_store_exited",
        context: expect.objectContaining({ mode: "try_on" }),
      }),
    );
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("turns provider failures into a safe portrait state instead of dialogue", () => {
    render(
      <WardrobeStoreLab
        companion={companion}
        companionPreview={<div data-testid="companion-vrm">full body VRM</div>}
        call={{
          ...createCallProps(),
          error: "400 provider billing response that should never be shown to a child",
        }}
        onWardrobeChange={vi.fn()}
        onExit={vi.fn()}
        visitSeed="provider-failure"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "View Royal Crown, 20 coins" }));

    expect(
      screen.getByRole("alert", { name: "Elli is unavailable" }),
    ).toHaveTextContent("Unavailable");
    expect(screen.queryByLabelText("Elli is thinking")).toBeNull();
    expect(screen.queryByText(/provider billing response/)).toBeNull();
  });

  it("enforces a code-owned refusal without spending coins", () => {
    const visitSeed = "strong-refusal";
    const state = createInitialWardrobeStoreState();
    const items = getCompatibleWardrobeItems(
      WARDROBE_STORE_CATALOG,
      companion.modelUrl,
      companion.id,
    );
    const visit = createCompanionShoppingVisit({
      companionId: companion.id,
      items,
      state,
      visitSeed,
    });
    const rejectedItem = items.find(
      (item) => visit.itemOpinions[item.id]?.verdict === "reject",
    );
    expect(rejectedItem).toBeTruthy();

    render(
      <WardrobeStoreLab
        companion={companion}
        companionPreview={<div data-testid="companion-vrm">full body VRM</div>}
        call={createCallProps()}
        onWardrobeChange={vi.fn()}
        onExit={vi.fn()}
        visitSeed={visitSeed}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(`View ${rejectedItem?.name}`),
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: `Try on ${rejectedItem?.name}` }),
    );

    expect(screen.getByText("Not for me today")).toBeTruthy();
    expect(screen.queryByText("Elli would rather keep looking.")).toBeNull();
    expect(screen.queryByText("Saving it does not spend any coins.")).toBeNull();
    expect(screen.queryByRole("button", { name: /Buy and wear/ })).toBeNull();
    expect(screen.getByText("100 demo coins")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Save .* for later/ })).toBeTruthy();
  });

  it("blocks a rejected owned item from being equipped from the closet", () => {
    const visitSeed = "owned-refusal";
    const items = getCompatibleWardrobeItems(
      WARDROBE_STORE_CATALOG,
      companion.modelUrl,
      companion.id,
    );
    const state = {
      ...createInitialWardrobeStoreState(),
      ownedItemIds: items.map((item) => item.id),
    };
    const visit = createCompanionShoppingVisit({
      companionId: companion.id,
      items,
      state,
      visitSeed,
    });
    const rejectedItem = items.find(
      (item) => !visit.itemOpinions[item.id]?.companionConsentsToWear,
    );
    expect(rejectedItem).toBeTruthy();
    window.localStorage.setItem(WARDROBE_STORE_STORAGE_KEY, JSON.stringify(state));
    const onWardrobeChange = vi.fn();

    render(
      <WardrobeStoreLab
        companion={companion}
        companionPreview={<div data-testid="companion-vrm">full body VRM</div>}
        call={createCallProps()}
        onWardrobeChange={onWardrobeChange}
        onExit={vi.fn()}
        visitSeed={visitSeed}
      />,
    );
    onWardrobeChange.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Elli’s closet" }));
    fireEvent.click(screen.getByRole("button", { name: rejectedItem?.name }));

    expect(screen.getByText(`Elli does not want to wear ${rejectedItem?.name} today.`)).toBeTruthy();
    expect(screen.getByText("100 demo coins")).toBeTruthy();
    expect(onWardrobeChange).not.toHaveBeenCalled();
  });
});

// Shopping behavior uses explicit synthetic approvals. Real assets stay quarantined;
// wardrobe-certification.test.ts exercises the unmocked, version-bound gate.
vi.mock("../lib/wardrobeBodyProfiles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/wardrobeBodyProfiles")>();
  return {...actual, resolveWardrobeTemplateCertification: (companionId: string, templateId: string) => ({
    companionId, templateId,
    status: (["royal-crown", "cat-ears", "star-halo"].includes(templateId) || (templateId === "ribbon-dress" && ["elli", "matilda"].includes(companionId))) ? "approved" : "candidate",
    reason: "TEST FIXTURE ONLY — synthetic human approval for shopping behavior",
  })};
});
