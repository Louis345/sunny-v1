import fs from "node:fs";
import path from "node:path";
import type { Express, Request, Response } from "express";
import { WARDROBE_ASSET_PREFIX, resolveWardrobeAssetFile } from "../shared/wardrobeAssetFiles";

type WardrobeAssetOptions = { assetRoot: string; preparedUrls: readonly string[] };

/** The kiosk's defaults: the repo's git-ignored sandbox and the generated list of prepared fits. */
export function kioskWardrobeAssetOptions(repoRoot = process.cwd()): WardrobeAssetOptions {
  const assetRoot = path.join(repoRoot, ".sunny-sandbox", "wardrobe");
  try {
    const fitted = JSON.parse(fs.readFileSync(path.join(repoRoot, "web", "src", "lib", "wardrobeFitted.generated.json"), "utf8")) as { url: string }[];
    return { assetRoot, preparedUrls: fitted.map((row) => row.url) };
  } catch (error) {
    console.error(" 🎮 [wardrobe-assets] [allowlist] [failed]", error);
    return { assetRoot, preparedUrls: [] };
  }
}

/** Serves outfit files on the kiosk at the same address the development server uses (owner, 2026-11-07). */
export function setupWardrobeAssetRoute(app: Express, options: WardrobeAssetOptions = kioskWardrobeAssetOptions()): void {
  app.get(`${WARDROBE_ASSET_PREFIX}{*asset}`, (req: Request, res: Response) => {
    const file = resolveWardrobeAssetFile(req.path, options);
    if (!file) return res.status(404).end("Unknown wardrobe asset");
    fs.readFile(file, (error, bytes) => {
      if (error) {
        console.error(` 🎮 [wardrobe-assets] [serve] [missing] ${req.path} (copy the wardrobe sandbox to this machine)`);
        return res.status(404).end("Wardrobe asset missing on this machine");
      }
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Cache-Control", "no-store");
      res.end(bytes);
    });
  });
}
