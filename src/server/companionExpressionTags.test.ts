import { describe, expect, it } from "vitest";
import { COMPANION_EMOTES } from "../shared/companionEmotes";
import {
  COMPANION_EXPRESSION_PROMPT,
  createExpressionTagFilter,
} from "./companionExpressionTags";

function run(chunks: string[]) {
  const emotes: string[] = [];
  const filter = createExpressionTagFilter((emote) => emotes.push(emote));
  const spoken = chunks.map((c) => filter.push(c)).join("") + filter.flush();
  return { spoken, emotes };
}

describe("companion expression tags", () => {
  it("turns a [smile] tag into a happy expression and keeps it out of Elli's speech", () => {
    // Human decision (2026-10-20): Elli's smile matters, but asking for it as a
    // tool cost a full Claude round trip before "Hey Ila!".
    expect(run(["[smile] Hey Ila!"])).toEqual({ spoken: "Hey Ila!", emotes: ["happy"] });
  });

  it("accepts every avatar emote name as a tag", () => {
    for (const emote of COMPANION_EMOTES) {
      expect(run([`[${emote}] Okay.`]).emotes).toEqual([emote]);
    }
  });

  it("maps a frown to the sad expression", () => {
    expect(run(["[frown] Oh no."]).emotes).toEqual(["sad"]);
  });

  it("handles a tag mid-sentence without leaving a double space", () => {
    expect(run(["Great job [celebrating] Ila!"])).toEqual({
      spoken: "Great job Ila!",
      emotes: ["celebrating"],
    });
  });

  it("handles a tag split across streamed chunks", () => {
    expect(run(["Hey [sm", "ile] there"])).toEqual({ spoken: "Hey there", emotes: ["happy"] });
  });

  it("leaves ordinary bracketed text alone", () => {
    expect(run(["Look at [page 3] with me."])).toEqual({
      spoken: "Look at [page 3] with me.",
      emotes: [],
    });
  });

  it("never holds back speech behind an unclosed bracket", () => {
    expect(run(["Spell it [like this, slowly, letter by letter", " now."]).spoken).toBe(
      "Spell it [like this, slowly, letter by letter now.",
    );
  });

  it("returns a partial tag at the end of the reply instead of dropping it", () => {
    expect(run(["Bye [sm"])).toEqual({ spoken: "Bye [sm", emotes: [] });
  });

  it("teaches Elli every available tag so new expressions need no prompt edit", () => {
    for (const emote of COMPANION_EMOTES) {
      expect(COMPANION_EXPRESSION_PROMPT).toContain(`[${emote}]`);
    }
    expect(COMPANION_EXPRESSION_PROMPT).toContain("[smile]");
  });
});
