import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const gamesDir = join(dirname(fileURLToPath(import.meta.url)), "../../public/games");

/**
 * Injection architecture has been removed — no HTML game should contain #sunny-companion.
 */
describe("HTML games sunny-companion anchor", () => {
  it("no .html file contains sunny-companion id (injection architecture deleted)", () => {
    const files = readdirSync(gamesDir).filter((f) => f.endsWith(".html"));
    expect(files.length).toBe(12);
    for (const f of files) {
      const text = readFileSync(join(gamesDir, f), "utf8");
      expect(text, `${f} still contains #sunny-companion`).not.toContain('id="sunny-companion"');
    }
  });
});
