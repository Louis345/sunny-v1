import { expect, it, vi } from "vitest";

// 2026-11-09 owner: every session ends with a shift handoff for the Planner, for every child and companion.
// It starts from the saved packet and never blocks or throws into the session's end.
vi.mock("../utils/runtimeMode", async (load) => ({ ...(await load<typeof import("../utils/runtimeMode")>()), shouldPersistSessionData: () => persist }));
let persist = true;

it("starts the handoff for the child's saved session, with the homework she played when known", async () => {
  const { startSessionHandoff } = await import("./session-debug-recorder");
  const write = vi.fn(async () => undefined);
  startSessionHandoff({ chartChildId: "reina", debugRecorder: { sessionDir: "/logs/s1" }, spellingLaunch: { homeworkId: "hw-math-1" } }, write as never);
  startSessionHandoff({ chartChildId: "ila", debugRecorder: { sessionDir: "/logs/s2" } }, write as never);
  expect(write.mock.calls).toEqual([[{ childId: "reina", sessionDir: "/logs/s1", homeworkId: "hw-math-1" }], [{ childId: "ila", sessionDir: "/logs/s2" }]]);
  persist = false;
  startSessionHandoff({ chartChildId: "ila", debugRecorder: { sessionDir: "/logs/s3" } }, write as never);
  expect(write).toHaveBeenCalledTimes(2);
  persist = true;
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  startSessionHandoff({ chartChildId: "ila", debugRecorder: { sessionDir: "/logs/s4" } }, (async () => { throw Error("boom"); }) as never);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(error.mock.calls.flat().join(" ")).toContain("[handoff] [failed] child=ila reason=boom");
});
