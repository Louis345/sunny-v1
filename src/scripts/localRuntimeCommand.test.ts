import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  localNpmScriptCommand,
  localTsxCommand,
} from "./localRuntimeCommand";

describe("local runtime commands", () => {
  const root = "/tmp/sunny-workspace";

  it("runs TypeScript entrypoints with the current Node and workspace-local tsx", () => {
    expect(localTsxCommand(root, "src/server.ts", ["--serve-static"])).toEqual({
      executable: process.execPath,
      args: [
        path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
        path.join(root, "src", "server.ts"),
        "--serve-static",
      ],
    });
  });

  it("runs npm scripts through the current Node instead of a PATH-selected npm", () => {
    const npmCli = "/tmp/runtime/npm-cli.js";

    expect(localNpmScriptCommand(root, "build", [], { npmCli })).toEqual({
      executable: process.execPath,
      args: [npmCli, "run", "build"],
    });
  });
});
