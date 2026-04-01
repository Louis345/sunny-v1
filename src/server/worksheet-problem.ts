/**
 * Logistics-only worksheet problems for vision-based grading.
 * No server-side answer classification — Claude grades from the pinned image.
 */

export interface CanonicalWorksheetProblem {
  id: number;
  question: string;
  hint: string;
  page: number;
  linkedGames: string[];
}

/**
 * Validate that an extraction problem has the minimum required fields.
 * No classification or amount validation — presence checks only.
 */
export function validateProblem(
  raw: unknown,
):
  | { ok: true; problem: CanonicalWorksheetProblem }
  | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "not an object" };
  }
  const p = raw as Record<string, unknown>;
  const idRaw = p.id;
  const id =
    typeof idRaw === "number"
      ? idRaw
      : typeof idRaw === "string" && /^\d+$/.test(idRaw.trim())
        ? Number(idRaw)
        : NaN;
  if (!Number.isFinite(id)) {
    return { ok: false, reason: "missing or invalid id" };
  }
  const question = typeof p.question === "string" ? p.question.trim() : "";
  if (!question) {
    return { ok: false, reason: "missing question" };
  }
  const hint = typeof p.hint === "string" ? p.hint : "";
  const page =
    typeof p.page === "number" && p.page >= 1 ? Math.floor(p.page) : 1;
  const linkedGames = Array.isArray(p.linkedGames)
    ? p.linkedGames.map((x) => String(x))
    : [];
  return {
    ok: true,
    problem: { id, question, hint, page, linkedGames },
  };
}
