import { afterEach, expect, it, vi } from "vitest";

// 11/22 (seen on Saori, Ila's board 10): every S40 layout check logged "page.evaluate: ReferenceError: __name is not
// defined". Saori runs Sunny under tsx, which wraps named functions in a __name(...) helper; the probe sent into the
// headless page carried that call, and the page has no such helper. The check degraded safely, so it never ran at all.
// Why the logs caught it: [layout] [check-failed] on every build. Why the lab missed it: vitest compiles without that wrapper.
vi.mock("../shared/layoutCoverage", async (original) => {
  const actual = await original<typeof import("../shared/layoutCoverage")>();
  // The probe as tsx compiles it on Saori: a __name(...) call inside its body.
  const collectGameLayout = new Function("return function collectGameLayout(){ const helper = __name(function inner(){ return 1; }, \"inner\"); helper(); return { controls: [], covered: [] }; }")();
  return { ...actual, collectGameLayout };
});

afterEach(() => { vi.restoreAllMocks(); delete process.env.SUNNY_GAME_LAYOUT_CHECK; });

it("runs the layout probe in the page even when the compiled probe calls __name", async () => {
  process.env.SUNNY_GAME_LAYOUT_CHECK = "on";
  const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const logs = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const { gameLayoutProblems } = await import("./spellingGameBuilder");
  expect(await gameLayoutProblems("<!doctype html><html><body><button>Go</button></body></html>")).toEqual([]);
  expect(errors.mock.calls.some(call => String(call[0]).includes("[layout] [check-failed]"))).toBe(false);
  expect(logs.mock.calls.some(call => String(call[0]).includes("[layout] [checked]"))).toBe(true);
}, 60_000);
