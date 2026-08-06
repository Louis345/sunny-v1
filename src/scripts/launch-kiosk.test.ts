import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Sunny kiosk port handoff", () => {
  it("terminates only the process listening on Sunny's port", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/scripts/launch-kiosk.ts"), "utf8");

    expect(source).toContain("lsof -tiTCP:${port} -sTCP:LISTEN");
    expect(source).not.toContain("lsof -ti tcp:${port}");
  });
});
