import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../engine/returnedWorkPipeline", () => ({
  listReturnedWorkAssignments: vi.fn(() => [{
    homeworkId: "hw-original",
    title: "Pashley multiplication",
    domain: "math",
    assignmentFingerprint: "original-hash",
  }]),
  createReturnedWorkDraft: vi.fn(async (input: { homeworkId: string }) => ({
    childId: "reina",
    homeworkId: input.homeworkId,
    source: { sourceId: "returned-work:one", status: "pending_confirmation" },
    items: [{ itemId: "item-1", prompt: "4 groups of 5", extractionConfidence: 0.72 }],
    requiresConfirmation: true,
  })),
  confirmReturnedWorkDraft: vi.fn(async () => ({ interpretationStatus: "pending", reason: "provider_overloaded" })),
  getAssignmentLearningReport: vi.fn(() => ({
    childId: "reina", homeworkId: "hw-original", status: "interpreted",
    assignment: { title: "Pashley multiplication", domain: "math" },
    assumptions: [], predictions: [], latestDecision: { reason: "Use delayed transfer." }, lifecycle: "awaiting_calibration",
  })),
}));

import { setupRoutes } from "./routes";
import {
  confirmReturnedWorkDraft,
  createReturnedWorkDraft,
  getAssignmentLearningReport,
  listReturnedWorkAssignments,
} from "../engine/returnedWorkPipeline";

describe("parent returned-work routes", () => {
  const servers: Array<{ close: () => void }> = [];

  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
    vi.clearAllMocks();
  });

  async function request(route: string, method = "GET", body?: unknown) {
    const app = express();
    app.use(express.json({ limit: "20mb" }));
    setupRoutes(app);
    const server = app.listen(0);
    servers.push(server);
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      method,
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  }

  it("lists canonical assignments for parent selection", async () => {
    const result = await request("/api/learning/reina/assignments");
    expect(result.status).toBe(200);
    expect(result.body.assignments).toEqual([expect.objectContaining({ homeworkId: "hw-original" })]);
    expect(listReturnedWorkAssignments).toHaveBeenCalledWith("reina");
  });

  it("extracts against the selected homework identity and confirms without blocking on interpretation", async () => {
    const extraction = await request("/api/learning/reina/assignments/hw-original/returned-work/extract", "POST", {
      filename: "marked.pdf",
      mimeType: "application/pdf",
      dataBase64: "cGRm",
    });
    expect(extraction.status).toBe(200);
    expect(createReturnedWorkDraft).toHaveBeenCalledWith(expect.objectContaining({ homeworkId: "hw-original" }));

    const confirmation = await request("/api/learning/reina/assignments/hw-original/returned-work/returned-work%3Aone/confirm", "POST", {});
    expect(confirmation.status).toBe(200);
    expect(confirmation.body).toMatchObject({ interpretationStatus: "pending", reason: "provider_overloaded" });
    expect(confirmReturnedWorkDraft).toHaveBeenCalledWith(expect.objectContaining({ sourceId: "returned-work:one" }));
  });

  it("rejects unknown child paths before they reach returned-work storage", async () => {
    const result = await request("/api/learning/unknown/assignments/hw-original/returned-work/extract", "POST", {
      filename: "marked.pdf", mimeType: "application/pdf", dataBase64: "cGRm",
    });
    expect(result.status).toBe(404);
    expect(createReturnedWorkDraft).not.toHaveBeenCalled();
  });

  it("returns the read-only report for one selected assignment", async () => {
    const result = await request("/api/learning/reina/assignments/hw-original/report");
    expect(result.status).toBe(200);
    expect(result.body.report).toMatchObject({ homeworkId: "hw-original", status: "interpreted" });
    expect(getAssignmentLearningReport).toHaveBeenCalledWith("reina", "hw-original");
  });
});
