import path from "path";

export type ChildName = "Ila" | "Reina" | "creator";

export function childContextFolder(childName: ChildName): string {
  if (childName === "Ila") return "ila";
  if (childName === "Reina") return "reina";
  return "creator";
}

export function contextMarkdownBasename(childName: ChildName): string {
  if (childName === "Ila") return "ila_context.md";
  if (childName === "Reina") return "reina_context.md";
  return "creator_context.md";
}

/** Path segments under `src/`, e.g. `context/ila/ila_context.md`. */
export function contextFileSegments(childName: ChildName): string[] {
  const folder = childContextFolder(childName);
  return ["context", folder, contextMarkdownBasename(childName)];
}

export function resolveContextFilePath(childName: ChildName): string {
  return path.resolve(process.cwd(), "src", ...contextFileSegments(childName));
}

/** Relative path from `src/` (for companions loader DIR = src). */
export function contextFileRelativeFromSrc(childName: ChildName): string {
  return path.join(...contextFileSegments(childName));
}

export function probeTargetsRelativeFromSrc(childName: ChildName): string {
  return path.join("context", childContextFolder(childName), "probe_targets.md");
}

export function resolveProbeTargetsPath(childName: ChildName): string {
  return path.resolve(process.cwd(), "src", probeTargetsRelativeFromSrc(childName));
}

export function resolveTodaysPlanJsonPath(childName: ChildName): string {
  return path.resolve(
    process.cwd(),
    "src",
    "context",
    childContextFolder(childName),
    "todays_plan.json",
  );
}

/** Per-child curriculum markdown (moved from src/curriculum/*). */
export function resolveCurriculumFilePath(childName: ChildName): string {
  return path.resolve(
    process.cwd(),
    "src",
    "context",
    childContextFolder(childName),
    "curriculum.md",
  );
}

/** Path relative to `src/` for companions loader. */
export function curriculumRelativeFromSrc(childName: ChildName): string {
  return path.join("context", childContextFolder(childName), "curriculum.md");
}
