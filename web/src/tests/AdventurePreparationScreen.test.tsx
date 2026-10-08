import { fireEvent, render, screen } from "@testing-library/react";
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

  // Human-caught 2026-10-07: the failure screen repeated the same grown-up
  // instruction in three separate surfaces. The visual test previously
  // required that clutter, so the lab preserved the bug instead of catching it.
  it("keeps a provider pause calm and child-facing, then resumes only on retry", () => {
    const { a, spoken } = actor();
    a.send({ type: "PLAN_DONE", stops });
    a.send({ type: "FAILED", reason: "creator_timeout", retryable: true });
    expect(a.getSnapshot().value).toBe("help");
    expect(spoken.at(-1)).toBe("Your words are saved. Building is paused.");
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
    expect(preparationLine("help", { subject: "science", ready: 0 })).toBe("Your ideas are saved. Building is paused.");
  });
});

describe("AdventurePreparationScreen", () => {
  it("shows real elapsed build time while preparing, without implying a countdown", () => {
    render(<AdventurePreparationScreen state="build" items={[]} reviewed={[]} stops={[{ activityType: "word-radar" }]} ready={0} elapsedLabel="2 min so far" onHearItem={vi.fn()} onStop={vi.fn()} onTryAgain={vi.fn()} onBye={vi.fn()} onLetsGo={vi.fn()} />);
    expect(screen.getByText(/2 min so far/)).toBeVisible();
    expect(screen.queryByText(/remaining/i)).toBeNull();
  });
  const base: AdventurePreparationScreenProps = {
    state: "look", items, reviewed: [], stops, ready: 0,
    elapsedLabel: "1 min so far",
    onHearItem: vi.fn(), onStop: vi.fn(), onTryAgain: vi.fn(), onBye: vi.fn(), onLetsGo: vi.fn(),
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
    expect(screen.queryByTestId("ap-grownup")).toBeNull();
    expect(screen.getAllByTestId("ap-pip").filter(pip => pip.getAttribute("data-on") === "true")).toHaveLength(2);
    expect(screen.getAllByTestId("ap-map-stop").map(stop => stop.getAttribute("data-stop"))).toEqual(["ready", "ready", "building", "todo"]);
  });

  it("stays calm when slow and only offers play when enabled", () => {
    view({ state: "long", ready: 3 });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: /play with me/i })).toBeNull();
  });

  it("shows one compact saved-work status without a grown-up handoff", () => {
    const onTryAgain = vi.fn();
    view({ state: "help", ready: 2, onTryAgain });
    expect(screen.getByRole("status").textContent).toContain("Building paused");
    expect(screen.getByRole("status").textContent).toContain("Your work is saved");
    expect(screen.queryByText(/grown-up/i)).toBeNull();
    expect(screen.queryByTestId("ap-grownup-panel")).toBeNull();
    expect(screen.queryByText("Get a grown-up")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onTryAgain).toHaveBeenCalledTimes(1);
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

  it("does not render a fixed speech bubble above the companion", () => {
    view({ elliSlot: <div data-testid="real-elli" /> });
    expect(screen.queryByTestId("ap-bubble")).toBeNull();
    expect(screen.queryByRole("button", { name: /hear it again/i })).toBeNull();
    expect(screen.getByTestId("real-elli")).toBeTruthy();
  });

});

// Learning contract: the Teaching Board opens in a later session, never as same-session work.
describe("chapter end versus next-session resume", () => {
  const start = (input: Record<string, unknown>) => {
    const spoken: string[] = [];
    const a = createActor(adventurePreparationMachine.provide({ actions: { speak: ({ context }) => { spoken.push(context.line); } } }), { input: input as never });
    a.start();
    return { a, spoken };
  };

  it("ends the Discovery chapter calmly when the map finishes, without offering it now", () => {
    const { a, spoken } = start({ subject: "spelling", mode: "chapter" });
    a.send({ type: "PLAN_DONE", stops });
    a.send({ type: "ACTIVITY_READY", n: 4, total: 4 });
    expect(a.getSnapshot().value).toBe("stop");
    expect(spoken.at(-1)).toBe("Your map is ready for next time. Bye for now!");
  });

  it("resumes a still-building map next session at the building step, without replaying the review", () => {
    const { a, spoken } = start({ subject: "spelling", mode: "resume", stops, ready: 1 });
    expect(a.getSnapshot().value).toBe("build");
    expect(a.getSnapshot().context.ready).toBe(1);
    expect(spoken).toEqual(["I'm building your games. One is ready!"]);
    a.send({ type: "ACTIVITY_READY", n: 4, total: 4 });
    expect(a.getSnapshot().value).toBe("ready");
  });

  it("starts a resume with no known plan at the planning step", () => {
    const { a } = start({ subject: "spelling", mode: "resume" });
    expect(a.getSnapshot().value).toBe("plan");
  });
});
