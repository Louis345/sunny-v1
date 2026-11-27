import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { releaseCompanionRenderer } from "../lib/releaseCompanionRenderer";

// S8 (Saori, 2026-11-14): after a long session (board, Space Invaders, call, Connect Four) Melty's call tile drew
// nothing although her model loaded (200); a restart fixed it. three's WebGLRenderer.dispose() frees buffers but keeps
// the WebGL context until garbage collection, and every showroom/portrait remount made a new one. Past the browser's
// limit (~16 live contexts) the oldest live context, a long-lived call tile, is lost and draws nothing, silently.
// Why the human caught it: a blank tile. Why logs missed it: nothing logged context loss. Why the lab missed it:
// tests mount once and mock the renderer. Rule: every companion renderer teardown releases its context.
describe("releaseCompanionRenderer", () => {
  const fakeRenderer = (withContextLoss: boolean) => {
    const parent = document.createElement("div");
    const domElement = document.createElement("canvas");
    parent.appendChild(domElement);
    return {
      domElement,
      dispose: vi.fn(),
      ...(withContextLoss ? { forceContextLoss: vi.fn() } : {}),
    };
  };

  it("removes the canvas, disposes, and releases the WebGL context of every renderer it is given", () => {
    const renderers = Array.from({ length: 20 }, () => fakeRenderer(true));
    for (const renderer of renderers) releaseCompanionRenderer(renderer as never, "test");
    for (const renderer of renderers) {
      expect(renderer.dispose).toHaveBeenCalledTimes(1);
      expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
      expect(renderer.domElement.parentNode).toBeNull();
    }
  });

  it("disposes a renderer without forceContextLoss (WebGPU) without throwing", () => {
    const renderer = fakeRenderer(false);
    expect(() => releaseCompanionRenderer(renderer as never, "test")).not.toThrow();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });

  it("the call/showroom tile and the board portrait release through it on teardown", () => {
    for (const file of ["../components/CompanionShowroom.tsx", "../components/CompanionLayer.tsx"]) {
      const source = readFileSync(resolve(__dirname, file), "utf8");
      expect(source, file).toContain("releaseCompanionRenderer(");
      expect(source, file).not.toMatch(/rendererRef\.current\.dispose\(\)/);
    }
  });
});
