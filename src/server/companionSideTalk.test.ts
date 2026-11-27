import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { buildShowroomTalkSystemPrompt, getShowroomRelationshipTools } from "./companionShowroomTalk";
import { readCompanionBaseSection } from "../companions/loader";
import { SIDE_TALK_TOOL, keepTimeOnSideTalk, sideTalkLine } from "./companionSideTalk";
import { applyCompanionRelationshipToolUses, buildCompanionCallContext } from "./companionChildFacts";
import os from "os";

// Owner 2026-11-15 (Ila's dad, live homework session): "Elli, you stole someone's dress... when I mute you, you keep
// talking." Elli answered "Haha, I didn't steal anyone's dress, that's not me!" and went straight back to the pattern.
// Why the human caught it: a friend would have taken the complaint seriously. Why logs missed it: a reply is not an
// error. Why the lab missed it: no test asks how a companion handles a complaint or a side conversation. The owner's
// rule: behavior comes from the persona, inherited from one shared base; side conversations are met for real, the
// companion keeps her own time, and finds her own way back. Code only keeps the clock; it never cuts her off.

describe("side-conversation clock (a tool every companion inherits)", () => {
  const at = (minute: number, second = 0) => new Date(Date.UTC(2026, 10, 16, 0, minute, second));

  it("keeps the time she set and shows it to her each turn, as a fact, never a command", () => {
    expect(sideTalkLine("ila:elli", at(0))).toBeUndefined();
    expect(keepTimeOnSideTalk("ila:elli", { about: "her dress", minutes: 2 }, at(0)).kept).toBe(true);
    const line = sideTalkLine("ila:elli", at(1, 40))!;
    expect(line).toContain("\"her dress\"");
    expect(line).toContain("1:40 so far");
    expect(line).toContain("you planned 2:00");
    expect(line).toMatch(/your call/i);
    expect(sideTalkLine("ila:elli", at(2, 30))).toContain("past your plan");
  });

  it("lets her extend or end it, and forgets a clock left running far past its plan", () => {
    keepTimeOnSideTalk("ila:matilda", { about: "the snow", minutes: 1 }, at(0));
    keepTimeOnSideTalk("ila:matilda", { about: "the snow", minutes: 4 }, at(1));
    expect(sideTalkLine("ila:matilda", at(2))).toContain("you planned 4:00");
    keepTimeOnSideTalk("ila:matilda", { about: "the snow", minutes: 0 }, at(3));
    expect(sideTalkLine("ila:matilda", at(3))).toBeUndefined();
    keepTimeOnSideTalk("reina:melty", { about: "a joke", minutes: 1 }, at(0));
    expect(sideTalkLine("reina:melty", at(20))).toBeUndefined();
  });

  it("keeps each child and companion apart and bounds what she sets", () => {
    keepTimeOnSideTalk("ila:elli", { about: "x".repeat(200), minutes: 99 }, at(0));
    const line = sideTalkLine("ila:elli", at(0, 5))!;
    expect(line).toContain("you planned 15:00");
    expect(line.length).toBeLessThan(260);
    expect(sideTalkLine("reina:elli", at(0, 5))).toBeUndefined();
    expect(keepTimeOnSideTalk("ila:elli", { about: "", minutes: 2 }, at(0)).kept).toBe(false);
  });
});

describe("one shared base, inherited by every companion in every room", () => {
  const section = () => readCompanionBaseSection("How Sunny works");

  it("lives in the shared base, written as judgment, not a script", () => {
    const text = section();
    expect(text).toContain(SIDE_TALK_TOOL);
    expect(text).not.toMatch(/\bsay sorry\b|\bmust say\b|\balways say\b/i);
  });

  it("reaches FaceTime calls too, not only homework sessions", () => {
    const prompt = buildShowroomTalkSystemPrompt({ companionId: "elli", companionName: "Elli", showroomTheme: "meadow", personality: "warm", mode: "video_call" });
    expect(prompt).toContain(section());
    expect(getShowroomRelationshipTools().map((tool) => tool.name)).toContain(SIDE_TALK_TOOL);
  });

  it("Elli brings a talk back in her own way instead of letting the activity pull her", () => {
    const elli = fs.readFileSync(path.resolve(__dirname, "../companions/elli.md"), "utf8");
    expect(elli).not.toContain("lets the activity pull focus back");
  });
});

describe("the clock works in both rooms", () => {
  it("a FaceTime companion sets her clock with the tool and sees it on her next turn", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-side-talk-"));
    try {
      const results = applyCompanionRelationshipToolUses({ childId: "ila", companionId: "elli",
        content: [{ type: "tool_use", id: "t1", name: SIDE_TALK_TOOL, input: { about: "her dress", minutes: 2 } }] }, { rootDir });
      expect(results).toEqual([expect.objectContaining({ tool_use_id: "t1", is_error: false })]);
      expect(buildCompanionCallContext({ childId: "ila", companionId: "elli" }, { rootDir })).toContain("Side conversation you are keeping time on: \"her dress\"");
      keepTimeOnSideTalk("ila:elli", { about: "her dress", minutes: 0 });
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("the homework session offers the same clock and shows it each turn", () => {
    const runner = fs.readFileSync(path.resolve(__dirname, "companion-response-runner.ts"), "utf8");
    expect(runner).toContain("sideTalkAiTool(sideTalkKey)");
    expect(runner).toContain("sideTalkLine(sideTalkKey)");
  });
});

