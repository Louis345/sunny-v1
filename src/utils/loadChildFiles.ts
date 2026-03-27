import path from "path";
import fs from "fs";
import { loadAttemptHistory } from "./attempts";
import { shouldLoadPersistedHistory } from "./runtimeMode";

export function loadChildFiles(childName: "Ila" | "Reina"): {
  context: string;
  curriculum: string;
  attempts: string;
} {
  const contextFile = childName === "Ila" ? "ila_context.md" : "reina_context.md";
  const curriculumFile = childName === "Ila" ? "ila_curriculum.md" : "reina_curriculum.md";
  const curriculum = fs.readFileSync(
    path.resolve(process.cwd(), "src", "curriculum", curriculumFile),
    "utf-8",
  );
  if (!shouldLoadPersistedHistory()) {
    return {
      context: "(stateless run — persisted context not loaded)",
      curriculum,
      attempts: "(stateless run — no persisted attempt history)",
    };
  }

  const context = fs.readFileSync(
    path.resolve(process.cwd(), "src", "context", contextFile),
    "utf-8",
  );
  const attempts = loadAttemptHistory(childName);

  return { context, curriculum, attempts };
}
