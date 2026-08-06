import { describe, expect, it } from "vitest";
import { companionPickerIdentity } from "./companionPickerRows";

describe("companion picker identity", () => {
  it("uses the chart-selected companion instead of the legacy child pairing", () => {
    expect(companionPickerIdentity({
      legacyName: "Matilda",
      chartCompanionId: "elli",
      chartDisplayName: "Elli",
    })).toEqual({ companionId: "elli", companionName: "Elli" });
  });

  it("falls back to the legacy pairing when no chart identity exists", () => {
    expect(companionPickerIdentity({ legacyName: "Matilda" })).toEqual({
      companionId: "matilda",
      companionName: "Matilda",
    });
  });
});
