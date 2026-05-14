/**
 * Contract: six-tool canvas/session surface (memory harness — no WebSocket).
 */
import { describe, it, expect } from "vitest";
import { createCompanionActTool } from "../agents/tools/companionAct";
import { createSixTools } from "../agents/tools/six-tools";
import { SixToolsMemoryHarness } from "../agents/tools/six-tools-apply";

describe("six tools (harness)", () => {
  it("canvas.show text returns dispatched: true", async () => {
    const h = new SixToolsMemoryHarness();
    const r = await h.canvasShow({ type: "text", content: "NICKEL" });
    expect(r.dispatched).toBe(true);
    expect(r.canvasShowing).toBe("text");
    expect(h.draw.mode).toBe("teaching");
    expect(h.draw.content).toBe("NICKEL");
  });

  it("canvas.show worksheet marks worksheet mode", async () => {
    const h = new SixToolsMemoryHarness();
    const r = await h.canvasShow({ type: "worksheet", problemId: "1" });
    expect(r.dispatched).toBe(true);
    expect(r.canvasShowing).toBe("worksheet");
    expect(h.draw.mode).toBe("worksheet_pdf");
    expect(h.draw.activeProblemId).toBe("1");
  });

  it("canvas.show game sets game slot in harness", async () => {
    const h = new SixToolsMemoryHarness();
    const r = await h.canvasShow({ type: "game", name: "store-game" });
    expect(r.dispatched).toBe(true);
    expect(r.canvasShowing).toBe("game");
    expect(h.draw.content).toBe("store-game");
  });

  it("canvas.clear returns canvasShowing idle", async () => {
    const h = new SixToolsMemoryHarness();
    await h.canvasShow({ type: "text", content: "x" });
    const r = await h.canvasClear();
    expect(r).toEqual({ canvasShowing: "idle" });
    expect(h.draw.mode).toBe("idle");
  });

  it("canvas.status returns current canvas state", async () => {
    const h = new SixToolsMemoryHarness();
    await h.canvasShow({ type: "text", content: "hi" });
    const s = await h.canvasStatus();
    expect(s.canvasShowing).toBe("teaching");
    expect(s.revision).toBeGreaterThan(0);
  });

  it("session.log records and returns logged: true", async () => {
    const h = new SixToolsMemoryHarness();
    const r = await h.sessionLog({ correct: true, childSaid: "27 cents" });
    expect(r).toEqual({ logged: true });
    expect(h.logs).toHaveLength(1);
    expect(h.logs[0]).toMatchObject({ correct: true, childSaid: "27 cents" });
  });

  it("recordChildSignal tool executes against host with narrow adaptive signal payload", async () => {
    const h = new SixToolsMemoryHarness();
    const tools = createSixTools(h);
    const exec = tools.recordChildSignal.execute;
    expect(exec).toBeDefined();

    const out = await exec!(
      {
        childId: "reina",
        activityId: "pronunciation",
        domain: "spelling",
        signalType: "stated_preference",
        dimension: "voice",
        valence: "positive",
        confidence: 0.7,
        evidenceText: "child said she likes saying the words",
        source: "companion_micro_probe",
      },
      { toolCallId: "signal-1", messages: [] },
    );

    expect(out).toMatchObject({ ok: true, persisted: true });
    expect(h.childSignals[0]).toMatchObject({
      activityId: "pronunciation",
      dimension: "voice",
      source: "companion_micro_probe",
    });
  });

  it("recordChildSignal rejects survey-shaped vague signals before host execution", async () => {
    const h = new SixToolsMemoryHarness();
    const tools = createSixTools(h);

    await expect(
      tools.recordChildSignal.execute!(
        {
          childId: "reina",
          activityId: "pronunciation",
          domain: "spelling",
          signalType: "stated_preference",
          dimension: "chaos" as never,
          valence: "positive",
          confidence: 0.7,
          evidenceText: "child said something",
          source: "companion_micro_probe",
        },
        { toolCallId: "signal-2", messages: [] },
      ),
    ).rejects.toThrow();
    expect(h.childSignals).toHaveLength(0);
  });

  it("recordProductIssue tool executes against host with bounded complaint payload", async () => {
    const h = new SixToolsMemoryHarness();
    const tools = createSixTools(h);
    const exec = tools.recordProductIssue.execute;
    expect(exec).toBeDefined();

    const out = await exec!(
      {
        activityId: "word-radar",
        issueType: "flow_complaint",
        severity: "medium",
        childUtterance: "I only got to do that one time.",
        evidenceText: "child said Word Radar moved from missing letters to whole-word spelling too quickly",
        confidence: 0.82,
        source: "child_utterance",
      },
      { toolCallId: "issue-1", messages: [] },
    );

    expect(out).toMatchObject({ ok: true, persisted: true });
    expect(h.productIssues[0]).toMatchObject({
      activityId: "word-radar",
      issueType: "flow_complaint",
      source: "child_utterance",
    });
  });

  it("two consecutive canvas.show — second overwrites first", async () => {
    const h = new SixToolsMemoryHarness();
    await h.canvasShow({ type: "text", content: "A" });
    await h.canvasShow({ type: "text", content: "B" });
    expect(h.draw.content).toBe("B");
    expect(h.draw.revision).toBe(2);
  });

  it("expressCompanion tool executes against host", async () => {
    const h = new SixToolsMemoryHarness();
    const tools = createSixTools(h);
    const exec = tools.expressCompanion.execute;
    expect(exec).toBeDefined();
    const out = await exec!(
      { emote: "happy", intensity: 0.6 },
      { toolCallId: "t1", messages: [] },
    );
    expect(out).toMatchObject({ ok: true, emote: "happy", intensity: 0.6 });
  });

  it("companionAct tool executes against harness host", async () => {
    const h = new SixToolsMemoryHarness();
    const t = createCompanionActTool({
      companionAct: (a) => h.companionAct(a),
    });
    const exec = t.execute;
    expect(exec).toBeDefined();
    const out = await exec!(
      { type: "emote", payload: { emote: "wink", intensity: 0.7 } },
      { toolCallId: "t2", messages: [] },
    );
    expect(out).toMatchObject({
      ok: true,
      stub: true,
      type: "emote",
      payload: { emote: "wink", intensity: 0.7 },
    });
  });

  it("spinWheel tool executes against host", async () => {
    const h = new SixToolsMemoryHarness();
    const tools = createSixTools(h);
    const exec = tools.spinWheel.execute;
    expect(exec).toBeDefined();

    const out = await exec!({}, { toolCallId: "spin-1", messages: [] });

    expect(out).toMatchObject({ ok: true, action: "wheel_spin" });
  });
});
