import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COMPANION_MANIFEST } from "../companion/companions.generated";

describe("Companion showroom static assets", () => {
  it("serves every manifest VRM URL from web/public", () => {
    for (const companion of COMPANION_MANIFEST) {
      const relativePath = companion.vrmUrl.replace(/^\//, "");
      const diskPath = path.join(process.cwd(), "public", relativePath);
      const bytes = fs.existsSync(diskPath) ? fs.readFileSync(diskPath) : null;
      const header = bytes ? bytes.subarray(0, 32).toString("utf8") : "";

      expect(fs.existsSync(diskPath), `${companion.id} missing ${diskPath}`).toBe(true);
      expect(bytes?.byteLength ?? 0, `${companion.id} VRM should not be a placeholder`).toBeGreaterThan(
        1024,
      );
      expect(header, `${companion.id} did not resolve to a VRM binary`).not.toContain(
        "<!doctype html>",
      );
    }
  });
});
