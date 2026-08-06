import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const apiPort = process.env.SUNNY_API_PORT || "3001";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: {
      allow: [path.resolve(__dirname, ".."), path.resolve(__dirname, "../src")],
    },
    proxy: {
      "/api": `http://localhost:${apiPort}`,
      "/ws": {
        target: `ws://localhost:${apiPort}`,
        ws: true,
      },
    },
  },
});
