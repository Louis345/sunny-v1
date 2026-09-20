import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  CHILD_FACING_VISUAL_PROMPT,
  judgeChildFacingScreens,
  selectChildFacingJourneyScreens,
} from "./childFacingVisualGate";

const roots: string[] = [];

function fixture(): { screenshot: string; audit: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-blind-visual-"));
  roots.push(root);
  const screenshot = path.join(root, "screen.png");
  fs.writeFileSync(screenshot, Buffer.from("recorded screenshot bytes"));
  return { screenshot, audit: path.join(root, "verdict.json") };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true }));
});

it("reviews one child-frame state per question instead of diluting it with duplicate viewports", () => {
  expect(selectChildFacingJourneyScreens([
    "/tmp/journey-generation-item-01.png",
    "/tmp/journey-sunny-item-01.png",
    "/tmp/journey-generation-completion.png",
    "/tmp/journey-sunny-completion.png",
  ])).toEqual([
    "/tmp/journey-sunny-item-01.png",
    "/tmp/journey-sunny-completion.png",
  ]);
  expect(selectChildFacingJourneyScreens(["/tmp/opening.png"])).toEqual(["/tmp/opening.png"]);
});

it("shows the screenshots to an open-ended reviewer without defect-specific hints", async () => {
  const { screenshot } = fixture();
  const create = vi.fn(async (_request: unknown) => ({
    content: [{
      type: "tool_use",
      input: {
        decision: "reject",
        observations: ["A prominent shape contradicts the rest of the scene."],
      },
    }],
  }));

  const verdict = await judgeChildFacingScreens({
    screenshotPaths: [screenshot],
    client: { messages: { create } } as never,
  });

  expect(verdict.decision).toBe("reject");
  const request = create.mock.calls[0]![0] as { messages: Array<{ content: Array<{ type: string; text?: string }> }> };
  expect(request.messages[0]!.content.some(block => block.type === "image")).toBe(true);
  expect(request.messages[0]!.content.at(-1)).toEqual({ type: "text", text: CHILD_FACING_VISUAL_PROMPT });
  expect(CHILD_FACING_VISUAL_PROMPT).not.toMatch(/clock|hand|overlap|clipp|button/i);
});

it("gives the reviewer the same child and host facts used to create the experience", async () => {
  const { screenshot } = fixture();
  const create = vi.fn(async (_request: unknown) => ({
    content: [{ type: "tool_use", input: { decision: "approve", observations: [] } }],
  }));
  const reviewContext = {
    visibleDisplayName: "Ila",
    spokenTtsName: "Ayla",
    hostRuntime: {
      completion: "The host shows rating, preparation status, and exit after evaluation_complete.",
    },
  };

  await judgeChildFacingScreens({
    screenshotPaths: [screenshot],
    reviewContext,
    client: { messages: { create } } as never,
  });

  const request = create.mock.calls[0]![0] as { messages: Array<{ content: Array<{ type: string; text?: string }> }> };
  const finalPrompt = request.messages[0]!.content.at(-1)?.text ?? "";
  expect(finalPrompt).toContain(CHILD_FACING_VISUAL_PROMPT);
  expect(finalPrompt).toContain('"visibleDisplayName":"Ila"');
  expect(finalPrompt).toContain('"spokenTtsName":"Ayla"');
  expect(finalPrompt).toContain("trusted factual context");
});

it("does not reuse a verdict when the trusted review context changes", async () => {
  const { screenshot, audit } = fixture();
  const create = vi.fn(async () => ({
    content: [{ type: "tool_use", input: { decision: "approve", observations: [] } }],
  }));
  const client = { messages: { create } } as never;

  await judgeChildFacingScreens({ screenshotPaths: [screenshot], auditFile: audit, reviewContext: { visibleDisplayName: "Ila" }, client });
  await judgeChildFacingScreens({ screenshotPaths: [screenshot], auditFile: audit, reviewContext: { visibleDisplayName: "Reina" }, client });

  expect(create).toHaveBeenCalledTimes(2);
});

it("labels each gameplay state so the reviewer cannot mistake completion for question coverage", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-state-labelled-review-"));
  roots.push(root);
  const item = path.join(root, "clock-room-sunny-item-02-which-hand.png");
  const completion = path.join(root, "clock-room-sunny-completion.png");
  fs.writeFileSync(item, Buffer.from("item screenshot"));
  fs.writeFileSync(completion, Buffer.from("completion screenshot"));
  const create = vi.fn(async (_request: unknown) => ({
    content: [{ type: "tool_use", input: { decision: "approve", observations: [] } }],
  }));

  await judgeChildFacingScreens({
    screenshotPaths: [item, completion],
    client: { messages: { create } } as never,
  });

  const request = create.mock.calls[0]![0] as { messages: Array<{ content: Array<{ type: string; text?: string }> }> };
  const labels = request.messages[0]!.content
    .filter(block => block.type === "text")
    .map(block => block.text);
  expect(labels).toContain("Screen state 1/2: clock-room-sunny-item-02-which-hand.png");
  expect(labels).toContain("Screen state 2/2: clock-room-sunny-completion.png");
  expect(labels.at(-1)).toBe(CHILD_FACING_VISUAL_PROMPT);
});

