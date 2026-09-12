import { describe, expect, it, vi } from "vitest";
import { reviewSpellingIntake } from "./ingestHomework";

const capture = { title: "School spelling", words: [{ word: "know", pageNumber: 1 }, { word: "write", pageNumber: 1 }], uncertainty: ["All assigned words are legible; name header was unreadable."] };

describe("spelling source confirmation", () => {
  it("shows the actual saved source and words, and accepts only explicit confirmation", async () => {
    const print = vi.fn();
    const ask = vi.fn(async (_prompt: string) => "yes");
    await expect(reviewSpellingIntake({ capture, sourceFile: "/school/spelling.pdf", interactive: true, ask, print })).resolves.toBe(true);
    const displayed = print.mock.calls.flat().join("\n");
    expect(displayed).toContain("/school/spelling.pdf");
    expect(displayed).toContain("know");
    expect(displayed).toContain("write");
    expect(displayed).toContain(capture.uncertainty[0]);
    expect(ask).toHaveBeenCalledOnce();
    expect(ask.mock.calls[0][0]).toContain("[y/N]");
  });
  it.each(["", "no", "cancel", "anything else"])("keeps %j pending without looping", async answer => {
    const ask = vi.fn(async () => answer);
    await expect(reviewSpellingIntake({ capture, sourceFile: "/school/spelling.pdf", interactive: true, ask, print: vi.fn() })).resolves.toBe(false);
    expect(ask).toHaveBeenCalledOnce();
  });
  it("never waits for or fabricates confirmation in non-interactive ingestion", async () => {
    const ask = vi.fn();
    await expect(reviewSpellingIntake({ capture, sourceFile: "/school/spelling.pdf", interactive: false, ask, print: vi.fn() })).resolves.toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });
});
