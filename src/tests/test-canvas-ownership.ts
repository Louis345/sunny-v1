/**
 * Contract: When canvas.owner is "server", showCanvas tool calls from Claude
 * must be REJECTED — not forwarded to the browser.
 */
import { describe, it, expect } from "vitest";
import { createSessionContext } from "../server/session-context";

describe("canvas ownership enforcement", () => {
  it("server-owned canvas rejects companion showCanvas calls", () => {
    const ctx = createSessionContext({ childName: "Reina", sessionType: "worksheet" });
    expect(ctx.canvas.owner).toBe("server");
    expect(ctx.canvas.locked).toBe(true);

    const allowed = ctx.isToolCallAllowed("showCanvas");
    expect(allowed).toBe(false);
  });

  it("companion-owned canvas allows showCanvas calls", () => {
    const ctx = createSessionContext({ childName: "Ila", sessionType: "freeform" });
    expect(ctx.canvas.owner).toBe("companion");
    expect(ctx.canvas.locked).toBe(false);

    const allowed = ctx.isToolCallAllowed("showCanvas");
    expect(allowed).toBe(true);
  });

  it("server can update canvas state directly when it owns canvas", () => {
    const ctx = createSessionContext({ childName: "Reina", sessionType: "worksheet" });
    ctx.updateCanvas({
      mode: "teaching",
      content: "Which coin is 25 cents?",
      svg: "<svg>...</svg>",
    });
    expect(ctx.canvas.current.mode).toBe("teaching");
    expect(ctx.canvas.current.content).toBe("Which coin is 25 cents?");
  });

  it("canvas ownership is derived from session type, never hardcoded per child", () => {
    const worksheet = createSessionContext({ childName: "Ila", sessionType: "worksheet" });
    const freeform = createSessionContext({ childName: "Ila", sessionType: "freeform" });
    expect(worksheet.canvas.owner).toBe("server");
    expect(freeform.canvas.owner).toBe("companion");
  });
});
