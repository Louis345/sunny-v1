import { describe, expect, it } from "vitest";
import { normalizeSessionSubject } from "../agents/prompts";
import {
  buildCanvasContextMessage,
  createSessionContext,
} from "../server/session-context";
import {
  resolveSessionType,
  sessionTypeFromSubject,
} from "../server/session-type-registry";

describe("SUNNY_SUBJECT=diag", () => {
  it("normalizeSessionSubject accepts diag", () => {
    expect(normalizeSessionSubject("diag")).toBe("diag");
    expect(normalizeSessionSubject("DIAG")).toBe("diag");
  });

  it("sessionTypeFromSubject maps diag to diag", () => {
    expect(sessionTypeFromSubject("diag")).toBe("diag");
  });

  it("resolveSessionType keeps diag even when a worksheet manifest exists", () => {
    expect(
      resolveSessionType({
        childName: "Ila",
        hasHomeworkManifest: true,
        hasSpellingWords: false,
        explicitType: "diag",
      }),
    ).toBe("diag");
  });

  it("resolveSessionType diag with creator childName", () => {
    expect(
      resolveSessionType({
        childName: "creator",
        hasHomeworkManifest: false,
        hasSpellingWords: false,
        explicitType: "diag",
      }),
    ).toBe("diag");
  });

  it("buildCanvasContextMessage for diag omits learning engine and focus words", () => {
    const ctx = createSessionContext({
      childName: "Ila",
      sessionType: "diag",
      companionName: "Charlotte",
    });
    ctx.updateCanvas({
      mode: "karaoke",
      content: "The little fox ran.",
      label: "The little fox ran",
    });
    const msg = buildCanvasContextMessage(ctx, { turnState: "IDLE" });
    expect(msg).toContain("[Diagnostic session");
    expect(msg).not.toContain("[Learning State]");
    expect(msg).not.toContain("[Today's Focus Words]");
    expect(msg).not.toContain("[Reading Profile]");
    expect(msg).toContain("Turn state (server): IDLE");
  });
});
