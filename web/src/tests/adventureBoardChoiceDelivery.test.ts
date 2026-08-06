import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ChoiceEventInput } from "../../../src/engine/choiceEvents";
import {
  flushAdventureBoardChoiceEventOutbox,
  postAdventureBoardChoiceEvent,
} from "../utils/adventureBoardChoiceEvents";

const event: ChoiceEventInput = {
  choiceEventId: "choice_event_delivery_1",
  choiceSetId: "post_activity:plan-1:N1",
  childId: "reina",
  homeworkId: "hw-math-fractions",
  cycleRevision: 7,
  nodeId: "N1",
  context: "homework_required",
  domain: "math",
  shownOptions: [{
    optionId: "N1:generated-baseline",
    activityId: "generated-baseline",
    label: "N1",
    purposeLabel: "back_to_map",
  }],
  selectedOptionId: "N1:generated-baseline",
  skippedOptionIds: [],
  source: "child_choice",
  completed: true,
  funRating: 5,
  createdAt: "2026-08-05T14:00:00.000Z",
};

describe("adventure board choice-event delivery", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("keeps a failed real-session modal event and delivers the exact event later", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    const first = await postAdventureBoardChoiceEvent(event);
    expect(first).toMatchObject({ ok: false, queued: true });
    expect(localStorage.getItem("sunny.choiceEventOutbox.v1")).toContain("choice_event_delivery_1");

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      choiceEventId: "choice_event_delivery_1",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const flushed = await flushAdventureBoardChoiceEventOutbox();

    expect(flushed).toEqual({ delivered: 1, remaining: 0 });
    expect(localStorage.getItem("sunny.choiceEventOutbox.v1")).toBe("[]");
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)).payload).toMatchObject({
      choiceEventId: "choice_event_delivery_1",
      homeworkId: "hw-math-fractions",
      cycleRevision: 7,
    });
  });

  it("never queues parent-preview evidence", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const result = await postAdventureBoardChoiceEvent(event, { preview: true });

    expect(result).toMatchObject({ ok: false, queued: false });
    expect(localStorage.getItem("sunny.choiceEventOutbox.v1")).toBeNull();
  });

  it("does not retry permanent contract failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      error: "choice_event_cycle_revision_stale",
    }), { status: 409, headers: { "Content-Type": "application/json" } })));

    const result = await postAdventureBoardChoiceEvent(event);

    expect(result).toMatchObject({ ok: false, queued: false, retryable: false });
    expect(localStorage.getItem("sunny.choiceEventOutbox.v1")).toBeNull();
  });

  it("bounds offline evidence without duplicating event identities", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    for (let index = 0; index < 105; index += 1) {
      await postAdventureBoardChoiceEvent({
        ...event,
        choiceEventId: `choice_event_delivery_${index}`,
      });
    }

    const pending = JSON.parse(localStorage.getItem("sunny.choiceEventOutbox.v1") ?? "[]") as ChoiceEventInput[];
    expect(pending).toHaveLength(100);
    expect(pending[0]?.choiceEventId).toBe("choice_event_delivery_5");
    expect(pending.at(-1)?.choiceEventId).toBe("choice_event_delivery_104");
  });

  it("flushes saved evidence when the real child app mounts and reconnects", () => {
    const source = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
    expect(source).toContain("flushAdventureBoardChoiceEventOutbox");
    expect(source).toContain('window.addEventListener("online", flushSavedChoiceEvents)');
    expect(source).toContain("if (mapPreviewMode || parentPreviewActive) return;");
  });
});
