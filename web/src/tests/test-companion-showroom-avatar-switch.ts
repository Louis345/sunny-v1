import { describe, expect, it } from "vitest";
import { slotFrameStyle } from "../components/CompanionShowroom";

describe("Companion showroom avatar switching", () => {
  it("never leaves the previous companion visible during an identity change", () => {
    const previousCompanion = slotFrameStyle("prev", {
      instantAvatarSwitch: true,
    });
    const selectedCompanion = slotFrameStyle("current", {
      instantAvatarSwitch: true,
    });

    expect(previousCompanion.opacity).toBe(0);
    expect(previousCompanion.transition).toBe("none");
    expect(selectedCompanion.opacity).toBe(1);
    expect(selectedCompanion.transition).toBe("none");
  });

  it("preserves the normal carousel animation outside an identity change", () => {
    const previousCompanion = slotFrameStyle("prev");

    expect(previousCompanion.opacity).toBe(0.4);
    expect(previousCompanion.transition).toContain("left 620ms");
  });
});