it("reuses the verdict for unchanged screenshot bytes instead of paying twice", async () => {
  const { screenshot, audit } = fixture();
  const create = vi.fn(async () => ({
    content: [{ type: "tool_use", input: { decision: "approve", observations: [] } }],
  }));
  const client = { messages: { create } } as never;

  await judgeChildFacingScreens({ screenshotPaths: [screenshot], auditFile: audit, client });
  await judgeChildFacingScreens({ screenshotPaths: [screenshot], auditFile: audit, client });

  expect(create).toHaveBeenCalledTimes(1);
});

it("fails closed when no child-visible screenshot exists", async () => {
  await expect(judgeChildFacingScreens({
    screenshotPaths: ["/missing/screenshot.png"],
    client: { messages: { create: vi.fn() } } as never,
  })).rejects.toThrow("child_visual_review_screenshots_missing");
});

it("defaults to the funded OpenAI visual model without requiring Anthropic credentials", async () => {
  const { screenshot, audit } = fixture();
  vi.stubEnv("OPENAI_API_KEY", "openai-test-key");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify({
    status: "completed",
    output: [{
      type: "message",
      role: "assistant",
      content: [{
        type: "output_text",
        text: JSON.stringify({ decision: "approve", observations: [] }),
      }],
    }],
  }), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(judgeChildFacingScreens({
    screenshotPaths: [screenshot],
    auditFile: audit,
  })).resolves.toEqual({ decision: "approve", observations: [] });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe("https://api.openai.com/v1/responses");
  expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer openai-test-key");
  const request = JSON.parse(String(init?.body)) as {
    model: string;
    input: Array<{ content: Array<{ type: string; image_url?: string; text?: string }> }>;
    text: { format: { type: string; strict: boolean } };
  };
  expect(request.model).toBe("gpt-5.6");
  expect(request.input[0]!.content.some(block => block.type === "input_image" && block.image_url?.startsWith("data:image/png;base64,"))).toBe(true);
  expect(request.input[0]!.content.at(-1)).toEqual({ type: "input_text", text: CHILD_FACING_VISUAL_PROMPT });
  expect(request.text.format).toMatchObject({ type: "json_schema", strict: true });
});

it("writes an in-flight receipt before payment and refuses an automatic duplicate after uncertainty", async () => {
  const { screenshot, audit } = fixture();
  vi.stubEnv("OPENAI_API_KEY", "openai-test-key");
  let calls = 0;
  const fetchMock = vi.fn(async () => {
    calls += 1;
    expect(JSON.parse(fs.readFileSync(audit, "utf8"))).toMatchObject({ status: "in_flight" });
    throw new Error("connection_lost_after_acceptance");
  });
  vi.stubGlobal("fetch", fetchMock);

  await expect(judgeChildFacingScreens({ screenshotPaths: [screenshot], auditFile: audit }))
    .rejects.toThrow(/outcome_uncertain/);
  expect(JSON.parse(fs.readFileSync(audit, "utf8"))).toMatchObject({ status: "outcome_uncertain" });
  await expect(judgeChildFacingScreens({ screenshotPaths: [screenshot], auditFile: audit }))
    .rejects.toThrow(/outcome_uncertain/);
  expect(calls).toBe(1);
});

it("keeps an uncertain review blocked when screenshot bytes change", async () => {
  const { screenshot, audit } = fixture();
  vi.stubEnv("OPENAI_API_KEY", "openai-test-key");
  const fetchMock = vi.fn(async () => { throw new Error("connection_lost_after_acceptance"); });
  vi.stubGlobal("fetch", fetchMock);

  await expect(judgeChildFacingScreens({ screenshotPaths: [screenshot], auditFile: audit }))
    .rejects.toThrow(/outcome_uncertain/);
  fs.writeFileSync(screenshot, Buffer.from("changed screenshot bytes"));
  await expect(judgeChildFacingScreens({ screenshotPaths: [screenshot], auditFile: audit }))
    .rejects.toThrow(/outcome_uncertain/);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("does not discard a paid raw response when screenshot bytes change", async () => {
  const { screenshot, audit } = fixture();
  vi.stubEnv("OPENAI_API_KEY", "openai-test-key");
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({
    status: "completed",
    output_text: "not valid JSON",
  }), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(judgeChildFacingScreens({ screenshotPaths: [screenshot], auditFile: audit }))
    .rejects.toThrow();
  expect(JSON.parse(fs.readFileSync(audit, "utf8"))).toMatchObject({ status: "received_raw" });
  fs.writeFileSync(screenshot, Buffer.from("changed after provider response"));
  await expect(judgeChildFacingScreens({ screenshotPaths: [screenshot], auditFile: audit }))
    .rejects.toThrow(/received_raw/);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
