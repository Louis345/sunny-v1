import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
import { setupWardrobeAssetRoute } from "./wardrobeAssetRoute";

// Owner, 2026-11-07 (AI-caught before Ila's first shop visit): the kiosk server never served outfit files, so a
// dress bought with real coins could not appear on Elli. The kiosk serves the local, git-ignored wardrobe files
// at the same address the development server uses, and nothing outside its allowlist.
const servers: ReturnType<ReturnType<typeof express>["listen"]>[] = [];
afterEach(() => { servers.splice(0).forEach((server) => server.close()); vi.restoreAllMocks(); });

function setup() {
  const assetRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-wardrobe-"));
  fs.mkdirSync(path.join(assetRoot, "prepared"));
  fs.mkdirSync(path.join(assetRoot, "sleeveless-dress"));
  fs.writeFileSync(path.join(assetRoot, "prepared", "elli-sleeveless-dress-abc.json"), "{\"fit\":1}");
  fs.writeFileSync(path.join(assetRoot, "sleeveless-dress", "sleeveless_dress_Free.xwear"), "XWEAR");
  fs.writeFileSync(path.join(assetRoot, "prepared", "not-listed.json"), "{}");
  const app = express();
  setupWardrobeAssetRoute(app, { assetRoot, preparedUrls: ["/__wardrobe-assets/prepared/elli-sleeveless-dress-abc.json"] });
  const server = app.listen(0); servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base };
}

it("serves a listed prepared fit and a known garment archive as bytes", async () => {
  const { base } = setup();
  const fit = await fetch(`${base}/__wardrobe-assets/prepared/elli-sleeveless-dress-abc.json`);
  expect(fit.status).toBe(200);
  expect(fit.headers.get("content-type")).toBe("application/octet-stream");
  expect(await fit.text()).toBe("{\"fit\":1}");
  const archive = await fetch(`${base}/__wardrobe-assets/sleeveless-dress.xwear`);
  expect(await archive.text()).toBe("XWEAR");
});

it("refuses anything outside the allowlist, including path tricks", async () => {
  const { base } = setup();
  expect((await fetch(`${base}/__wardrobe-assets/prepared/not-listed.json`)).status).toBe(404);
  expect((await fetch(`${base}/__wardrobe-assets/..%2F..%2Fetc%2Fpasswd`)).status).toBe(404);
  expect((await fetch(`${base}/__wardrobe-assets/unknown.xwear`)).status).toBe(404);
});

it("logs and answers 404 when a listed file is missing on this machine", async () => {
  const { base } = setup();
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  expect((await fetch(`${base}/__wardrobe-assets/comet-hoodie.xwear`)).status).toBe(404);
  expect(error).toHaveBeenCalledWith(expect.stringContaining("[wardrobe-assets] [serve] [missing]"));
});
