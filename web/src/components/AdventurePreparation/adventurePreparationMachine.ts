import { assign, setup } from "xstate";

/**
 * The wait between Discovery and the new learning map. The screen moves only on real
 * backend events; Elli speaks one line when a state is entered (and when a stop
 * finishes while building), never on re-render.
 */
export type PreparationSubject = "spelling" | "math" | "science";
export type PreparationState = "look" | "plan" | "build" | "long" | "ready" | "help" | "stop";
export type PreparationStop = { activityType: string };

export type PreparationEvent =
  | { type: "REVIEW_STARTED"; total: number }
  | { type: "REVIEW_ITEM"; index: number }
  | { type: "REVIEW_DONE" }
  | { type: "PLAN_DONE"; stops: PreparationStop[] }
  | { type: "ACTIVITY_READY"; n: number; total: number }
  | { type: "FAILED"; reason: string; retryable: boolean }
  | { type: "SLOW" }
  | { type: "RETRY" }
  | { type: "STOP" };

/**
 * live: the design's own flow (Storybook). chapter: right after Discovery; the map
 * opens next session, so a finished map ends the chapter instead of offering play.
 * resume: next session, the map is still building; it ends on "Let's go!".
 */
export type PreparationMode = "live" | "chapter" | "resume";

export type PreparationContext = {
  subject: PreparationSubject;
  mode: PreparationMode;
  reviewTotal: number;
  reviewed: number[];
  stops: PreparationStop[];
  total: number;
  ready: number;
  failure: { reason: string; retryable: boolean } | null;
  line: string;
};

const NOUN: Record<PreparationSubject, string> = { spelling: "words", math: "answers", science: "ideas" };
const NUMBER_WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

export function preparationLine(state: PreparationState, ctx: Pick<PreparationContext, "subject" | "ready"> & Partial<Pick<PreparationContext, "total" | "mode">>): string {
  const noun = NOUN[ctx.subject];
  switch (state) {
    case "look": return `You did it! Let me look at all your ${noun}.`;
    case "plan": return "Now I'm choosing where we'll go next.";
    case "build": {
      if (ctx.ready <= 0) return "I'm building your games.";
      const count = NUMBER_WORDS[ctx.ready] ?? String(ctx.ready);
      return `I'm building your games. ${count} ${ctx.ready === 1 ? "is" : "are"} ready!`;
    }
    case "long": return "It's a big map, so I'm taking my time.";
    case "ready": return "Your map is ready. Let's go!";
    case "help": return `Your ${noun} are saved. Building is paused.`;
    case "stop": return ctx.mode === "chapter" && (ctx.total ?? 0) > 0 && ctx.ready >= (ctx.total ?? 0)
      ? "Your map is ready for next time. Bye for now!"
      : "You can go. I'll finish it for next time.";
  }
}

