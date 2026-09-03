import express from "express";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getMathGenerationStatus } = vi.hoisted(() => ({
  getMathGenerationStatus: vi.fn(),
}));

vi.mock("../engine/adaptiveMathDiscovery", () => ({
  getMathGenerationStatus,
}));

vi.mock("../shared/childRegistry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shared/childRegistry")>();
  return { ...actual, listChildProfileIds: () => ["lab-child"] };
});

import { setupRoutes } from "./routes";

describe("adaptive math generation status route", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let baseUrl = "";

  beforeEach(async () => {
    getMathGenerationStatus.mockReset();
    const app = express();
    app.use(express.json());
    setupRoutes(app);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server address missing");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("returns read-only per-node status without starting generation", async () => {
    getMathGenerationStatus.mockReturnValue({
      version: 1,
      childId: "lab-child",
      homeworkId: "hw-1",
      phase: "board_generating",
      programHash: "program",
      designHash: "design",
      startedAt: "2026-08-22T12:00:00.000Z",
      updatedAt: "2026-08-22T12:01:00.000Z",
      nodes: [
        { nodeId: "N1", status: "ready", artifactHash: "hash-1", updatedAt: "2026-08-22T12:01:00.000Z" },
        { nodeId: "N2", status: "preparing", updatedAt: "2026-08-22T12:00:00.000Z" },
      ],
    });

    const response = await fetch(`${baseUrl}/api/learning/lab-child/assignments/hw-1/generation-status`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ phase: "board_generating", nodes: [{ nodeId: "N1", status: "ready" }, { nodeId: "N2", status: "preparing" }] });
    expect(getMathGenerationStatus).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for an assignment with no generation job", async () => {
    getMathGenerationStatus.mockReturnValue(null);
    const response = await fetch(`${baseUrl}/api/learning/lab-child/assignments/missing/generation-status`);
    expect(response.status).toBe(404);
  });

  it("keeps detached worker output in the assignment checkpoint instead of discarding it", () => {
    const source = fs.readFileSync(path.join(__dirname, "routes.ts"), "utf8");
    expect(source).toContain("adaptive-generation-worker.log");
    expect(source).not.toContain('detached: true, stdio: "ignore"');
  });
});
