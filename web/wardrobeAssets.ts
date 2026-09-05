import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import type { Plugin, ViteDevServer, PreviewServer } from "vite";

const assetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.sunny-sandbox/wardrobe");
const archives: Readonly<Record<string, string>> = {
  "sleeveless-dress.xwear": "sleeveless-dress/sleeveless_dress_Free.xwear",
  "comet-hoodie.xwear": "vroid-hoodie/sunny-hoodie-neutral.xwear",
  "constellation-blazer.xwear": "vroid-blazer/sunny-blazer.xwear",
  "celtic-sweater.xwear": "celtic-sweater/Celtic_Holiday_V1_Blue.xwear",
};

export function resolveLocalWardrobeAsset(url: string): string | undefined {
  const prefix = "/__wardrobe-assets/";
  if (!url.startsWith(prefix)) return undefined;
  const name = url.slice(prefix.length);
  const relative = Object.hasOwn(archives, name) ? archives[name] : undefined;
  return relative ? path.join(assetRoot, relative) : undefined;
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
