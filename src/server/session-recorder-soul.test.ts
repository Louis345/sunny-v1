import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { appendToContext } from "../utils/appendToContext";
import { runPsychologist } from "../agents/psychologist/psychologist";
import { recordSession } from "../agents/slp-recorder/recorder";

vi.mock("ai", async original => ({ ...await original<typeof import("ai")>(), generateText: vi.fn().mockResolvedValue({ text: "Recorded conversation" }) }));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: vi.fn() }));
vi.mock("../utils/appendToContext", () => ({ appendToContext: vi.fn() }));
vi.mock("../agents/psychologist/psychologist", () => ({ runPsychologist: vi.fn() }));
vi.mock("../utils/runtimeMode", () => ({ shouldPersistSessionData: () => true }));

// E10 (BUGS.md, Oct; seen again in nine 11/07 demo-pashley lab sessions): ending a session whose child has no soul.md
// threw ENOENT inside recordSession, and the post-session chain aborted before the truth packet and learning decision.
// Why the human caught it: the lifecycle looked unfinished. Why the logs did not stop it: they printed
// "Post-session chain error" but nothing downstream said it was skipped. Why the lab missed it: the recorder test mocks
// readSoul, so no test ran the real soul read under an isolated context root.
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-recorder-soul-"));
  vi.stubEnv("SUNNY_CONTEXT_ROOT", root);
  vi.stubEnv("SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT", "true"); // a temp root only; no real child files are read
  vi.stubEnv("SUNNY_CHART_DIR", "");
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

const conversation = [{ role: "user" as const, content: "Can you read this one?" }];

it("reads the child's soul.md from the runtime context root", async () => {
  fs.mkdirSync(path.join(root, "reina"), { recursive: true });
  fs.writeFileSync(path.join(root, "reina", "soul.md"), "Runtime-root soul for the lab child.");
  await recordSession(conversation, "Reina");
  expect(vi.mocked(generateText).mock.calls[0][0].system).toContain("Runtime-root soul for the lab child.");
});

it("a missing soul.md is logged and the session is still recorded instead of aborting the chain", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  await expect(recordSession(conversation, "Reina")).resolves.toBeUndefined();
  expect(warn.mock.calls.flat().join(" ")).toContain("[session-recorder] [soul] [missing]");
  expect(generateText).toHaveBeenCalledTimes(1);
  expect(appendToContext).toHaveBeenCalledTimes(1);
  expect(runPsychologist).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});
