import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreatureDen } from "../components/CreatureDen";
import type { DenState } from "../../../src/shared/creatureDenRules";
import { SIDEKICK_CHEER_MS, SIDEKICK_SLEEP_MS, SidekickBuddy } from "../components/SidekickBuddy";
import { CREATURE_CATALOG } from "../../../src/shared/capturedMonsterCatalog";

const playSfx = vi.hoisted(() => vi.fn());
vi.mock("../utils/sparkOrbSfx", () => ({
  playSparkOrbSfx: playSfx,
  startSparkOrbPullTone: () => null,
}));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  playSfx.mockClear();
});

const state: DenState = {
  creatures: [
    { creatureId: "lumipuff", nickname: "Lumi", bond: 40, caughtAt: "2026-11-01T18:00:00.000Z" },
    { creatureId: "glowmoth", nickname: "Glow", bond: 34, caughtAt: "2026-11-08T21:00:00.000Z" },
  ],
  sidekickId: null,
  food: { apple_bite: 2, star_candy: 0, mystery_snack: 1 },
};

describe("CreatureDen", () => {
  it("shows her creatures out in the wild; tapping one opens its den card, and it can be recalled or sent home", () => {
    const onChange = vi.fn();
    const { rerender } = render(<CreatureDen state={state} onChange={onChange} />);
    expect(screen.getByTestId("den-wild-lumipuff")).toBeInTheDocument();
    expect(screen.getByTestId("den-wild-glowmoth")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("den-wild-glowmoth"));
    const card = screen.getByRole("dialog", { name: /Glow/ });
    expect(card).toHaveTextContent("Glowmoth");
    expect(card).toHaveTextContent("#003");
    expect(card).toHaveTextContent("Rare");
    fireEvent.click(screen.getByRole("button", { name: /Recall Glow/ }));
    const recalled = onChange.mock.calls.at(-1)![0] as DenState;
    expect(recalled.sidekickId).toBe("glowmoth");

    rerender(<CreatureDen state={recalled} onChange={onChange} />);
    expect(screen.getByTestId("den-wild-glowmoth")).toHaveAttribute("data-sidekick", "true");
    fireEvent.click(screen.getByRole("button", { name: /Send Glow home/ }));
    expect((onChange.mock.calls.at(-1)![0] as DenState).sidekickId).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Close/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("feeds with store food she owns, and points to the store when she has none", () => {
    const onChange = vi.fn();
    render(<CreatureDen state={state} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("den-wild-lumipuff"));
    fireEvent.click(screen.getByRole("button", { name: /Apple Bite ×2/ }));
    expect((onChange.mock.calls.at(-1)![0] as DenState).food.apple_bite).toBe(1);
    expect(screen.getByRole("button", { name: /Star Candy ×0/ })).toBeDisabled();
    expect(screen.getByText(/Buy more food in the store/)).toBeInTheDocument();
  });

  it("creatures in the wild stay quiet on their own and chirp only when she taps them", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    render(<CreatureDen state={state} onChange={vi.fn()} />);
    act(() => vi.advanceTimersByTime(60_000));
    expect(playSfx).not.toHaveBeenCalledWith("chirp", expect.anything());
    fireEvent.click(screen.getByTestId("den-wild-lumipuff"));
    expect(playSfx).toHaveBeenCalledWith("chirp", expect.anything());
  });
});

describe("CreatureDen bond stakes and renaming", () => {
  it("locks recall for a shy creature and says how to win it back", () => {
    const shy: DenState = { ...state, creatures: [{ creatureId: "glowmoth", nickname: "Glow", bond: 12, caughtAt: "x" }] };
    render(<CreatureDen state={shy} onChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId("den-wild-glowmoth"));
    expect(screen.getByRole("button", { name: /Recall Glow/ })).toBeDisabled();
    expect(screen.getByText(/Feed Glow to win it back/)).toBeInTheDocument();
  });

  it("tells her when her sidekick ran home, and the note can be closed", () => {
    const onChange = vi.fn();
    render(<CreatureDen state={{ ...state, ranAwayId: "glowmoth" }} onChange={onChange} />);
    expect(screen.getByRole("status")).toHaveTextContent("Glow missed you and ran home");
    fireEvent.click(screen.getByRole("button", { name: /Got it/ }));
    expect((onChange.mock.calls.at(-1)![0] as DenState).ranAwayId).toBeNull();
  });

  it("renames a creature from its den card", () => {
    const onChange = vi.fn();
    render(<CreatureDen state={state} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("den-wild-lumipuff"));
    fireEvent.change(screen.getByLabelText("Nickname"), { target: { value: "Bubbles" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    const renamed = onChange.mock.calls.at(-1)![0] as DenState;
    expect(renamed.creatures.find((c) => c.creatureId === "lumipuff")!.nickname).toBe("Bubbles");
  });
});

describe("SidekickBuddy", () => {
  const glowmoth = CREATURE_CATALOG.find((species) => species.id === "glowmoth")!;

  it("cheers when she gets one right, then settles; dozes when nothing happens", () => {
    vi.useFakeTimers();
    const { rerender } = render(<SidekickBuddy creature={glowmoth} nickname="Glow" cheerKey={0} onDismiss={vi.fn()} />);
    const buddy = screen.getByTestId("sidekick-buddy");
    expect(buddy).toHaveAttribute("data-mood", "idle");
    rerender(<SidekickBuddy creature={glowmoth} nickname="Glow" cheerKey={1} onDismiss={vi.fn()} />);
    expect(buddy).toHaveAttribute("data-mood", "cheer");
    act(() => vi.advanceTimersByTime(SIDEKICK_CHEER_MS));
    expect(buddy).toHaveAttribute("data-mood", "idle");
    act(() => vi.advanceTimersByTime(SIDEKICK_SLEEP_MS));
    expect(buddy).toHaveAttribute("data-mood", "sleep");
  });

  it("tapping the sidekick sends it home", () => {
    const onDismiss = vi.fn();
    render(<SidekickBuddy creature={glowmoth} nickname="Glow" cheerKey={0} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /Send Glow home/ }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("den creatures feel alive (same idle life as Lumipuff in the orb scene)", () => {
  const glowmoth = CREATURE_CATALOG.find((species) => species.id === "glowmoth")!;

  it("every creature in the wild breathes and fidgets on its own random clock", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    render(<CreatureDen state={state} onChange={vi.fn()} />);
    const lumi = screen.getByTestId("den-wild-lumipuff");
    expect(lumi).toHaveAttribute("data-idle-life", "breathing");
    act(() => vi.advanceTimersByTime(2_700));
    expect(lumi).toHaveAttribute("data-idle-fidget", "hop");
  });

  it("the sidekick fidgets while awake and keeps still while it sleeps", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    render(<SidekickBuddy creature={glowmoth} nickname="Glow" cheerKey={0} onDismiss={vi.fn()} />);
    const buddy = screen.getByTestId("sidekick-buddy");
    act(() => vi.advanceTimersByTime(2_700));
    expect(buddy).toHaveAttribute("data-idle-fidget", "hop");
    act(() => vi.advanceTimersByTime(SIDEKICK_SLEEP_MS));
    expect(buddy).toHaveAttribute("data-mood", "sleep");
    expect(buddy).not.toHaveAttribute("data-idle-life");
    expect(buddy).not.toHaveAttribute("data-idle-fidget");
  });
});
