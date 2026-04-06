import fs from "fs";
import { loadAttemptHistory } from "./attempts";
import { shouldLoadPersistedHistory } from "./runtimeMode";
import {
  resolveContextFilePath,
  resolveCurriculumFilePath,
} from "./childContextPaths";

export function loadChildFiles(childName: "Ila" | "Reina"): {
  context: string;
  curriculum: string;
  attempts: string;
} {
  const curriculum = fs.readFileSync(
    resolveCurriculumFilePath(childName),
    "utf-8",
  );
  if (!shouldLoadPersistedHistory()) {
    return {
      context: "(stateless run — persisted context not loaded)",
      curriculum,
      attempts: "(stateless run — no persisted attempt history)",
    };
  }

  const context = fs.readFileSync(resolveContextFilePath(childName), "utf-8");
  const attempts = loadAttemptHistory(childName);

  return { context, curriculum, attempts };
}
