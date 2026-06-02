import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CapturedMonsterCard,
  MonsterDenPreview,
  MonsterLifeLayer,
} from "../components/CapturedMonsterDen";
import {
  LUMIPUFF_MONSTER,
  capturedMonsterCatalog,
} from "../components/capturedMonsterCatalog";

describe("Captured monster den", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("exposes Lumipuff as a configured captured creature", () => {
    expect(capturedMonsterCatalog).toContainEqual(
      expect.objectContaining({
        id: "lumipuff",
        speciesName: "Lumipuff",
        defaultNickname: "Lumi",
        rarity: "uncommon",
        imageSrc: "/encounters/spark-orb/lumipuff.png",
        collectionTitle: "Spark Garden friend",
        statLabel: "SPARK",
        statValue: 214,
      }),
    );
    expect(LUMIPUFF_MONSTER.lifeStates).toEqual(
      expect.arrayContaining(["idle", "curious", "happy", "sleep", "celebrate"]),
    );
    expect(LUMIPUFF_MONSTER.sprite).toMatchObject({
      mode: "css-png",
      futureAtlasReady: true,
    });
    expect(LUMIPUFF_MONSTER).toHaveProperty("capturePersonality", "playful");
  });

  it("renders the captured monster card and emits name and sidekick events", () => {
    const onEvent = vi.fn();
    const onVisitDen = vi.fn();

    render(
      <CapturedMonsterCard
        creature={LUMIPUFF_MONSTER}
        nickname="Lumi"
        mood="curious"
        bond={18}
        onEvent={onEvent}
        onVisitDen={onVisitDen}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Lumipuff captured" })).toBeInTheDocument();
    expect(screen.getByText("Spark Garden friend")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Monster nickname"), {
      target: { value: "Sparkle" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    fireEvent.click(screen.getByRole("button", { name: "Bring Along" }));
    fireEvent.click(screen.getByRole("button", { name: "Visit Den" }));

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "monster_named",
        creatureId: "lumipuff",
        nickname: "Sparkle",
      }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "monster_selected_sidekick",
        creatureId: "lumipuff",
        nickname: "Sparkle",
      }),
    );
    expect(onVisitDen).toHaveBeenCalledWith("Sparkle");
  });

  it("lets kids pet, feed, sleep, and wake the living monster without live API calls", () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const onEvent = vi.fn();

    render(
      <MonsterDenPreview
        creature={LUMIPUFF_MONSTER}
        initialNickname="Sparkle"
        onEvent={onEvent}
      />,
    );

    expect(screen.getByTestId("monster-life-layer")).toHaveAttribute("data-life-state", "idle");

    fireEvent.click(screen.getByRole("button", { name: "Pet Sparkle" }));
    expect(screen.getByTestId("monster-life-layer")).toHaveAttribute("data-life-state", "happy");
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "monster_pet", creatureId: "lumipuff" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Feed treat" }));
    expect(screen.getByTestId("monster-life-layer")).toHaveAttribute("data-life-state", "celebrate");
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "monster_fed", creatureId: "lumipuff" }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(6_200);
    });
    expect(screen.getByTestId("monster-life-layer")).toHaveAttribute("data-life-state", "sleep");
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "monster_sleep", creatureId: "lumipuff" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Wake Sparkle" }));
    expect(screen.getByTestId("monster-life-layer")).toHaveAttribute("data-life-state", "curious");
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "monster_wake", creatureId: "lumipuff" }),
    );
  });

  it("renders life layer states without crashing", () => {
    const states = ["idle", "curious", "happy", "sleep", "celebrate"] as const;
    const { rerender } = render(
      <MonsterLifeLayer creature={LUMIPUFF_MONSTER} nickname="Lumi" lifeState="idle" />,
    );

    for (const state of states) {
      rerender(
        <MonsterLifeLayer creature={LUMIPUFF_MONSTER} nickname="Lumi" lifeState={state} />,
      );
      expect(screen.getByTestId("monster-life-layer")).toHaveAttribute("data-life-state", state);
    }
  });
});
