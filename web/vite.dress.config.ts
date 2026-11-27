import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Builds the shared dress-up module for the 3D games (web/src/companion/sunnyDress.ts → dist/companion/sunny-dress.js).
// three and three-vrm stay external: each game's import map supplies them, so there is one three.js per page.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const external = (id: string) => id === "three" || id.startsWith("three/") || id === "@pixiv/three-vrm";

export default defineConfig({
  build: {
    outDir: path.resolve(__dirname, "dist/companion"),
    emptyOutDir: false,
    copyPublicDir: false,
    lib: { entry: path.resolve(__dirname, "src/companion/sunnyDress.ts"), formats: ["es"], fileName: () => "sunny-dress.js" },
    rollupOptions: {
      external,
      // The games map "three/addons/" (three's examples/jsm folder); the board imports it as three/examples/jsm.
      output: { paths: (id) => id.replace(/^three\/examples\/jsm\//, "three/addons/") },
    },
  },
});
