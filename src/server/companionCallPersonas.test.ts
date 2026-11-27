import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { buildShowroomTalkSystemPrompt } from "./companionShowroomTalk";

/**
 * Owner 2026-11-22: kids got bored because every companion sounded the same and brought nothing of her own.
 * Each companion is a person with her own life; who she is paired with and how old the child is come from the
 * child's record each session, never from her persona file.
 */
const root = process.cwd();
const companionsDir = path.join(root, "src/prompts/companions");
const companionIds = fs.readdirSync(companionsDir).filter((id) => fs.existsSync(path.join(companionsDir, id, "personality.md")));
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const CHILD_NAMES = /\b(Ila|Reina)\b/;
const HARDCODED_AGE = /\b(she is|is|turned?|aged?)\s+(eight|nine|ten|\d+)\b|\b(\d+|eight|nine)-year-old\b/i;

describe("companion call personas", () => {
  it("covers all nine companions", () => {
    expect(companionIds.sort()).toEqual(["elli", "hikari", "kefla", "matilda", "melty", "princess", "tene", "towa", "yukari"]);
  });

  it.each(companionIds)("%s is a person: her own life and how she builds on ideas", (id) => {
    const persona = read(`src/prompts/companions/${id}/personality.md`);
    expect(persona).toMatch(/^## Her life/m);
    expect(persona).toMatch(/^## When the child has an idea/m);
    expect(persona).not.toMatch(/Two sentences max/i);
  });

  it.each(companionIds)("%s names no child and no age: pairing and age come from the child's record", (id) => {
    const persona = read(`src/prompts/companions/${id}/personality.md`);
    const showroom = JSON.parse(read(`src/prompts/companions/${id}/showroom.json`)) as { personality?: string; role?: string };
    for (const text of [persona, showroom.personality ?? "", showroom.role ?? ""]) {
      expect(text).not.toMatch(CHILD_NAMES);
      expect(text).not.toMatch(HARDCODED_AGE);
    }
  });

  it("session souls and shared prompts hardcode no child age or pairing", () => {
    for (const rel of ["src/souls/companion-base.md", "src/companions/elli.md", "src/companions/matilda.md", "src/agents/translator/translator.ts", "src/agents/prompts/worksheetSessionPrompt.ts"]) {
      expect(read(rel), rel).not.toMatch(HARDCODED_AGE);
    }
    expect(read("src/companions/matilda.md")).not.toMatch(CHILD_NAMES);
  });

  it("the shared call rules reach every call prompt", () => {
    const prompt = buildShowroomTalkSystemPrompt({
      companionId: "melty",
      companionName: "Melty",
      showroomTheme: "crystal",
      personality: "Melty persona",
      mode: "video_call",
    });
    expect(prompt).toContain("**On a call.**");
    expect(prompt).toMatch(/own life/);
  });
});
