/**
 * Nov 2 human catch: Ila said "Hi, Ellie" on a teaching page and Elli started a
 * raincoat lesson, then said "Nice work" to a misspelled answer. The Oct 20
 * cleanup (96d92f65) deleted Elli's role along with her scripts, and the live
 * word context told her on every turn to teach. Logs recorded the replies but
 * nothing flagged an unrequested lesson; no lab checked that the role survived.
 *
 * Companions inherit one shared mission (companion-base.md) and add only their
 * own identity and personality, so a new character cannot drop the mission.
 */
import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { resolve } from "path";
import { buildCurrentBoardSnapshot, buildCurrentBoardSnapshotContext } from "../server/currentBoardSnapshot";

const srcDir = resolve(__dirname, "..");
const companionBase = readFileSync(resolve(srcDir, "souls/companion-base.md"), "utf8");
const companionFiles = readdirSync(resolve(srcDir, "companions")).filter((file) => file.endsWith(".md"));
const IDENTITY_SECTIONS = ["Identity", "Personality", "Openings and Closings"];

function missionSection(): string {
  const start = companionBase.indexOf("## Where you are");
  if (start < 0) return "";
  const next = companionBase.indexOf("\n## ", start + 1);
  return companionBase.slice(start, next < 0 ? undefined : next);
}

describe("companion mission inheritance", () => {
  it("keeps one shared mission every companion inherits", () => {
    const mission = missionSection();
    // 11/23: the shared part is the situation (tutoring or a call), not rules about how to behave in it.
    expect(mission).toContain("**Tutoring.**");
    expect(mission).toContain("can do it on her own, on paper, at school");
    expect(mission).toContain("**On a call.**");
    expect(companionBase).toContain("not the transcript, says whether she was right");
  });

  it.each(companionFiles)("%s holds only identity and personality, not job rules", (file) => {
    const md = readFileSync(resolve(srcDir, "companions", file), "utf8");
    const sections = [...md.matchAll(/^## (.+)$/gm)].map((match) => match[1].trim());
    expect(sections.filter((section) => !IDENTITY_SECTIONS.includes(section))).toEqual([]);
  });

  it.each(["elli.md", "matilda.md"])("assembles the mission once with %s's own personality", async (file) => {
    vi.stubEnv("ADVENTURE_MAP", "true");
    try {
      const { buildSessionPrompt } = await import("../agents/prompts");
      const prompt = await buildSessionPrompt("synthetic-prompt-probe" as never, resolve(srcDir, "companions", file),
        "Assigned spelling words", [], "homework", { carePlan: null });
      expect(prompt.split("## Where you are").length - 1).toBe(1);
      const personality = readFileSync(resolve(srcDir, "companions", file), "utf8").match(/## Personality\n\n([^\n]+)/)?.[1];
      expect(personality).toBeTruthy();
      expect(prompt).toContain(personality!);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("states the word on screen as a fact and leaves teaching to the child's request", () => {
    const snapshot = buildCurrentBoardSnapshot({ childId: "lab-child", sessionId: "mission",
      state: { game: "visual-explainer", currentWord: "raincoat", answerVisibility: "visible" } });
    const context = buildCurrentBoardSnapshotContext(snapshot);
    expect(context).toContain("raincoat");
    expect(context).not.toContain("Purpose: help the child learn this word together");
    expect(context).toContain("When the child asks for help with this word or is clearly stuck");
  });
});
