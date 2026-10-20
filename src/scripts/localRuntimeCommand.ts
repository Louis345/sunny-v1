import fs from "node:fs";
import path from "node:path";

export type LocalRuntimeCommand = {
  executable: string;
  args: string[];
};

export function localTsxCommand(
  root: string,
  script: string,
  args: string[] = [],
): LocalRuntimeCommand {
  return {
    executable: process.execPath,
    args: [
      path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
      path.join(root, script),
      ...args,
    ],
  };
}

function resolveNpmCli(root: string, explicit?: string): string {
  const candidates = [
    explicit,
    process.env.npm_execpath,
    path.join(root, "node_modules", "npm", "bin", "npm-cli.js"),
    path.resolve(path.dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const resolved = candidates.find((candidate) => explicit === candidate || fs.existsSync(candidate));
  if (!resolved) {
    throw new Error("sunny_runtime_npm_cli_missing: start Sunny with npm run sunny");
  }
  return resolved;
}

export function localNpmScriptCommand(
  root: string,
  script: string,
  passthroughArgs: string[] = [],
  options: { npmCli?: string } = {},
): LocalRuntimeCommand {
  const args = [resolveNpmCli(root, options.npmCli), "run", script];
  if (passthroughArgs.length > 0) args.push("--", ...passthroughArgs);
  return { executable: process.execPath, args };
}
