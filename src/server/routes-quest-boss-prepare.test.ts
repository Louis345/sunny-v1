import express from "express";
import type { AddressInfo } from "net";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../engine/questBossArtifactPreparation", () => ({
  startQuestBossArtifactPreparation: vi.fn(),
  readQuestBossArtifactPreparationStatus: vi.fn(),
}));

vi.mock("../engine/generatedArtifactReview", () => ({
  recordQuestBossArtifactReview: vi.fn(),
}));

import {
  readQuestBossArtifactPreparationStatus,
  startQuestBossArtifactPreparation,
} from "../engine/questBossArtifactPreparation";
import { recordQuestBossArtifactReview } from "../engine/generatedArtifactReview";
import { setupRoutes } from "./routes";

const mockedStartPreparation = vi.mocked(startQuestBossArtifactPreparation);
const mockedReadStatus = vi.mocked(readQuestBossArtifactPreparationStatus);
const mockedRecordReview = vi.mocked(recordQuestBossArtifactReview);

describe("Quest/Boss preparation routes", () => {
  const servers: Array<{ close: () => void }> = [];

  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
    vi.clearAllMocks();
  });

  async function request(method: "GET" | "POST", route: string, body?: Record<string, unknown>) {
    const app = express();
    app.use(express.json());
    setupRoutes(app);
    const server = app.listen(0);
    servers.push(server);
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}${route}`, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: res.status,
      body: await res.json() as Record<string, unknown>,
    };
  }

  it("starts Quest/Boss artifact preparation without waiting for generation", async () => {
    mockedStartPreparation.mockReturnValue({
      ok: true,
      childId: "reina",
      jobs: [
        {
          childId: "reina",
          homeworkId: "hw-1",
          briefId: "brief-quest",
          kind: "quest",
          status: "brief_only",
        },
      ],
      running: ["reina:brief-quest"],
      briefs: [
        {
          briefId: "brief-quest",
          kind: "quest",
          status: "brief_only",
        },
      ],
    });

    const out = await request("POST", "/api/homework/quest-boss/prepare", { childId: "reina" });

    expect(out.status).toBe(202);
    expect(out.body).toMatchObject({
      ok: true,
      childId: "reina",
      jobs: [{ briefId: "brief-quest", kind: "quest" }],
    });
    expect(mockedStartPreparation).toHaveBeenCalledWith(expect.objectContaining({
      childId: "reina",
    }));
  });

  it("returns current Quest/Boss artifact preparation status", async () => {
    mockedReadStatus.mockReturnValue({
      ok: true,
      childId: "reina",
      jobs: [],
      running: [],
      briefs: [
        {
          briefId: "brief-quest",
          kind: "quest",
          status: "ready_for_review",
        },
      ],
    });

    const out = await request("GET", "/api/homework/quest-boss/status?childId=reina");

    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({
      ok: true,
      briefs: [{ briefId: "brief-quest", status: "ready_for_review" }],
    });
  });

  it("accepts demo-pashley on quest-boss prepare", async () => {
    mockedStartPreparation.mockReturnValue({
      ok: true,
      childId: "demo-pashley",
      jobs: [],
      running: [],
      briefs: [],
    });

    const out = await request("POST", "/api/homework/quest-boss/prepare", { childId: "demo-pashley" });

    expect(out.status).toBe(202);
    expect(mockedStartPreparation).toHaveBeenCalledWith(expect.objectContaining({
      childId: "demo-pashley",
    }));
  });

  it("records a human Quest/Boss artifact review decision", async () => {
    mockedRecordReview.mockReturnValue({
      schemaVersion: 1,
      artifactPath: "/tmp/quest.html",
      contentId: "content-quest",
      briefId: "brief-quest",
      decision: "approve",
      playableDisposition: "approved_ready",
      reason: "Looks engaging and records evidence.",
      reusableLessons: ["Keep the challenge timer visible."],
      reviewer: "jamal",
      reviewedAt: "2026-06-25T12:00:00.000Z",
      reviewPath: "/tmp/artifact-review.json",
    });

    const out = await request("POST", "/api/homework/quest-boss/review", {
      childId: "reina",
      artifactPath: "/tmp/quest.html",
      contentId: "content-quest",
      briefId: "brief-quest",
      decision: "approve",
      reason: "Looks engaging and records evidence.",
      reusableLessons: ["Keep the challenge timer visible."],
      reviewer: "jamal",
    });

    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({
      ok: true,
      review: {
        decision: "approve",
        playableDisposition: "approved_ready",
      },
    });
    expect(mockedRecordReview).toHaveBeenCalledWith(expect.objectContaining({
      childId: "reina",
      contentId: "content-quest",
      briefId: "brief-quest",
      decision: "approve",
    }));
  });
});
