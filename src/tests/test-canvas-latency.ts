import { describe, it, expect } from "vitest";
import { SixToolsMemoryHarness } from "../agents/tools/six-tools-apply";

describe("canvas latency (harness, local)", () => {
  it("canvas.show text confirms render < 200ms", async () => {
    const h = new SixToolsMemoryHarness();
    await h.canvasShow({ type: "text", content: "NICKEL" });
    expect(h.lastLatencyMs).not.toBeNull();
    expect(h.lastLatencyMs!).toBeLessThan(200);
  });

  it("canvas.show svg confirms render < 200ms", async () => {
    const h = new SixToolsMemoryHarness();
    const smallSvg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><circle r=\"3\"/></svg>";
    await h.canvasShow({ type: "svg", svg: smallSvg });
    expect(h.lastLatencyMs).not.toBeNull();
    expect(h.lastLatencyMs!).toBeLessThan(200);
  });

  it("canvas.show worksheet slot confirms apply < 500ms", async () => {
    const h = new SixToolsMemoryHarness();
    await h.canvasShow({ type: "worksheet", problemId: "1" });
    expect(h.lastLatencyMs).not.toBeNull();
    expect(h.lastLatencyMs!).toBeLessThan(500);
  });
});
