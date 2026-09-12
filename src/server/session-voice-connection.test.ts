import { afterEach, expect, it, vi } from "vitest";
import { connectFlux, type FluxHandle } from "../deepgram-turn";
import { SessionManager } from "./session-manager";

vi.mock("../deepgram-turn", () => ({ connectFlux: vi.fn() }));
afterEach(() => { vi.clearAllMocks(); });

function harness(ending = false) {
  return Object.assign(Object.create(SessionManager.prototype), {
    isEnding: ending, fluxHandle: null, send: vi.fn(), debugRecorder: { recordError: vi.fn() },
  }) as { isEnding: boolean; fluxHandle: FluxHandle | null; connectDeepgram: () => Promise<void> };
}

it("closes a speech connection that finishes opening after the session ends", async () => {
  let finish!: (handle: FluxHandle) => void;
  vi.mocked(connectFlux).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const session = harness();
  const connecting = session.connectDeepgram();
  session.isEnding = true;
  const handle = { close: vi.fn(), sendAudio: vi.fn() };
  finish(handle);
  await connecting;
  expect(connectFlux).toHaveBeenCalledTimes(1);
  expect(handle.close).toHaveBeenCalledTimes(1);
  expect(session.fluxHandle).toBeNull();
});

it("does not open another connection for an ended session", async () => {
  await harness(true).connectDeepgram();
  expect(connectFlux).not.toHaveBeenCalled();
});

it("retains a successfully opened connection while the session is live", async () => {
  const handle = { close: vi.fn(), sendAudio: vi.fn() };
  vi.mocked(connectFlux).mockResolvedValueOnce(handle);
  const session = harness();
  await session.connectDeepgram();
  expect(connectFlux).toHaveBeenCalledTimes(1);
  expect(session.fluxHandle).toBe(handle);
  expect(handle.close).not.toHaveBeenCalled();
});
