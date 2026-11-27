import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// S8 (Melty's FaceTime tile drew nothing after a long session): three's dispose() keeps the WebGL context alive, and
// past the browser's live-context limit the oldest one, a call tile, is dropped. The showroom and board portrait
// release theirs (8a93f3dd); Orb Catcher and Egg Hatch, played as rewards between calls, still only disposed.
// Why the lab missed it: no test opened a 3D game, closed it, and counted live contexts.
describe("every 3D game hands its graphics context back when it closes", () => {
  for (const file of ["OrbCatcher3D.tsx", "EggHatch3D.tsx"]) {
    it(`${file} releases its renderer instead of only disposing it`, () => {
      const source = readFileSync(resolve(__dirname, "../components", file), "utf8");
      expect(source).toContain("releaseCompanionRenderer(renderer");
      expect(source).not.toMatch(/\brenderer\.dispose\(\)/);
    });
  }
});
