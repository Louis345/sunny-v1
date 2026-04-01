/**
 * Single source of truth for "may this spelling surface use this word?"
 * (canvas spelling, Word Builder, spell-check). Only this module defines
 * allowlist semantics; call sites delegate to a gate instance.
 *
 * Empty allowlist → permissive (no extracted list / free spelling) — matches
 * legacy behavior when OCR yields no words.
 */
export type SpellingHomeworkGate = {
  /** Normalized lowercase list; empty means permissive mode. */
  readonly allowedNorms: readonly string[];
  allows(word: string): boolean;
  explainReject(word: string): string;
};

function normWord(word: string): string {
  return String(word).toLowerCase().trim();
}

export function createSpellingHomeworkGate(
  allowedNorms: readonly string[],
): SpellingHomeworkGate {
  const set = new Set(
    allowedNorms.map((w) => normWord(w)).filter((w) => w.length > 0),
  );
  const frozen = Object.freeze([...set].sort()) as readonly string[];
  const permissive = set.size === 0;

  return {
    allowedNorms: frozen,
    allows(word: string): boolean {
      const n = normWord(word);
      if (!n) return false;
      if (permissive) return true;
      return set.has(n);
    },
    explainReject(word: string): string {
      const n = normWord(word);
      if (!n) return "Word must be non-empty.";
      if (permissive) return "";
      return `Word "${n}" is not on today's extracted spelling homework list. Use only homework words.`;
    },
  };
}
