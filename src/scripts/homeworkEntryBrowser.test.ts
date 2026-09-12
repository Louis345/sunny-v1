import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import { chromium } from "playwright";
import { expect, it, vi } from "vitest";

// Human-caught boundary: a valid loading/error state must never become the
// generic white companion canvas. The old source-string assertion missed that
// the replacement error panel also hid the child picker and its recovery path.
it.each(["spelling", "reading", "math"])("%s homework can select a child and recover a fatal connection error without ingestion", async (domain) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-entry-browser-"));
  const app = express();
  app.get("/api/companions", (_req, res) => res.json([{ childName: "Lab", companionName: "Elli", accentColor: "#222222", accentBg: "#ffffff" }]));
  app.get("/api/profile/:child", (_req, res) => res.json({}));
  app.get("/api/child-experience/:child", (_req, res) => res.status(404).json({ error: "no_assignment" }));
  let writes = 0;
  app.post(/.*/, (_req, res) => { writes++; res.status(503).json({ error: "test_writes_forbidden" }); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("entry_lab_address_missing");
  const ws = new WebSocketServer({ server, path: "/ws" });
  let starts = 0;
  ws.on("connection", socket => socket.on("message", data => {
    const message = JSON.parse(String(data));
    if (message.type !== "start_session") return;
    if (++starts > 10) { socket.close(); throw new Error("entry_lab_session_loop"); }
    socket.send(JSON.stringify({ type: "error", message: "Recorded voice outage", fatal: true }));
  }));
  let vite: any;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    vi.stubEnv("VITE_SUNNY_RUNTIME_CONFIG", JSON.stringify({ subject: "homework", sessionMode: "real", previewMode: "off", nodeAccess: "normal", voiceMode: "normal", childId: null, homeworkDomain: domain }));
    const viteModule = await import(pathToFileURL(path.join(process.cwd(), "web/node_modules/vite/dist/node/index.js")).href);
    vite = await viteModule.createServer({
      configFile: false,
      root: path.join(process.cwd(), "web"),
      cacheDir: path.join(root, "vite-cache"),
      esbuild: { jsx: "automatic" },
      css: { postcss: { plugins: [require(path.join(process.cwd(), "web/node_modules/tailwindcss"))({ content: [path.join(process.cwd(), "web/src/**/*.{js,ts,jsx,tsx}")] })] } },
      server: {
        host: "127.0.0.1", port: 0, fs: { allow: [process.cwd()] },
        proxy: { "/api": `http://127.0.0.1:${address.port}`, "/ws": { target: `ws://127.0.0.1:${address.port}`, ws: true } },
      },
    });
    await vite.listen();
    browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(vite.resolvedUrls.local[0]);
    const child = page.getByRole("button", { name: "Lab with Elli", exact: true });
    await child.waitFor({ state: "visible", timeout: 10000 });
    await child.click();
    await page.getByText("Recorded voice outage", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
    await child.waitFor({ state: "visible", timeout: 10000 });
    expect(starts).toBe(1);
    expect(writes).toBe(0);
    expect(errors).toEqual([]);
    const report = path.join(process.cwd(), "outputs/cross-domain-entry");
    fs.mkdirSync(report, { recursive: true });
    await page.screenshot({ path: path.join(report, `${domain}-recovery.png`) });
  } finally {
    await browser?.close();
    await vite?.close();
    ws.clients.forEach(socket => socket.terminate());
    await new Promise<void>(resolve => ws.close(() => resolve()));
    await new Promise<void>(resolve => server.close(() => resolve()));
    vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 60000);
