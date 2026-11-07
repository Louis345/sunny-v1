import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import type { Plugin, ViteDevServer, PreviewServer } from "vite";
import fitted from './src/lib/wardrobeFitted.generated.json';
import { resolveWardrobeAssetFile } from '../src/shared/wardrobeAssetFiles';

const assetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.sunny-sandbox/wardrobe");
const preparedUrls = (fitted as { url: string }[]).map((record) => record.url);
/** One file map, shared with the kiosk server (src/server/wardrobeAssetRoute.ts). */
export function resolveLocalWardrobeAsset(url: string): string | undefined {
  return resolveWardrobeAssetFile(url, { assetRoot, preparedUrls });
}
// Local development/preview only. Licensed raw archives never enter dist/public.
export function localWardrobeAssets(): Plugin {
  const configure = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((request, response, next) => {
      if (!request.url?.startsWith("/__wardrobe-assets/")) return next();
      const file = resolveLocalWardrobeAsset(request.url);
      if (!file || request.method !== "GET") {
        response.statusCode = 404;
        response.end("Unknown local wardrobe asset");
        return;
      }
      readFile(file).then((bytes) => {
        response.setHeader("Content-Type", "application/octet-stream");
        response.setHeader("Cache-Control", "no-store");
        response.end(bytes);
      }).catch((error: unknown) => {
        console.error(" 🎮 [wardrobe-assets] load failed", error);
        response.statusCode = 404;
        response.end("Local wardrobe asset missing; see preparation instructions");
      });
    });
  };
  return { name: "sunny-local-wardrobe-assets", configureServer: configure, configurePreviewServer: configure };
}
