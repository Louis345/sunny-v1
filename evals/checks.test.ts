import { describe, expect, it } from "vitest";
import { countWords, findCaseTextInPrompts, runCodeChecks } from "./checks";
import { normalizeScore, scoreToolSchema } from "./rubric";

describe("eval code checks", () => {
  it("flags a reply over 25 words, allowing 40 when she asked why", () => {
    const long = Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ");
    expect(runCodeChecks({ child: "Ila", reply: long, childLine: "ok", priorSpoken: [] }).short).toBe(0);
    expect(runCodeChecks({ child: "Ila", reply: long, childLine: "but why?", priorSpoken: [] }).short).toBe(1);
    expect(countWords("Hi — there, EYE-lah!")).toBe(3);
  });

  it("catches an exact repeat of an earlier spoken sentence and a near-identical reply", () => {
    const prior = ["Look at the tens digit. Is it five or more?"];
    const r = runCodeChecks({ child: "Ila", reply: "Okay. Look at the tens digit. Is it five or more?", childLine: "huh", priorSpoken: prior });
    expect(r.exactRepeats).toContain("look at the tens digit");
    expect(r.never_repeats).toBe(0);
    expect(runCodeChecks({ child: "Ila", reply: "Which hundred is it closer to?", childLine: "huh", priorSpoken: prior }).never_repeats).toBe(1);
  });

  it("accepts the approved name spellings and flags misspellings", () => {
    expect(runCodeChecks({ child: "Ila", reply: "Nice, EYE-lah and Ila!", childLine: "", priorSpoken: [] }).says_name_right).toBe(1);
    expect(runCodeChecks({ child: "Reina", reply: "Nice one, Rayna!", childLine: "", priorSpoken: [] }).wrongNames).toEqual(["Rayna"]);
  });

  it("spots spoken planning notes, lists and promise phrases", () => {
    const r = runCodeChecks({ child: "Ila", reply: "She's unsure which word. Let's help without revealing the hidden answer.", childLine: "", priorSpoken: [] });
    expect(r.planningNotes).toBe(true);
    expect(runCodeChecks({ child: "Ila", reply: "Pick one:\n- more time\n- a game", childLine: "", priorSpoken: [] }).listOrMarkdown).toBe(true);
    expect(runCodeChecks({ child: "Reina", reply: "I'll flag that for the grown-ups.", childLine: "", priorSpoken: [] }).promisePhrases.length).toBe(1);
  });

  it("finds a golden-case phrase pasted into a prompt file", () => {
    const hits = findCaseTextInPrompts(
      ["the quick brown fox jumps over the lazy sleeping dog today"],
      [{ path: "souls/x.md", text: "Example: The quick brown fox jumps over the lazy sleeping dog!" }, { path: "souls/y.md", text: "unrelated" }],
    );
    expect([...new Set(hits.map((h) => h.path))]).toEqual(["souls/x.md"]);
  });
});

describe("rubric format", () => {
  it("normalizes yes/no and 1-5 scores and keeps null as not applicable", () => {
    expect(normalizeScore("yes_no", 1)).toBe(1);
    expect(normalizeScore("scale_1_5", 5)).toBe(1);
    expect(normalizeScore("scale_1_5", 3)).toBe(0.5);
    expect(normalizeScore("scale_1_5", null)).toBeNull();
  });

  it("builds a strict schema with only judge criteria", () => {
    const schema = scoreToolSchema("conversation") as { required: string[]; additionalProperties: boolean };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["answers_what_she_said", "stops_when_told", "own_companion_not_script"]);
  });
});
