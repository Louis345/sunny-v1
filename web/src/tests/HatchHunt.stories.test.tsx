import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  farmPresentationStateFromNativeSelection,
  MossyHatchHuntDemoStory,
  initialFarmPresentationState,
} from "../stories/HatchHunt.stories";

vi.mock("../components/CompanionLayer", () => ({
  CompanionLayer: ({ childId }: { childId: string | null }) => (
    <div data-testid="hatch-chase-elli" data-child-id={childId ?? ""}>Elli</div>
  ),
}));

describe("Mossy Hatch Hunt story", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("does not claim a persisted buddy is visible without bridge confirmation", () => {
    expect(initialFarmPresentationState({
      creatureId: "mossback",
      persistedActiveCreatureId: "mossback",
      visibleCreatureId: null,
    })).toEqual({ active: false, presentationStatus: "idle" });

    expect(initialFarmPresentationState({
      creatureId: "mossback",
      persistedActiveCreatureId: "mossback",
      visibleCreatureId: "mossback",
    })).toEqual({ active: true, presentationStatus: "active" });
  });

  it("recognizes the same active buddy when Sunny moves to another screen", () => {
    expect(farmPresentationStateFromNativeSelection({
      childId: "ila",
      creatureId: "mossback",
      persistedActiveCreatureId: "mossback",
      nativeSelectionId: "active:ila:mossback",
    })).toEqual({ active: true, presentationStatus: "active" });

    expect(farmPresentationStateFromNativeSelection({
      childId: "ila",
      creatureId: "mossback",
      persistedActiveCreatureId: "mossback",
      nativeSelectionId: "active:ila:lumipuff",
    })).toEqual({ active: false, presentationStatus: "idle" });
  });

  it("requires the chase and successful capture before recording Mossy in the Farm", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal("fetch", fetchMock);
    render(<MossyHatchHuntDemoStory />);

    fireEvent.click(screen.getByRole("button", { name: "Choose fern egg" }));
    fireEvent.click(screen.getByRole("button", { name: "6 × 7" }));
    fireEvent.click(screen.getByRole("button", { name: "56" }));
    fireEvent.click(screen.getByRole("button", { name: "54" }));
    fireEvent.click(screen.getByRole("button", { name: "48" }));

    expect(await screen.findByText("becau_e", {}, { timeout: 3_500 })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Mossy arrived at Sunny Farm" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  }, 7_000);

  it("moves from Hatch Hunt into the main-branch Spark Orb capture design", async () => {
    const { container } = render(<MossyHatchHuntDemoStory />);

    fireEvent.click(screen.getByRole("button", { name: "Choose fern egg" }));
    fireEvent.click(screen.getByRole("button", { name: "6 × 7" }));
    fireEvent.click(screen.getByRole("button", { name: "56" }));
    fireEvent.click(screen.getByRole("button", { name: "54" }));
    fireEvent.click(screen.getByRole("button", { name: "48" }));

    expect(await screen.findByText("becau_e", {}, { timeout: 3_500 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "because" })).toBeInTheDocument();
    expect(container.querySelector("main[data-flow-phase='chase_questions'] .hatch-hunt__three"))
      .not.toBeInTheDocument();
    expect(screen.getByTestId("spark-orb-encounter").closest(".spark-orb-learning-shell"))
      .toHaveAttribute("data-presentation", "full");
    expect(container.querySelector("[data-capture-template='main-spark-orb-learning-shell']"))
      .toBeInTheDocument();
  });

  it("offers Storybook-only shortcuts without answering academic questions", async () => {
    const { container } = render(<MossyHatchHuntDemoStory />);

    const controls = screen.getByTestId("hatch-hunt-test-controls");
    expect(controls).toHaveTextContent("STORYBOOK TEST CONTROLS");

    fireEvent.click(screen.getByRole("button", { name: "Open Capture Screen" }));
    expect(screen.getByText("becau_e")).toBeInTheDocument();
    expect(screen.queryByText("Choose the egg calling to you")).not.toBeInTheDocument();
    expect(container.querySelector(".hatch-hunt__three")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Charge 3 Sparks" }));
    expect(screen.getByText("Three orbs are ready")).toBeInTheDocument();
    expect(container.querySelector("main[data-flow-phase='capture_ready']"))
      .toBeInTheDocument();
    expect(screen.getByTestId("spark-orb-launch-control")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Return to Whispering Grove" }))
      .not.toBeInTheDocument();
    expect(screen.queryByText("becau_e")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset Demo" }));
    expect(screen.getByText("Choose the egg calling to you")).toBeInTheDocument();
  });

  it("plays a Hatch-animation-only preview with every modal and control removed", async () => {
    const { container } = render(<MossyHatchHuntDemoStory />);

    fireEvent.click(screen.getByRole("button", { name: "Hatch Animation Only" }));

    expect(screen.queryByTestId("hatch-hunt-test-controls")).not.toBeInTheDocument();
    expect(container.querySelector(".hatch-hunt__question")).not.toBeInTheDocument();
    expect(screen.queryByText("CREATURE DISCOVERED")).not.toBeInTheDocument();
    expect(screen.queryByTestId("spark-orb-encounter")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(container.querySelector("main[data-phase='hatched']"))
        .toHaveAttribute("data-reveal-visibility", "unobstructed");
    }, { timeout: 5_000 });

    expect(screen.queryByTestId("hatch-hunt-test-controls")).not.toBeInTheDocument();
    expect(container.querySelector(".hatch-hunt__question")).not.toBeInTheDocument();
    expect(screen.queryByTestId("spark-orb-encounter")).not.toBeInTheDocument();
  }, 7_000);

  it("plays an Escape-animation-only preview from hatch reaction through an unobstructed handoff", async () => {
    const { container } = render(<MossyHatchHuntDemoStory />);

    fireEvent.click(screen.getByRole("button", { name: "Escape Animation Only" }));

    expect(screen.queryByTestId("hatch-hunt-test-controls")).not.toBeInTheDocument();
    expect(container.querySelector(".hatch-hunt__question")).not.toBeInTheDocument();
    expect(screen.queryByText("THE CHASE BEGINS")).not.toBeInTheDocument();
    expect(screen.queryByTestId("spark-orb-encounter")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(container.querySelector("main[data-animation-preview='escape']"))
        .toHaveAttribute("data-animation-stage", "handoff-ready");
    }, { timeout: 7_000 });

    expect(screen.queryByTestId("hatch-hunt-test-controls")).not.toBeInTheDocument();
    expect(container.querySelector(".hatch-hunt__question")).not.toBeInTheDocument();
    expect(screen.queryByText("THE CHASE BEGINS")).not.toBeInTheDocument();
    expect(screen.queryByTestId("spark-orb-encounter")).not.toBeInTheDocument();
  }, 9_000);

  it("plays a Capture-animation-only preview without awarding Mossy or mounting interface panels", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<MossyHatchHuntDemoStory />);

    fireEvent.click(screen.getByRole("button", { name: "Capture Animation Only" }));

    expect(screen.queryByTestId("hatch-hunt-test-controls")).not.toBeInTheDocument();
    expect(container.querySelector(".hatch-hunt__question")).not.toBeInTheDocument();
    expect(screen.queryByTestId("spark-orb-encounter")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(container.querySelector("main[data-animation-preview='capture']"))
        .toHaveAttribute("data-animation-stage", "capture-complete");
    }, { timeout: 8_000 });

    expect(screen.queryByText("Mossy landed safely!")).not.toBeInTheDocument();
    expect(screen.queryByTestId("spark-orb-encounter")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  }, 10_000);

  it("offers a controllable full-tour preview that stops at Farm arrival", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal("fetch", fetchMock);
    render(<MossyHatchHuntDemoStory />);

    const controls = screen.getByTestId("hatch-hunt-test-controls");
    expect(controls).toHaveTextContent("Preview only · no child evidence");
    expect(screen.getByRole("button", { name: "Play Full Tour" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause Tour" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Tour speed" })).toHaveValue("1");

    fireEvent.change(screen.getByRole("combobox", { name: "Tour speed" }), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Play Full Tour" }));

    expect(screen.queryByTestId("hatch-hunt-test-controls")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Capture Screen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Charge 3 Sparks" })).not.toBeInTheDocument();

    expect(
      await screen.findByRole(
        "dialog",
        { name: "Mossy arrived at Sunny Farm" },
        { timeout: 16_000 },
      ),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("hatch-hunt-test-controls"))
      .toHaveAttribute("data-tour-layout", "capture-safe");
    expect(screen.getByRole("button", { name: "Reset Demo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Play Full Tour" })).not.toBeInTheDocument();
  }, 19_000);

  it("supports an assisted chase, captures Mossy once, and keeps native presentation explicit", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_input: string, init: RequestInit) =>
      init.method === "GET"
        ? {
            ok: true,
            status: 200,
            json: async () => ({ active_selection_id: null }),
          }
        : { ok: true, status: 202 },
    );
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<MossyHatchHuntDemoStory />);

    fireEvent.click(screen.getByRole("button", { name: "Choose fern egg" }));
    fireEvent.click(screen.getByRole("button", { name: "6 × 7" }));
    fireEvent.click(screen.getByRole("button", { name: "56" }));
    fireEvent.click(screen.getByRole("button", { name: "54" }));
    fireEvent.click(screen.getByRole("button", { name: "48" }));

    expect(await screen.findByText("Spell the word you hear", {}, { timeout: 3_500 }))
      .toBeInTheDocument();
    expect(screen.getByTestId("hatch-chase-elli")).toHaveTextContent("Elli");

    fireEvent.click(screen.getByRole("button", { name: "becuase" }));
    expect(screen.getByText("Elli's clue: because begins with be and keeps cause at the end."))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "be + cause" }));
    fireEvent.click(screen.getByRole("button", { name: "garden" }));
    fireEvent.click(screen.getByRole("button", { name: "spark" }));

    expect(screen.getByText("Three orbs are ready")).toBeInTheDocument();
    expect(container.querySelector("main[data-flow-phase='capture_ready']"))
      .toBeInTheDocument();
    expect(container.querySelector(".hatch-hunt__three")).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId("spark-orb-launch-control"), { key: "Enter" });

    expect(screen.queryByRole("dialog", { name: "Mossy arrived at Sunny Farm" }))
      .not.toBeInTheDocument();

    const settling = await screen.findByRole(
      "status",
      { name: "Mossy capture settling" },
      { timeout: 6_000 },
    );
    expect(settling).toHaveAttribute("data-arrival-delay-ms", "6000");
    expect(screen.queryByRole("dialog", { name: "Mossy arrived at Sunny Farm" }))
      .not.toBeInTheDocument();

    const arrival = await screen.findByRole(
        "dialog",
        { name: "Mossy arrived at Sunny Farm" },
        { timeout: 7_000 },
      );
    expect(arrival).toHaveAttribute("data-creature-id", "mossback");
    expect(arrival).toHaveAttribute("data-theme-source", "creature-catalog");
    expect(arrival.style.getPropertyValue("--arrival-primary")).toBe("#8fd8a4");
    expect(arrival.style.getPropertyValue("--arrival-energy")).toBe("#ffb84d");
    expect(arrival.style.getPropertyValue("--arrival-band")).toBe("#345f35");
    expect(arrival.style.getPropertyValue("--arrival-gradient")).toContain("#8fd8a4");
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Visit Farm" }));
    fireEvent.click(screen.getByRole("button", { name: "Bring With Me" }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) =>
        init.method === "POST" && String(init.body).includes('"creature_id":"mossback"'),
      )).toBe(true);
    });
  }, 16_000);
});
