import { afterEach, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { appendToContext } from "../utils/appendToContext";
import { runPsychologist } from "../agents/psychologist/psychologist";
import { recordSession } from "../agents/slp-recorder/recorder";

vi.mock("ai", () => ({ generateText: vi.fn().mockResolvedValue({ text: "Recorded conversation" }) }));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: vi.fn() }));
vi.mock("../agents/prompts", () => ({ readSoul: vi.fn(() => "Synthetic profile"), SLP_PROMPT: vi.fn(() => "Record supported facts") }));
vi.mock("../utils/appendToContext", () => ({ appendToContext: vi.fn() }));
vi.mock("../agents/psychologist/psychologist", () => ({ runPsychologist: vi.fn() }));
vi.mock("../utils/runtimeMode", () => ({ shouldPersistSessionData: () => true }));
afterEach(() => { vi.clearAllMocks(); });

it("leaving a quiet map makes no conversation-summary call or context write", async () => {
  await recordSession([], "Ila");
  expect(generateText).not.toHaveBeenCalled();
  expect(appendToContext).not.toHaveBeenCalled();
  expect(runPsychologist).not.toHaveBeenCalled();
});

it("still records a real conversation once through the existing path", async () => {
  await recordSession([{ role: "user", content: "Please read this question." }], "Ila");
  expect(generateText).toHaveBeenCalledTimes(1);
  expect(appendToContext).toHaveBeenCalledTimes(1);
  expect(runPsychologist).toHaveBeenCalledTimes(1);
});
