import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Owner rule (2026-11-22): no canned pickup greeting or goodbye on a FaceTime call. The companion writes her first
 * and last words herself, from live context, in her own voice.
 */
const anthropicState = vi.hoisted(() => ({
  createCalls: [] as Array<Record<string, unknown>>,
  reply: "Mochi sat on my drawing again. Look at this paw print!",
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: async (params: Record<string, unknown>) => {
        anthropicState.createCalls.push(params);
        return { content: anthropicState.reply ? [{ type: "text", text: anthropicState.reply }] : [] };
      },
    },
  })),
}));

import { setupRoutes } from "./routes";

describe("POST /api/companions/:companionId/call-moment", () => {
  const servers: Array<{ close: () => void }> = [];
  const roots: string[] = [];
  const originalCwd = process.cwd();

  beforeEach(() => {
    anthropicState.createCalls.length = 0;
    anthropicState.reply = "Mochi sat on my drawing again. Look at this paw print!";
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-call-moment-route-"));
    roots.push(root);
    process.chdir(root);
  });

  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
    process.chdir(originalCwd);
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  async function post(body: Record<string, unknown>) {
    const app = express();
    app.use(express.json());
    setupRoutes(app);
    const server = app.listen(0);
    servers.push(server);
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/companions/elli/call-moment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  function sentPrompt(): string {
    const call = anthropicState.createCalls[0] ?? {};
    return JSON.stringify([call.system, call.messages]);
  }

  it("returns the opening the model wrote, built from her persona and live call context", async () => {
    const result = await post({ childId: "ila", moment: "opening", callSource: "game_reward", relationshipState: "earned_reward" });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true, moment: "opening", text: "Mochi sat on my drawing again. Look at this paw print!" });
    expect(anthropicState.createCalls).toHaveLength(1);
    const prompt = sentPrompt();
    expect(prompt).toContain("You are Elli");
    expect(prompt).toMatch(/call just connected/i);
  });

  it("stays silent when the model writes nothing: no stock line is put in her mouth", async () => {
    anthropicState.reply = "";
    const result = await post({ childId: "ila", moment: "opening" });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true, text: "" });
  });

  it("writes the goodbye from what was said on this call", async () => {
    anthropicState.reply = "Go save that dragon. Tell me how it ends!";
    const result = await post({
      childId: "ila",
      moment: "goodbye",
      recentLines: ["child: I'm making a dragon that sneezes glitter", "companion: A glitter dragon? Gold glitter, obviously."],
    });

    expect(result.body).toMatchObject({ ok: true, moment: "goodbye", text: "Go save that dragon. Tell me how it ends!" });
    expect(sentPrompt()).toContain("dragon that sneezes glitter");
    expect(sentPrompt()).toMatch(/hanging up/i);
  });

  // Audit 2026-11-22: the showroom's "Say Hi" / "Why pick me?" played scripted lines ("Hi! I'm Elli…", "Please pick
  // me!"). She writes them from her own persona, like the call opening.
  it("writes her showroom intro and her answer to 'why pick me' from her persona, in showroom mode", async () => {
    anthropicState.reply = "I keep a jar of riddles by my bed. Want the worst one?";
    const intro = await post({ childId: "ila", moment: "showroom_intro" });
    expect(intro.body).toMatchObject({ ok: true, moment: "showroom_intro", text: "I keep a jar of riddles by my bed. Want the worst one?" });
    expect(sentPrompt()).toContain("You are Elli");
    expect(sentPrompt()).toMatch(/showroom/i);
    expect(sentPrompt()).not.toMatch(/Please pick me|Hi! I'm Elli/);
    anthropicState.createCalls.length = 0;
    const plead = await post({ childId: "ila", moment: "showroom_plead" });
    expect(plead.body).toMatchObject({ ok: true, moment: "showroom_plead" });
    expect(sentPrompt()).toMatch(/why she should pick you/i);
  });

  it("rejects an unknown moment", async () => {
    const result = await post({ childId: "ila", moment: "pitch" });
    expect(result.status).toBe(400);
    expect(anthropicState.createCalls).toHaveLength(0);
  });
});
