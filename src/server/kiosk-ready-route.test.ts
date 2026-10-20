import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setupRoutes } from "./routes";

const servers: Server[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("kiosk runtime acknowledgment", () => {
  it("does not report ready until the visible app acknowledges the current launch token", async () => {
    vi.stubEnv("SUNNY_KIOSK_TOKEN", "current-launch");
    vi.stubEnv("SUNNY_CERTIFICATION_RUN_ID", "cert-current");
    vi.stubEnv("SUNNY_BUILD_ID", "build-current");
    const app = express();
    app.use(express.json());
    setupRoutes(app);
    const server = app.listen(0);
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test_server_address_missing");
    const base = `http://127.0.0.1:${address.port}`;

    const before = await fetch(`${base}/api/kiosk/ready?token=current-launch`).then((response) => response.json());
    expect(before).toEqual({ ready: false, token: "current-launch" });

    const stale = await fetch(`${base}/api/kiosk/ready`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "stale-launch" }),
    });
    expect(stale.status).toBe(409);

    const accepted = await fetch(`${base}/api/kiosk/ready`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "current-launch" }),
    });
    expect(accepted.status).toBe(200);

    const after = await fetch(`${base}/api/kiosk/ready?token=current-launch`).then((response) => response.json());
    expect(after).toEqual({ ready: true, token: "current-launch" });

    const health = await fetch(`${base}/api/health`).then((response) => response.json());
    expect(health).toMatchObject({
      certificationRunId: "cert-current",
      buildId: "build-current",
      kioskReady: true,
    });
  });
});
