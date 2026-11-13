import path from "node:path";
import { defineConfig } from "vite";

const productionWebModules = "/Users/jamaltaylor/Development/sunny/web/node_modules";

export default defineConfig({
  root: path.resolve(__dirname, "../../../.."),
  resolve: {
    alias: {
      react: path.join(productionWebModules, "react"),
      "react-dom": path.join(productionWebModules, "react-dom"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 4177,
    strictPort: true,
  },
});
