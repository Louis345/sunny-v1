import express from "express";
import type { AddressInfo } from "net";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../profiles/childChart", () => ({
  getChildChart: vi.fn((childId: string) => ({ childId })),
}));

vi.mock("../profiles/childExperiencePacket", () => ({
  buildChildExperiencePacket: vi.fn((chart: { childId: string }) => ({
    childChart: { childId: chart.childId },
    activeSessionPlan: {
      planId: "assignment-plan-reina",
      adventureBoard: { boardId: "board-reina" },
    },
  })),
}));

import { setupRoutes } from "./routes";
import { getChildChart } from "../profiles/childChart";
import { buildChildExperiencePacket } from "../profiles/childExperiencePacket";

describe("GET /api/child-experience/:childId", () => {
  const servers: Array<{ close: () => void }> = [];

  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
    vi.clearAllMocks();
  });

  async function getJson(route: string) {
    const app = express();
    app.use(express.json());
    setupRoutes(app);
    const server = app.listen(0);
    servers.push(server);
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}${route}`);
    return {
      status: res.status,
      body: await res.json() as Record<string, unknown>,
    };
  }

  it("serves the chart-backed adventure board packet", async () => {
    const out = await getJson("/api/child-experience/reina");

    expect(out.status).toBe(200);
    expect(getChildChart).toHaveBeenCalledWith("reina");
    expect(buildChildExperiencePacket).toHaveBeenCalledWith({ childId: "reina" });
    expect(out.body).toMatchObject({
      childChart: { childId: "reina" },
      activeSessionPlan: {
        adventureBoard: { boardId: "board-reina" },
      },
    });
  });
});
