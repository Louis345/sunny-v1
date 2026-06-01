import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const runbookPath = path.join(
  __dirname,
  "../../docs/companion-video-chat-product-wow-demo.md",
);

describe("companion video chat product wow demo runbook", () => {
  it("captures the repeatable demo URL, story, game beat, and trace evidence", () => {
    const runbook = fs.readFileSync(runbookPath, "utf8");

    expect(runbook).toContain("dbz-preview.html?showroomTheme=crystal&child=ila");
    expect(runbook).toContain("This is not an AI tic-tac-toe bot");
    expect(runbook).toContain("semantic moments");
    expect(runbook).toContain("child_blocked_companion");
    expect(runbook).toContain("companion_blocked_child");
    expect(runbook).toContain("Portrait / Full body");
    expect(runbook).toContain("/api/companions/video-call-traces/");
  });

  it("keeps the demo honest about authored reactions instead of canned per-game speech", () => {
    const runbook = fs.readFileSync(runbookPath, "utf8");

    expect(runbook).toContain("Games emit semantic moments");
    expect(runbook).toContain("Elli decides what to say from persona and context");
    expect(runbook).toContain("No canned response table");
    expect(runbook).toContain("Known Follow-Ups");
  });
});
