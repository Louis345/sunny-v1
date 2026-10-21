import { describe, expect, it } from "vitest";
import { TurnStateMachine } from "./session-state";

function machine() {
  const flushed: string[] = [];
  const sm = new TurnStateMachine((text) => flushed.push(text), () => {});
  return { sm, flushed };
}

async function processing(sm: TurnStateMachine) {
  sm.onStartCompanionFromIdle();
  await new Promise<void>((r) => setImmediate(r));
  expect(sm.getState()).toBe("PROCESSING");
}

describe("Elli starts speaking after her first complete sentence", () => {
  // Human catch (Ila, 2026-10-20): "it appears like Elli is not responding and
  // then bam she is speaking". Tokens were held until the entire reply was
  // written (1-2s after Claude's first word on every reply).

  it("speaks the first complete sentence while Claude is still writing the rest", async () => {
    const { sm, flushed } = machine();
    await processing(sm);
    sm.onToken("Hey Ila! ");
    expect(flushed).toEqual([]);
    sm.onToken("Good to see you. ");
    expect(flushed).toEqual(["Hey Ila! Good to see you."]);
    expect(sm.getState()).toBe("SPEAKING");
  });

  it("keeps an unfinished fragment quiet so a tool call cannot cut a sentence in half", async () => {
    const { sm, flushed } = machine();
    await processing(sm);
    sm.onToken("Let me check your");
    expect(flushed).toEqual([]);
    expect(sm.getState()).toBe("PROCESSING");
  });

  it("streams the rest of the reply and drains the tail when Claude finishes", async () => {
    const { sm, flushed } = machine();
    await processing(sm);
    sm.onToken("Hey Ila, good to see you. ");
    sm.onToken("What should we do");
    sm.onAgentComplete();
    expect(flushed).toEqual(["Hey Ila, good to see you.", "What should we do."]);
  });

  it("still waits for a canvas drawn after she started talking, then speaks the canonical problem", async () => {
    const { sm, flushed } = machine();
    await processing(sm);
    sm.onToken("Nice work on that one. ");
    sm.setCanonicalProblem("What is 7 times 8?");
    sm.onShowCanvas();
    expect(sm.getState()).toBe("CANVAS_PENDING");
    sm.onToken("Here is the next one. ");
    expect(flushed).toEqual(["Nice work on that one."]);
    sm.onCanvasDone();
    expect(flushed).toEqual(["Nice work on that one.", "Here is the next one. What is 7 times 8?"]);
    expect(sm.getState()).toBe("SPEAKING");
  });

  it("does not speak early while a game iframe holds narration", async () => {
    const { sm, flushed } = machine();
    await processing(sm);
    sm.armGameTtsHold();
    sm.onToken("Hey Ila, good to see you. ");
    expect(flushed).toEqual([]);
    expect(sm.getState()).toBe("PROCESSING");
  });

  it("returns to Word Builder after an early-spoken reply between rounds", async () => {
    const { sm } = machine();
    sm.onWordBuilderStart();
    sm.onCompanionRunFromWordBuilder();
    sm.onToken("Great spelling on that word. ");
    expect(sm.getState()).toBe("SPEAKING");
    sm.onAgentComplete();
    sm.onPlaybackComplete();
    expect(sm.getState()).toBe("WORD_BUILDER");
  });
});
