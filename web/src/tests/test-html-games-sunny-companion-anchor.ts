import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const gamesDir = join(dirname(fileURLToPath(import.meta.url)), "../../public/games");

/**
 * Every shipped HTML game must expose `#sunny-companion` for CompanionBridge injection.
 */
describe("HTML games sunny-companion anchor", () => {
  it("includes exactly one sunny-companion id per .html file (12 games)", () => {
    const files = readdirSync(gamesDir).filter((f) => f.endsWith(".html"));
    expect(files.length).toBe(12);
    for (const f of files) {
      const text = readFileSync(join(gamesDir, f), "utf8");
      const matches = text.match(/id="sunny-companion"/g);
      expect(matches, f).toEqual(["id=\"sunny-companion\""]);
    }
  });
});
