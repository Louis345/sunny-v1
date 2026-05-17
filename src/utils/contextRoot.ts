import path from "path";

export type ContextRootOptions = {
  rootDir?: string;
  contextRoot?: string;
  env?: Partial<Record<string, string | undefined>>;
};

const PROTECTED_CHILD_IDS = new Set(["ila", "reina"]);

function normalizeChildId(childId: string): string {
  return childId.trim().toLowerCase();
}

function resolveFromCwd(value: string, cwd: string): string {
  return path.isAbsolute(value) ? value : path.resolve(cwd, value);
}

export function resolveContextRoot(opts: ContextRootOptions = {}): string {
  const env = opts.env ?? process.env;
  const cwd = opts.rootDir ?? process.cwd();
  if (opts.contextRoot?.trim()) {
    return resolveFromCwd(opts.contextRoot.trim(), cwd);
  }
  if (env.SUNNY_CONTEXT_ROOT?.trim()) {
    return resolveFromCwd(env.SUNNY_CONTEXT_ROOT.trim(), cwd);
  }
  return path.resolve(cwd, "src", "context");
}

export function isUsingEnvContextRoot(opts: ContextRootOptions = {}): boolean {
  const env = opts.env ?? process.env;
  return Boolean(!opts.contextRoot && env.SUNNY_CONTEXT_ROOT?.trim());
}

export function assertChildAllowedForContextRoot(
  childId: string,
  opts: ContextRootOptions = {},
): void {
  const env = opts.env ?? process.env;
  if (!isUsingEnvContextRoot(opts)) return;
  if (env.SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT === "true") return;
  const normalized = normalizeChildId(childId);
  if (PROTECTED_CHILD_IDS.has(normalized)) {
    throw new Error(`protected_child_context_root:${normalized}`);
  }
}

export function resolveChildContextDir(
  childId: string,
  opts: ContextRootOptions = {},
): string {
  assertChildAllowedForContextRoot(childId, opts);
  return path.join(resolveContextRoot(opts), normalizeChildId(childId));
}
