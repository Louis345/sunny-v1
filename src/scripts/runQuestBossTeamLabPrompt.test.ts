import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("Quest/Boss free-vision visual prompt", () => {
  it("keeps the human-caught distinction between excitement and visible learning mechanic", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/scripts/runQuestBossTeamLab.ts"), "utf8");

    expect(source).toContain("designer pitching a custom experience to one child");
    expect(source).toContain("premium playable game-screen mock");
    expect(source).toContain("Non-answer UI chrome is allowed");
    expect(source).toContain("domain visual mechanic");
    expect(source).toContain("A trophy, fireworks, race car, arena, or celebration is not enough");
    expect(source).toContain("spelling must look like recall changing the world");
    expect(source).toContain("empty glowing memory slots");
    expect(source).toContain("Do not show actual spelling answers, target words, or readable homework words");
    expect(source).toContain("Use invented glyphs or abstract icons instead of readable alphabet letters");
    expect(source).toContain("Human-caught invariant");
  });
});
