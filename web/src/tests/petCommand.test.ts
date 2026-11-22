import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { newestPetCommandAt } from "../lib/petCommand";

// 2026-11-22 owner: "Elli, bring out Sparky". The server saves the den change; the kiosk must re-read her creatures
// when the companion's pet command arrives, so the pet appears beside the companion (or leaves) at once.
describe("the kiosk acts on her companion's pet command", () => {
  it("finds the newest pet command it has not acted on", () => {
    const commands = [{ type: "emote", timestamp: 5 }, { type: "pet", timestamp: 7 }, { type: "pet", timestamp: 9 }];
    expect(newestPetCommandAt(commands, 0)).toBe(9);
    expect(newestPetCommandAt(commands, 9)).toBeNull();
  });

  it("re-reads her creatures when one arrives", () => {
    const app = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
    expect(app).toMatch(/newestPetCommandAt\(mergedCompanionCommands, handledPetCommandRef\.current\)/);
    expect(app).toMatch(/handledPetCommandRef\.current = newest;\s*refreshCreatures\(\);/);
  });
});