export const adventurePreparationMachine = setup({
  types: {
    context: {} as PreparationContext,
    events: {} as PreparationEvent,
    input: {} as { subject?: PreparationSubject; mode?: PreparationMode; stops?: PreparationStop[]; ready?: number },
  },
  actions: {
    // Provided by the screen: say the current line once (queued, never overlapping).
    speak: () => undefined,
    lookLine: assign({ line: ({ context }) => preparationLine("look", context) }),
    planLine: assign({ line: ({ context }) => preparationLine("plan", context) }),
    buildLine: assign({ line: ({ context }) => preparationLine("build", context) }),
    longLine: assign({ line: ({ context }) => preparationLine("long", context) }),
    readyLine: assign({ line: ({ context }) => preparationLine("ready", context) }),
    helpLine: assign({ line: ({ context }) => preparationLine("help", context) }),
    stopLine: assign({ line: ({ context }) => preparationLine("stop", context) }),
    // Only a higher real count moves progress; duplicates and stale counts are ignored.
    takeCount: assign(({ context, event }) =>
      event.type === "ACTIVITY_READY"
        ? { total: event.total, ready: Math.max(context.ready, Math.min(event.n, event.total)) }
        : {}),
    takeStops: assign(({ event }) => (event.type === "PLAN_DONE" ? { stops: event.stops, total: event.stops.length } : {})),
    takeReviewTotal: assign(({ event }) => (event.type === "REVIEW_STARTED" ? { reviewTotal: event.total } : {})),
    takeReviewItem: assign(({ context, event }) =>
      event.type === "REVIEW_ITEM" && !context.reviewed.includes(event.index)
        ? { reviewed: [...context.reviewed, event.index].sort((a, b) => a - b) }
        : {}),
    takeFailure: assign(({ event }) => (event.type === "FAILED" ? { failure: { reason: event.reason, retryable: event.retryable } } : {})),
    clearFailure: assign({ failure: null }),
  },
  guards: {
    isNewCount: ({ context, event }) => event.type === "ACTIVITY_READY" && event.n > context.ready && event.n < event.total,
    isFinalCount: ({ event }) => event.type === "ACTIVITY_READY" && event.total > 0 && event.n >= event.total,
    isFinalInChapter: ({ context, event }) => context.mode === "chapter" && event.type === "ACTIVITY_READY" && event.total > 0 && event.n >= event.total,
    resumesBuilding: ({ context }) => context.mode === "resume" && context.stops.length > 0,
    resumesPlanning: ({ context }) => context.mode === "resume",
  },
}).createMachine({
  id: "adventurePreparation",
  context: ({ input }) => ({
    subject: input?.subject ?? "spelling",
    mode: input?.mode ?? "live",
    reviewTotal: 0, reviewed: [], stops: input?.stops ?? [], total: input?.stops?.length ?? 0, ready: input?.ready ?? 0, failure: null, line: "",
  }),
  initial: "boot",
  on: {
    FAILED: { target: ".help", actions: "takeFailure" },
    STOP: { target: ".stop" },
  },
  states: {
    boot: {
      always: [
        { guard: "resumesBuilding", target: "build" },
        { guard: "resumesPlanning", target: "plan" },
        { target: "look" },
      ],
    },
    look: {
      entry: ["lookLine", "speak"],
      on: {
        REVIEW_STARTED: { actions: "takeReviewTotal" },
        REVIEW_ITEM: { actions: "takeReviewItem" },
        REVIEW_DONE: { target: "plan" },
        PLAN_DONE: { target: "build", actions: "takeStops" },
        ACTIVITY_READY: [
          { guard: "isFinalInChapter", target: "stop", actions: "takeCount" },
          { guard: "isFinalCount", target: "ready", actions: "takeCount" },
          { target: "build", actions: "takeCount" },
        ],
      },
    },
    plan: {
      entry: ["planLine", "speak"],
      on: {
        PLAN_DONE: { target: "build", actions: "takeStops" },
        ACTIVITY_READY: [
          { guard: "isFinalInChapter", target: "stop", actions: "takeCount" },
          { guard: "isFinalCount", target: "ready", actions: "takeCount" },
          { target: "build", actions: "takeCount" },
        ],
      },
    },
    build: {
      entry: ["buildLine", "speak"],
      on: {
        ACTIVITY_READY: [
          { guard: "isFinalInChapter", target: "stop", actions: "takeCount" },
          { guard: "isFinalCount", target: "ready", actions: "takeCount" },
          { guard: "isNewCount", actions: ["takeCount", "buildLine", "speak"] },
        ],
        SLOW: { target: "long" },
      },
    },
    long: {
      entry: ["longLine", "speak"],
      on: {
        ACTIVITY_READY: [
          { guard: "isFinalInChapter", target: "stop", actions: "takeCount" },
          { guard: "isFinalCount", target: "ready", actions: "takeCount" },
          { guard: "isNewCount", actions: "takeCount" },
        ],
      },
    },
    ready: {
      entry: ["readyLine", "speak"],
      on: { FAILED: {}, STOP: {} },
    },
    help: {
      entry: ["helpLine", "speak"],
      on: { RETRY: { target: "build", actions: "clearFailure" }, FAILED: { actions: "takeFailure" } },
    },
    stop: {
      entry: ["stopLine", "speak"],
      // The build keeps going behind the moon card; counts still update, the state stays.
      on: {
        ACTIVITY_READY: { actions: "takeCount" },
        PLAN_DONE: { actions: "takeStops" },
        FAILED: {},
        STOP: {},
      },
    },
  },
});
