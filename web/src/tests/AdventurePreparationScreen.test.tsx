import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createActor } from "xstate";
import { AdventurePreparationScreen, type AdventurePreparationScreenProps } from "../components/AdventurePreparation/AdventurePreparationScreen";
import { adventurePreparationMachine, preparationLine } from "../components/AdventurePreparation/adventurePreparationMachine";

// Design: "Sunny · Getting your next adventure ready" (Claude Design handoff, 2026-10-04).
// The screen only moves on real events, Ila cannot rely on reading so Elli speaks each
// state's line once, and her word cards replay words without ever grading them.

const stops = [{ activityType: "spell-check" }, { activityType: "word-radar" }, { activityType: "letter-rush" }, { activityType: "visual-explainer" }];
const items = ["because", "friend", "said"].map(face => ({ face, spoken: face }));

function actor() {
  const spoken: string[] = [];
  const machine = adventurePreparationMachine.provide({ actions: { speak: ({ context }) => { spoken.push(context.line); } } });
  const a = createActor(machine, { input: { subject: "spelling" } });
  a.start();
  return { a, spoken };
}

describe("adventurePreparationMachine", () => {
  it("walks look → plan → build → ready, speaking each state's line once", () => {
    const { a, spoken } = actor();
    a.send({ type: "REVIEW_STARTED", total: 3 });
    expect(a.getSnapshot().value).toBe("look");
    a.send({ type: "REVIEW_DONE" });
    expect(a.getSnapshot().value).toBe("plan");
    a.send({ type: "PLAN_DONE", stops });
    expect(a.getSnapshot().value).toBe("build");
    a.send({ type: "ACTIVITY_READY", n: 4, total: 4 });
    expect(a.getSnapshot().value).toBe("ready");
    expect(spoken).toEqual([
      "You did it! Let me look at all your words.",
      "Now I'm choosing where we'll go next.",
      "I'm building your games.",
      "Your map is ready. Let's go!",
    ]);
  });

  it("speaks when a stop finishes, with the real count", () => {
    const { a, spoken } = actor();
    a.send({ type: "PLAN_DONE", stops });
    a.send({ type: "ACTIVITY_READY", n: 2, total: 4 });
    expect(a.getSnapshot().context.ready).toBe(2);
    expect(spoken.at(-1)).toBe("I'm building your games. Two are ready!");
  });

  it("ignores duplicate and out-of-order events instead of moving backwards", () => {
    const { a, spoken } = actor();
    a.send({ type: "REVIEW_STARTED", total: 3 });
    a.send({ type: "REVIEW_ITEM", index: 1 });
    a.send({ type: "REVIEW_ITEM", index: 1 });
    expect(a.getSnapshot().context.reviewed).toEqual([1]);
    a.send({ type: "PLAN_DONE", stops });
    a.send({ type: "ACTIVITY_READY", n: 2, total: 4 });
    const before = spoken.length;
    a.send({ type: "ACTIVITY_READY", n: 2, total: 4 });
    a.send({ type: "ACTIVITY_READY", n: 1, total: 4 });
    a.send({ type: "REVIEW_DONE" });
    expect(a.getSnapshot().value).toBe("build");
    expect(a.getSnapshot().context.ready).toBe(2);
    expect(spoken.length).toBe(before);
  });

  it("trusts a later real event even if an earlier one was missed", () => {
    const { a } = actor();
    a.send({ type: "REVIEW_STARTED", total: 3 });
    a.send({ type: "ACTIVITY_READY", n: 1, total: 4 });
    expect(a.getSnapshot().value).toBe("build");
    expect(a.getSnapshot().context.total).toBe(4);
  });

  it("goes calm when slow, and still reaches ready", () => {
    const { a, spoken } = actor();
    a.send({ type: "PLAN_DONE", stops });
    a.send({ type: "SLOW" });
    expect(a.getSnapshot().value).toBe("long");
    expect(spoken.at(-1)).toBe("It's a big map, so I'm taking my time.");
    a.send({ type: "ACTIVITY_READY", n: 4, total: 4 });
    expect(a.getSnapshot().value).toBe("ready");
  });

  it("asks for a grown-up on failure and resumes building only on retry", () => {
    const { a, spoken } = actor();
    a.send({ type: "PLAN_DONE", stops });
    a.send({ type: "FAILED", reason: "creator_timeout", retryable: true });
    expect(a.getSnapshot().value).toBe("help");
    expect(spoken.at(-1)).toBe("Your words are all saved. Can you get a grown-up?");
    a.send({ type: "ACTIVITY_READY", n: 1, total: 4 });
    expect(a.getSnapshot().value).toBe("help");
    a.send({ type: "RETRY" });
    expect(a.getSnapshot().value).toBe("build");
  });

  it("lets her stop at any time before the reveal, and stays stopped", () => {
    const { a, spoken } = actor();
    a.send({ type: "PLAN_DONE", stops });
    a.send({ type: "STOP" });
    expect(a.getSnapshot().value).toBe("stop");
    expect(spoken.at(-1)).toBe("You can go. I'll finish it for next time.");
    a.send({ type: "ACTIVITY_READY", n: 4, total: 4 });
    expect(a.getSnapshot().value).toBe("stop");
    expect(a.getSnapshot().context.ready).toBe(4);
  });

  it("does not offer stopping once the map is ready", () => {
    const { a } = actor();
    a.send({ type: "PLAN_DONE", stops: stops.slice(0, 1) });
    a.send({ type: "ACTIVITY_READY", n: 1, total: 1 });
    a.send({ type: "STOP" });
    expect(a.getSnapshot().value).toBe("ready");
  });

  it("uses the subject's own noun", () => {
    expect(preparationLine("look", { subject: "math", ready: 0 })).toBe("You did it! Let me look at all your answers.");
    expect(preparationLine("help", { subject: "science", ready: 0 })).toBe("Your ideas are all saved. Can you get a grown-up?");
  });
});

