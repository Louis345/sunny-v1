/**
 * Contract: Session type is resolved from available inputs:
 * - Homework files present → "worksheet"
 * - Spelling words present → "spelling"
 * - Default → "freeform"
 * Session type determines tool set and canvas ownership.
 */
import { describe, it, expect } from "vitest";
import { resolveSessionType } from "../server/session-type-registry";

describe("session type resolution", () => {
  it("resolves to worksheet when homework manifest exists", () => {
    const type = resolveSessionType({
      childName: "Ila",
      hasHomeworkManifest: true,
      hasSpellingWords: false,
    });
    expect(type).toBe("worksheet");
  });

  it("resolves to spelling when spelling words exist and no homework", () => {
    const type = resolveSessionType({
      childName: "Ila",
      hasHomeworkManifest: false,
      hasSpellingWords: true,
    });
    expect(type).toBe("spelling");
  });

  it("resolves to freeform when nothing special exists", () => {
    const type = resolveSessionType({
      childName: "Reina",
      hasHomeworkManifest: false,
      hasSpellingWords: false,
    });
    expect(type).toBe("freeform");
  });

  it("homework takes priority over spelling", () => {
    const type = resolveSessionType({
      childName: "Ila",
      hasHomeworkManifest: true,
      hasSpellingWords: true,
    });
    expect(type).toBe("worksheet");
  });

  it("is child-agnostic — same inputs produce same type regardless of child", () => {
    const typeIla = resolveSessionType({ childName: "Ila", hasHomeworkManifest: true, hasSpellingWords: false });
    const typeReina = resolveSessionType({ childName: "Reina", hasHomeworkManifest: true, hasSpellingWords: false });
    expect(typeIla).toBe(typeReina);
  });
});
