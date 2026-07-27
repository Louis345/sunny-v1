import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setupRoutes } from "./routes";

vi.mock("../utils/learningProfileIO", () => ({
  readLearningProfile: vi.fn(() => ({ pendingHomework: { homeworkId: "hw-math-test" } })),
  writeLearningProfile: vi.fn(),
}));

describe("homework game route", () => {
  const originalCwd = process.cwd();
  const originalContextRoot = process.env.SUNNY_CONTEXT_ROOT;
  const originalAllowProtectedChild = process.env.SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT;
  const roots: string[] = [];
  const servers: Array<{ close: () => void }> = [];

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalContextRoot === undefined) delete process.env.SUNNY_CONTEXT_ROOT;
    else process.env.SUNNY_CONTEXT_ROOT = originalContextRoot;
    if (originalAllowProtectedChild === undefined) delete process.env.SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT;
    else process.env.SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT = originalAllowProtectedChild;
    for (const server of servers.splice(0)) server.close();
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it("serves the exact generated activity from its homework cycle directory", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-homework-game-"));
    roots.push(root);
    process.chdir(root);
    const game = path.join(root, "src/context/reina/homework/games/hw-math-test/gear-lock.html");
    fs.mkdirSync(path.dirname(game), { recursive: true });
    fs.writeFileSync(game, "<!doctype html><title>Gear Lock</title>", "utf8");

    const app = express();
    app.use(express.json());
    setupRoutes(app);
    const server = app.listen(0);
    servers.push(server);
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/api/homework/game/reina/hw-math-test/gear-lock.html`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("Gear Lock");
  });

  it("serves a generated activity from the configured isolated context root", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-homework-game-context-"));
    roots.push(root);
    const contextRoot = path.join(root, ".sunny-sandbox", "isolated-context");
    process.env.SUNNY_CONTEXT_ROOT = contextRoot;
    process.env.SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT = "true";
    const filename = "hw-math-test-quest.html";
    const game = path.join(contextRoot, "reina", "homework", "games", filename);
    fs.mkdirSync(path.dirname(game), { recursive: true });
    fs.writeFileSync(game, "<!doctype html><title>Adaptive Quest</title>", "utf8");

    const app = express();
    app.use(express.json());
    setupRoutes(app);
    const server = app.listen(0);
    servers.push(server);
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/api/homework/game/reina/${filename}`);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Adaptive Quest");
  });
});
