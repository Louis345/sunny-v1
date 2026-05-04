import { render, renderHook, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompanionCareView } from "../../../src/shared/companionCareTypes";
import {
  type CompanionCareContextValue,
  CompanionCareProvider,
  useCompanionCare,
} from "../context/CompanionCareContext";

function care(moodLabel: CompanionCareView["moodLabel"], coins: number): CompanionCareView {
  return {
    childId: "child_fixture_001",
    companionId: "companion_fixture_001",
    displayName: "Companion Fixture",
    vitals: {
      hunger: 0.7,
      mood: moodLabel === "tired" ? 0.3 : 0.8,
      bond: 0.7,
      energy: moodLabel === "tired" ? 0.2 : 0.8,
      usefulness: 0.7,
      thoughtClarity: 0.7,
      lastSeenAt: "2026-05-04T00:00:00.000Z",
    },
    economy: { coins, storeUnlocks: [] },
    inventory: { food: [], careItems: [] },
    readiness: {
      hungry: false,
      lowEnergy: moodLabel === "tired",
      lowBond: false,
      lowThoughtClarity: false,
      highEnergyReluctance: moodLabel === "tired",
      canContinueTired: true,
      suggestedRepair: "warmup",
    },
    moodLabel,
    lastSeenLabel: "today",
  };
}

const legacyCare = care("happy", 10);
const chartCare = care("tired", 25);

describe("CompanionCareProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prefers care_plan companion care over the legacy mirror", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CompanionCareProvider
        childId="child_fixture_001"
        profile={{
          companionCare: legacyCare,
          care_plan: { companion_care: chartCare },
        }}
      >
        {children}
      </CompanionCareProvider>
    );
    const { result } = renderHook(() => useCompanionCare(), { wrapper });
    expect(result.current.care).toBe(chartCare);
    expect(result.current.behavior.mood).toBe("tired");
  });

  it("feeds through the API and updates care plus animation intent", async () => {
    const nextCare = { ...chartCare, moodLabel: "bright" } as CompanionCareView;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        companionCare: nextCare,
        companionCurrency: 30,
        animation: {
          kind: "rare-reward",
          reference: "animation-b",
          itemId: "mystery_snack",
        },
      }),
    } as Response);
    const onCareChange = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CompanionCareProvider
        childId="child_fixture_001"
        profile={{ care_plan: { companion_care: chartCare } }}
        onCareChange={onCareChange}
      >
        {children}
      </CompanionCareProvider>
    );
    const { result } = renderHook(() => useCompanionCare(), { wrapper });

    await result.current.feed("mystery_snack");

    await waitFor(() => expect(result.current.care).toBe(nextCare));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/profile/child_fixture_001/companion-care/feed",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.current.lastFeedAnimation?.reference).toBe("animation-b");
    expect(result.current.behavior.animation).toBe("dance_victory");
    expect(result.current.behavior.presentationState).toBe("celebrating");
    expect(onCareChange).toHaveBeenCalledWith(nextCare);
  });

  it("stamps repeated feed animations with distinct behavior event ids", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        companionCare: chartCare,
        animation: {
          kind: "normal-feed",
          reference: "animation-a",
          itemId: "apple_bite",
        },
      }),
    } as Response);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CompanionCareProvider
        childId="child_fixture_001"
        profile={{ care_plan: { companion_care: chartCare } }}
      >
        {children}
      </CompanionCareProvider>
    );
    const { result } = renderHook(() => useCompanionCare(), { wrapper });

    await result.current.feed("apple_bite");
    await waitFor(() => expect(result.current.behavior.animation).toBe("silly_laugh"));
    const firstEventId = result.current.behavior.animationEventId;

    await result.current.feed("apple_bite");
    await waitFor(() =>
      expect(result.current.behavior.animationEventId).not.toBe(firstEventId),
    );

    expect(result.current.behavior.animation).toBe("silly_laugh");
    expect(result.current.behavior.presentationState).toBe("feeding");
    expect(firstEventId).toBeTruthy();
  });

  it("emits a structured care event after every successful feed", async () => {
    const nextCare = { ...chartCare, moodLabel: "bright" } as CompanionCareView;
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        companionCare: nextCare,
        companionCurrency: 30,
        animation: {
          kind: "normal-feed",
          reference: "animation-a",
          itemId: "apple_bite",
        },
        preview: true,
      }),
    } as Response);
    const onFeedEvent = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CompanionCareProvider
        childId="child_fixture_001"
        profile={{ care_plan: { companion_care: chartCare } }}
        onFeedEvent={onFeedEvent}
      >
        {children}
      </CompanionCareProvider>
    );
    const { result } = renderHook(() => useCompanionCare(), { wrapper });

    await result.current.feed("apple_bite");
    await waitFor(() => expect(onFeedEvent).toHaveBeenCalled());

    expect(onFeedEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "companion_care_event",
        childId: "child_fixture_001",
        itemId: "apple_bite",
        preview: true,
        companionCare: nextCare,
        animation: expect.objectContaining({
          reference: "animation-a",
          itemId: "apple_bite",
        }),
      }),
    );
  });

  it("keeps the feed animation alive when parent profile care mirrors update", async () => {
    const nextCare = { ...chartCare, moodLabel: "bright" } as CompanionCareView;
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        companionCare: nextCare,
        animation: {
          kind: "normal-feed",
          reference: "animation-a",
          itemId: "apple_bite",
        },
      }),
    } as Response);

    let latest: CompanionCareContextValue | null = null;
    function Probe() {
      latest = useCompanionCare();
      return null;
    }
    function Parent() {
      const [careState, setCareState] = useState(chartCare);
      return (
        <CompanionCareProvider
          childId="child_fixture_001"
          profile={{ care_plan: { companion_care: careState } }}
          onCareChange={setCareState}
        >
          <Probe />
        </CompanionCareProvider>
      );
    }

    render(<Parent />);
    await waitFor(() => expect(latest).not.toBeNull());
    await latest!.feed("apple_bite");

    await waitFor(() => {
      expect(latest?.care).toBe(nextCare);
      expect(latest?.lastFeedAnimation?.reference).toBe("animation-a");
      expect(latest?.behavior.presentationState).toBe("feeding");
      expect(latest?.behavior.feedAnimation?.itemId).toBe("apple_bite");
    });
  });
});
