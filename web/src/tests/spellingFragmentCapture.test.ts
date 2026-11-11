import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

// G8, 2026-11-10 rating: 1-2 answers per Ila session were letters caught mid-word ("ornm" for ornament) and saved as
// misspellings. The human/rating caught it by comparing each saved wrong answer with its word: one wrong tap, not a try.
// The logs showed a normal "attempt_event recorded", because a fragment is a well-formed attempt. The lab only fed
// games that report whole words, so it never met a letter-tap game that reports the letters so far after a wrong tap.
// The contract owns what counts as her answer: letters so far are held until she answers or the word ends.
afterEach(() => { vi.restoreAllMocks(); });

function loadContract() {
  const posted: Array<Record<string, unknown>> = [];
  vi.spyOn(window.parent, "postMessage").mockImplementation(message => { posted.push(message as Record<string, unknown>); });
  const bindings = encodeURIComponent(JSON.stringify([{ itemId: "item-ornament", word: "ornament" }, { itemId: "item-charge", word: "charge" }]));
  window.history.replaceState({}, "", `/games/generated.html?childId=ila&sessionId=s1&nodeId=n1&launchToken=t1&spellingItemBindings=${bindings}`);
  delete (window as unknown as { GameBridge?: unknown }).GameBridge;
  window.eval(fs.readFileSync(path.join(process.cwd(), "public", "games", "_contract.js"), "utf8"));
  const fire = (window as unknown as { fireAttemptEvent: (attempt: unknown) => void }).fireAttemptEvent;
  const answers = () => posted.filter(message => message.type === "attempt_event")
    .map(message => message.payload as { target?: string; attemptedValue?: string; correct?: boolean; incomplete?: boolean });
  return { fire, answers, posted };
}

it("never saves the letters tapped so far as her answer when she goes on to finish the word", () => {
  const { fire, answers } = loadContract();
  fire({ domain: "spelling", target: "ornament", attemptedValue: "ornm", correct: false });
  fire({ domain: "spelling", target: "ornament", attemptedValue: "ornament", correct: true });
  expect(answers().map(row => row.attemptedValue)).toEqual(["ornament"]);
});

it("saves letters left when the word ends as an incomplete try, never a misspelling", () => {
  const { fire, answers } = loadContract();
  fire({ domain: "spelling", target: "ornament", attemptedValue: "ornm", correct: false, gaveUp: true });
  fire({ domain: "spelling", target: "charge", attemptedValue: "chae", correct: false });
  (window as unknown as { openSpellingItem: (word: string) => void }).openSpellingItem("ornament");
  const rows = answers();
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ target: "item-ornament", attemptedValue: "ornm", incomplete: true });
  expect(rows[0]).not.toHaveProperty("correct");
  expect(rows[1]).toMatchObject({ target: "item-charge", attemptedValue: "chae", incomplete: true });
  expect(rows[1]).not.toHaveProperty("correct");
});

it("keeps a whole-length misspelling and a short answer that is not her letters so far as real answers", () => {
  const { fire, answers } = loadContract();
  fire({ domain: "spelling", target: "ornament", attemptedValue: "ornamint", correct: false });
  fire({ domain: "spelling", target: "charge", attemptedValue: "chrj", correct: false });
  expect(answers().map(row => [row.attemptedValue, row.correct])).toEqual([["ornamint", false], ["chrj", false]]);
});
