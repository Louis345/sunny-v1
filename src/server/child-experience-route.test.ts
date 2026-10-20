import express from "express";
import type { AddressInfo } from "net";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../profiles/childChart", () => ({
  getChildChart: vi.fn((childId: string) => ({
    childId,
    activeSessionPlan: {
      planId: `assignment-plan-${childId}`,
      activeHomeworkId: `homework-${childId}`,
      domain: "spelling",
      adventureBoard: { boardId: `board-${childId}` },
    },
    learningCycle: {
      homeworkId: `homework-${childId}`,
      domain: "spelling",
    },
  })),
}));

vi.mock("../profiles/childExperiencePacket", () => ({
  buildChildExperiencePacket: vi.fn((chart: {
    childId: string;
    activeSessionPlan?: unknown;
  }) => ({
    childChart: { childId: chart.childId },
    activeSessionPlan: chart.activeSessionPlan,
  })),
}));

vi.mock("./map-coordinator", () => {
  class MapSessionError extends Error {
    readonly statusCode: number;

    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  }

  return {
    applyNodeResult: vi.fn(),
    broadcastTestMapCompanionAct: vi.fn(),
    broadcastTestMapCompanionEmote: vi.fn(),
    broadcastTestMapCompanionEvent: vi.fn(),
    handleMapClientMessage: vi.fn(),
    MapSessionError,
    purchaseStoryMovieReward: vi.fn(),
    recordExplicitMapRating: vi.fn(),
    recordMapChoiceEvent: vi.fn(),
    startMapSession: vi.fn(async () => ({
      sessionId: "legacy-map-session",
      mapState: { nodes: [] },
    })),
    listSavedThemes: vi.fn(() => []),
  };
});

import { setupRoutes } from "./routes";
import { getChildChart } from "../profiles/childChart";
import { buildChildExperiencePacket } from "../profiles/childExperiencePacket";
import { startMapSession } from "./map-coordinator";

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

  async function postJson(route: string, body: unknown) {
    const app = express();
    app.use(express.json());
    setupRoutes(app);
    const server = app.listen(0);
    servers.push(server);
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return {
      status: res.status,
      body: await res.json() as Record<string, unknown>,
    };
  }

  it("serves the chart-backed adventure board packet", async () => {
    const out = await getJson("/api/child-experience/reina");

    expect(out.status).toBe(200);
    expect(getChildChart).toHaveBeenCalledWith("reina");
    expect(buildChildExperiencePacket).toHaveBeenCalledWith({
      childId: "reina",
      activeSessionPlan: {
        planId: "assignment-plan-reina",
        activeHomeworkId: "homework-reina",
        domain: "spelling",
        adventureBoard: { boardId: "board-reina" },
      },
      learningCycle: {
        homeworkId: "homework-reina",
        domain: "spelling",
      },
    });
    expect(out.body).toMatchObject({
      childChart: { childId: "reina" },
      activeSessionPlan: {
        adventureBoard: { boardId: "board-reina" },
      },
    });
  });

  it("rejects child experience packets that cannot render the new adventure board", async () => {
    vi.mocked(getChildChart).mockReturnValueOnce({
      childId: "reina",
      activeSessionPlan: {
        planId: "assignment-plan-reina",
      },
    } as ReturnType<typeof getChildChart>);

    const out = await getJson("/api/child-experience/reina");

    expect(out.status).toBe(409);
    expect(out.body).toMatchObject({
      error: "active_adventure_board_required",
    });
    expect(buildChildExperiencePacket).not.toHaveBeenCalled();
  });

  it("rejects a board whose assignment identity disagrees with the canonical cycle", async () => {
    vi.mocked(getChildChart).mockReturnValueOnce({
      childId: "reina",
      activeSessionPlan: {
        planId: "assignment-plan-reina",
        activeHomeworkId: "homework-stale",
        domain: "spelling",
        adventureBoard: { boardId: "board-reina" },
      },
      learningCycle: {
        homeworkId: "homework-current",
        domain: "spelling",
      },
    } as ReturnType<typeof getChildChart>);

    const out = await getJson("/api/child-experience/reina");

    expect(out.status).toBe(409);
    expect(out.body).toMatchObject({
      error: "homework_assignment_identity_mismatch",
    });
    expect(buildChildExperiencePacket).not.toHaveBeenCalled();
  });

  it("keeps a legacy reading board readable when no canonical cycle exists", async () => {
    vi.mocked(getChildChart).mockReturnValueOnce({
      childId: "reina",
      activeSessionPlan: {
        planId: "assignment-plan-reina",
        activeHomeworkId: "homework-reading-reina",
        domain: "reading",
        adventureBoard: { boardId: "board-reina" },
      },
      learningCycle: null,
    } as ReturnType<typeof getChildChart>);

    const out = await getJson("/api/child-experience/reina");

    expect(out.status).toBe(200);
    expect(buildChildExperiencePacket).toHaveBeenCalledOnce();
  });

  it("blocks /api/map/start from becoming the live homework board fallback", async () => {
    const out = await postJson("/api/map/start", {
      childId: "reina",
      runtime: { subject: "homework" },
    });

    expect(out.status).toBe(409);
    expect(out.body).toMatchObject({
      error: "adventure_board_runtime_required",
    });
    expect(startMapSession).not.toHaveBeenCalled();
  });
});
