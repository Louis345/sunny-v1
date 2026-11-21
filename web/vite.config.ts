import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { localWardrobeAssets } from "./wardrobeAssets";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiPort = process.env.SUNNY_API_PORT || "3001";
// The wardrobe lab can point the dev server at another API; the default stays this machine's port.
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? `http://localhost:${apiPort}`;

export default defineConfig({
  plugins: [react(), localWardrobeAssets()],
  server: {
    port: 5173,
    fs: {
      allow: [path.resolve(__dirname, ".."), path.resolve(__dirname, "../src")],
    },
    proxy: {
      "/api": {
        target: apiProxyTarget,
      },
      "/ws": {
        target: apiProxyTarget.replace(/^http/, "ws"),
        ws: true,
      },
    },
  },
});
