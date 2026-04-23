import WebSocket from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/loadHomeworkFolder", () => ({
  loadHomeworkPayload: vi.fn(() =>
    Promise.resolve({
      childName: "Ila" as const,
      date: "2026-01-01",
      rawContent: "test homework body for diag",
      fileCount: 1,
      hasNotes: false,
      folderPath: "/tmp/sunny-diag-bootstrap-test",
      assetFilenames: [],
      pageAssets: [
        {
          filename: "page.png",
          mediaType: "image/png" as const,
          data: Buffer.alloc(8).toString("base64"),
        },
      ],
    }),
  ),
}));

vi.mock("../agents/classifier/classifier", () => ({
  classifyAndRoute: vi.fn(() =>
    Promise.resolve({ hasNewFiles: false, routed: [] }),
  ),
}));

vi.mock("../server/ws-tts-bridge", () => ({
  WsTtsBridge: vi.fn().mockImplementation(() => ({
    prime: vi.fn().mockResolvedValue(undefined),
  })),
}));

import * as promptModule from "../agents/prompts";
import * as psychologistModule from "../agents/psychologist/psychologist";
import { runSessionStart } from "../server/session-bootstrap";
import { SessionManager } from "../server/session-manager";

function mockWs(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    OPEN: WebSocket.OPEN,
    send: vi.fn(),
  } as unknown as WebSocket;
}

/** Harness: cold-start path used by kiosk (diag + homework folder). */
async function bootstrapSession(opts: { childId: string; subject: string }) {
  vi.stubEnv("SUNNY_MODE", "diag");
  vi.stubEnv("SUNNY_CHILD", opts.childId);
  vi.stubEnv("SUNNY_SUBJECT", opts.subject);
  delete process.env.HOMEWORK_MODE;
  delete process.env.DEMO_MODE;
  delete process.env.SUNNY_TEST_MODE;
  delete process.env.DEBUG_CLAUDE;

  const sm = new SessionManager(mockWs(), "Ila", false, { sttOnly: true });
  const connectSpy = vi
    .spyOn(
      sm as unknown as { connectDeepgram: () => Promise<void> },
      "connectDeepgram",
    )
    .mockResolvedValue(undefined);

  try {
    await runSessionStart(sm, {});
  } finally {
    connectSpy.mockRestore();
  }
}

describe("session-bootstrap diag skips psychologist pipeline", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("session-bootstrap skips psychologist extraction in diag mode", async () => {
    const extractSpy = vi.spyOn(psychologistModule, "extractHomeworkProblems");
    await bootstrapSession({ childId: "ila", subject: "diag" });
    expect(extractSpy).not.toHaveBeenCalled();
  });

  it("session-bootstrap skips buildSessionPrompt in diag mode", async () => {
    const promptSpy = vi.spyOn(promptModule, "buildSessionPrompt");
    await bootstrapSession({ childId: "ila", subject: "diag" });
    expect(promptSpy).not.toHaveBeenCalled();
  });
});
