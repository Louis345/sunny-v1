import { describe, it, expect } from "vitest";
import { normalizeNumberWord } from "../shared/numberWords";

describe("normalizeNumberWord", () => {
  it("maps fifteen to 15", () => {
    expect(normalizeNumberWord("fifteen")).toBe("15");
  });

  it("maps one hundred and fifty to 150", () => {
    expect(normalizeNumberWord("one hundred and fifty")).toBe("150");
  });

  it("maps spoken digit chain one five zero to 150", () => {
    expect(normalizeNumberWord("one five zero")).toBe("150");
  });

  it("leaves chimpanzees unchanged", () => {
    expect(normalizeNumberWord("chimpanzees")).toBe("chimpanzees");
  });

  it("leaves are unchanged", () => {
    expect(normalizeNumberWord("are")).toBe("are");
  });
});
