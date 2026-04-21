import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { join } from "path";

describe("session-manager size budget", () => {
  it("session-manager.ts line count under 2500 (post D6a–D6e; plan target 1500)", () => {
    const p = join(__dirname, "../server/session-manager.ts");
    const n = readFileSync(p, "utf-8").split(/\r?\n/).length;
    expect(n).toBeLessThan(2500);
  });
});
