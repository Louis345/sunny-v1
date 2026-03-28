/**
 * Contract: six-tool canvas/session surface (memory harness — no WebSocket).
 */
import { describe, it, expect } from "vitest";
import { SixToolsMemoryHarness } from "../agents/tools/six-tools-apply";

describe("six tools (harness)", () => {
  it("canvas.show text renders and returns rendered: true", async () => {
    const h = new SixToolsMemoryHarness();
    const r = await h.canvasShow({ type: "text", content: "NICKEL" });
    expect(r.rendered).toBe(true);
    expect(r.canvasShowing).toBe("text");
    expect(h.draw.mode).toBe("teaching");
    expect(h.draw.content).toBe("NICKEL");
  });

  it("canvas.show worksheet marks worksheet mode", async () => {
    const h = new SixToolsMemoryHarness();
    const r = await h.canvasShow({ type: "worksheet", problemId: "1" });
    expect(r.rendered).toBe(true);
    expect(r.canvasShowing).toBe("worksheet");
    expect(h.draw.mode).toBe("worksheet_pdf");
    expect(h.draw.activeProblemId).toBe("1");
  });

  it("canvas.show game sets game slot in harness", async () => {
    const h = new SixToolsMemoryHarness();
    const r = await h.canvasShow({ type: "game", name: "store-game" });
    expect(r.rendered).toBe(true);
    expect(r.canvasShowing).toBe("game");
    expect(h.draw.content).toBe("store-game");
  });

  it("canvas.clear returns canvasShowing idle", async () => {
    const h = new SixToolsMemoryHarness();
    await h.canvasShow({ type: "text", content: "x" });
    const r = await h.canvasClear();
    expect(r).toEqual({ canvasShowing: "idle" });
    expect(h.draw.mode).toBe("idle");
  });

  it("canvas.status returns current canvas state", async () => {
    const h = new SixToolsMemoryHarness();
    await h.canvasShow({ type: "text", content: "hi" });
    const s = await h.canvasStatus();
    expect(s.canvasShowing).toBe("teaching");
    expect(s.revision).toBeGreaterThan(0);
  });

  it("session.log records and returns logged: true", async () => {
    const h = new SixToolsMemoryHarness();
    const r = await h.sessionLog({ correct: true, childSaid: "27 cents" });
    expect(r).toEqual({ logged: true });
    expect(h.logs).toHaveLength(1);
    expect(h.logs[0]).toMatchObject({ correct: true, childSaid: "27 cents" });
  });

  it("two consecutive canvas.show — second overwrites first", async () => {
    const h = new SixToolsMemoryHarness();
    await h.canvasShow({ type: "text", content: "A" });
    await h.canvasShow({ type: "text", content: "B" });
    expect(h.draw.content).toBe("B");
    expect(h.draw.revision).toBe(2);
  });
});
