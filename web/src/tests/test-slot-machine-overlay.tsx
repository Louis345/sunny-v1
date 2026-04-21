import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SlotMachineOverlay } from "../components/SlotMachineOverlay";
import type { VRREvent } from "../../../src/shared/vrrTypes";

const sampleEvent: VRREvent = {
  tier: 1,
  triggerReason: "mastery",
  reward: {
    id: "x",
    name: "Test",
    description: "D",
    icon: "⭐",
    tier: 1,
    type: "cosmetic",
  },
};

describe("SlotMachineOverlay", () => {
  it("renders phases without exposing triggerReason to DOM", async () => {
    const { container } = render(
      <SlotMachineOverlay
        event={sampleEvent}
        companionName="Test"
        onClaim={() => {}}
      />,
    );
    expect(container.textContent).not.toContain("mastery");
    expect(await screen.findByText(/SPECIAL/i)).toBeTruthy();
  });
});
