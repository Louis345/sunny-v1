import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SessionEnd } from "../components/SessionEnd";

afterEach(() => { cleanup(); vi.useRealTimers(); });
it("keeps a paused homework session closed until an explicit return", async () => {
  vi.useFakeTimers();
  const onReturn = vi.fn();
  render(<SessionEnd onReturn={onReturn} homeworkPaused autoReturnMs={null} />);
  expect(screen.getByRole("heading", { name: "Finished for now" })).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(onReturn).not.toHaveBeenCalled();
  screen.getByRole("button", { name: "Return to assignment" }).click();
  expect(onReturn).toHaveBeenCalledTimes(1);
});
