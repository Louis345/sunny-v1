import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const appTsx = join(dirname(fileURLToPath(import.meta.url)), "../App.tsx");

/**
 * CompanionLayer must stack above map canvas overlays (karaoke z-40) and hide only for iframe games.
 */
describe("App companion overlay stack", () => {
  it("wraps CompanionLayer in fixed z-55 shell and gates visibility on mapGameOverlay.active", () => {
    const src = readFileSync(appTsx, "utf8");
    expect(src).toContain("zIndex: 55");
    expect(src).toContain('position: "fixed"');
    expect(src).toContain('inset: 0');
    expect(src).toContain('visibility: mapGameOverlay.active ? "hidden" : "visible"');
  });
});
