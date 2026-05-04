import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");

describe("homework preview dev mode", () => {
  it("defines sunny:homework:preview:dev in package.json", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    const script = pkg.scripts?.["sunny:homework:preview:dev"];

    expect(script).toBeTypeOf("string");
    expect(script).toContain("concurrently");
    expect(script).toContain("PORT=3001");
    expect(script).toContain("npm run dev");
    expect(script).toContain("localhost:5173");
  });

  it("proxies /api from Vite dev server to backend port 3001", () => {
    const viteConfig = fs.readFileSync(
      path.join(root, "web/vite.config.ts"),
      "utf8",
    );

    expect(viteConfig).toContain('"/api": "http://localhost:3001"');
  });

  it("proxies /ws from Vite dev server to backend websocket on port 3001", () => {
    const viteConfig = fs.readFileSync(
      path.join(root, "web/vite.config.ts"),
      "utf8",
    );

    expect(viteConfig).toContain('"/ws"');
    expect(viteConfig).toContain('target: "ws://localhost:3001"');
    expect(viteConfig).toContain("ws: true");
  });
});