describe("AdventurePreparationScreen", () => {
  const base: AdventurePreparationScreenProps = {
    state: "look", items, reviewed: [], stops, ready: 0, line: "You did it! Let me look at all your words.",
    grownUp: { visible: true, answeredCount: 11 },
    onHearItem: vi.fn(), onHearLine: vi.fn(), onStop: vi.fn(), onTryAgain: vi.fn(), onFinishLater: vi.fn(), onBye: vi.fn(), onLetsGo: vi.fn(),
  };
  const view = (props: Partial<AdventurePreparationScreenProps> = {}) => render(<AdventurePreparationScreen {...base} {...props} />);

  it.each([["look", 0], ["plan", 1], ["build", 2], ["long", 2], ["help", 2], ["stop", 2]] as const)("puts %s on step %i of four", (state, index) => {
    view({ state });
    const steps = screen.getAllByTestId("ap-step");
    expect(steps).toHaveLength(4);
    expect(steps[index]!.getAttribute("data-step")).toBe("now");
  });

  it("marks every step done on the reveal", () => {
    view({ state: "ready", ready: 4 });
    expect(screen.getAllByTestId("ap-step").every(step => step.getAttribute("data-step") === "done")).toBe(true);
  });

  it("replays a word on tap and never marks it right or wrong", () => {
    const onHearItem = vi.fn();
    view({ onHearItem, reviewed: [0, 1] });
    fireEvent.click(screen.getByRole("button", { name: "Hear friend" }));
    expect(onHearItem).toHaveBeenCalledWith(items[1]);
    expect(screen.getByTestId("ap-cards").textContent).not.toMatch(/[✓✔✗✘★⭐]|correct|wrong|right/i);
  });

  it("shows real build progress", () => {
    view({ state: "build", ready: 2 });
    expect(screen.getByTestId("ap-grownup").textContent).toContain("2 of 4 ready");
    expect(screen.getAllByTestId("ap-pip").filter(pip => pip.getAttribute("data-on") === "true")).toHaveLength(2);
    expect(screen.getAllByTestId("ap-map-stop").map(stop => stop.getAttribute("data-stop"))).toEqual(["ready", "ready", "building", "todo"]);
  });

  it("stays calm when slow and only offers play when enabled", () => {
    view({ state: "long", ready: 3 });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: /play with me/i })).toBeNull();
  });

  it("offers play while slow when the hangout flag is on", () => {
    const onPlayWithMe = vi.fn();
    view({ state: "long", ready: 3, offerHangout: true, onPlayWithMe });
    fireEvent.click(screen.getByRole("button", { name: /play with me/i }));
    expect(onPlayWithMe).toHaveBeenCalledTimes(1);
  });

  it("tells a grown-up her work is saved, with the existing recovery choices", () => {
    const onTryAgain = vi.fn(), onFinishLater = vi.fn();
    view({ state: "help", ready: 2, onTryAgain, onFinishLater });
    expect(screen.getByText("Your work is saved")).toBeTruthy();
    expect(screen.getByTestId("ap-grownup-panel").textContent).toContain("All 11 of her Discovery answers are saved");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish later" }));
    expect(onTryAgain).toHaveBeenCalledTimes(1);
    expect(onFinishLater).toHaveBeenCalledTimes(1);
  });

  it("stops once, then says goodbye once", () => {
    const onStop = vi.fn(), onBye = vi.fn();
    const { rerender } = view({ state: "build", ready: 1, onStop });
    const stop = screen.getByRole("button", { name: /stop for now/i });
    fireEvent.click(stop); fireEvent.click(stop);
    expect(onStop).toHaveBeenCalledTimes(1);
    rerender(<AdventurePreparationScreen {...base} state="stop" ready={1} onBye={onBye} />);
    expect(screen.getByText("Ready next time")).toBeTruthy();
    const bye = screen.getByRole("button", { name: /bye for now/i });
    fireEvent.click(bye); fireEvent.click(bye);
    expect(onBye).toHaveBeenCalledTimes(1);
  });

  it("reveals the map with one Let's go", () => {
    const onLetsGo = vi.fn();
    view({ state: "ready", ready: 4, onLetsGo });
    fireEvent.click(screen.getByRole("button", { name: "Let's go!" }));
    expect(onLetsGo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /stop for now/i })).toBeNull();
  });

  it("shows Elli's line with Hear it again, and leaves her column for the real companion", () => {
    const onHearLine = vi.fn();
    view({ onHearLine, elliSlot: <div data-testid="real-elli" /> });
    const bubble = screen.getByTestId("ap-bubble");
    expect(within(bubble).getByText(base.line)).toBeTruthy();
    fireEvent.click(within(bubble).getByRole("button", { name: /hear it again/i }));
    expect(onHearLine).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("real-elli")).toBeTruthy();
  });

  it("can hide the grown-up strip", () => {
    view({ grownUp: { visible: false } });
    expect(screen.queryByTestId("ap-grownup")).toBeNull();
  });
});
