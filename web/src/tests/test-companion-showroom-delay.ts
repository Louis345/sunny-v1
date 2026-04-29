import { describe, expect, it } from "vitest";
import { SHOWROOM_CARD_REVEAL_DELAY_MS } from "../components/CompanionShowroom";

describe("CompanionShowroom card reveal timing", () => {
  it("waits long enough for the meet animation to read before the card appears", () => {
    expect(SHOWROOM_CARD_REVEAL_DELAY_MS).toBeGreaterThanOrEqual(1300);
  });
});
