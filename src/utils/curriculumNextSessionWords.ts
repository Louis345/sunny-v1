import fs from "fs";
import path from "path";

export function resolveCurriculumMarkdownPath(childId: string): string {
  return path.resolve(
    process.cwd(),
    "src",
    "curriculum",
    `${childId}_curriculum.md`,
  );
}

/** Parses `**Session 1 ...:** word, word` from psychologist curriculum markdown. */
export function parseNextSessionWordsFromCurriculum(markdown: string): string[] {
  const m = markdown.match(/\*\*Session\s*1[^*]*\*\*:\s*([^\n]+)/i);
  if (!m) return [];
  return m[1]
    .split(/[,;]/)
    .map((w) =>
      w
        .trim()
        .toLowerCase()
        .replace(/[^a-z-]/g, ""),
    )
    .filter((w) => w.length > 0);
}

export function readNextSessionWordsFromCurriculumFile(childId: string): string[] {
  const p = resolveCurriculumMarkdownPath(childId);
  if (!fs.existsSync(p)) return [];
  try {
    const md = fs.readFileSync(p, "utf-8");
    return parseNextSessionWordsFromCurriculum(md);
  } catch {
    return [];
  }
}
