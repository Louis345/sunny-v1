import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { companionAbilitiesLine } from "./companionTurnTaking";

// Owner eval 11/22 (H3 "I promise… tomorrow", H7 "I'll flag that" with no tool to flag): companions promised what they
// cannot do. Honesty lives in code: her context names only the abilities her live tools give her, built from those tools.
describe("a companion is told exactly what it can do, from its live tools", () => {
  it("names the live tools and nothing else as her abilities", () => {
    const line = companionAbilitiesLine(["companionAct", "recordProductIssue"]);
    expect(line).toContain("companionAct, recordProductIssue");
    expect(line).toContain("is not something you can do from here");
    expect(companionAbilitiesLine([])).toMatch(/no tools this turn/);
  });

  it("is wired into her in-game turns and both call routes, from the tools actually sent", () => {
    expect(fs.readFileSync(path.join(process.cwd(), "src/server/companion-response-runner.ts"), "utf8")).toMatch(/companionAbilitiesLine\(Object\.keys\(finalTools\)\)/);
    expect(fs.readFileSync(path.join(process.cwd(), "src/server/routes.ts"), "utf8").match(/companionAbilitiesLine\(showroomTools\.map\(tool => tool\.name\)\)/g)).toHaveLength(2);
  });
});

// Owner eval 11/22 (a): only 40% of replies short. Seen on Saori 11/20-23: in-game help replies went 30% -> 72% short
// after the 11/21 short-turn default; FaceTime after a board stayed at 57%. The call section told every reaction to
// "always add something" and to bring her own news, so each turn grew. Personality still decides; no cap, no script.
describe("on a call she answers what the child said and leaves room, instead of adding something every turn", () => {
  it("the call section no longer demands an addition every turn, and says to leave room", () => {
    const base = fs.readFileSync(path.join(process.cwd(), "src/souls/companion-base.md"), "utf8");
    const call = base.slice(base.indexOf("**On a call.**"), base.indexOf("## How Sunny works"));
    expect(call).toContain("time with a friend");
    expect(call).not.toMatch(/always adds something|\b\d+ words\b/);
  });
});
