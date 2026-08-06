import type { ChildName } from "../companions/loader";

/**
 * Strip markdown fences from SVG output.
 * Called at the rendering boundary, before SVG is sent to the browser.
 */
export function stripSvgFences(raw: string): string {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:svg|xml|html)?\s*\n?/i, "");
  cleaned = cleaned.replace(/\n?```\s*$/i, "");
  return cleaned.trim();
}

export function stripSvgField(obj: Record<string, unknown>): void {
  const svg = obj.svg;
  if (typeof svg === "string") obj.svg = stripSvgFences(svg);
}

export function parseSunnyChildEnv(): ChildName | null {
  const value = process.env.SUNNY_CHILD?.trim().toLowerCase();
  if (value === "ila") return "Ila";
  if (value === "reina") return "Reina";
  if (value === "creator") return "creator";
  return null;
}

export function rewriteChildNameForTts(
  text: string,
  childName: ChildName,
  ttsLabel: string,
): string {
  if (!text) return text;
  if (childName === "Ila") return text.replace(/\bIla\b/g, ttsLabel);
  if (childName === "Reina") return text.replace(/\bReina\b/g, ttsLabel);
  return text.replace(/\bcreator\b/gi, ttsLabel);
}

export function isSpellingAttempt(text: string, word: string): boolean {
  const targetWord = word.toLowerCase().trim();
  if (!targetWord) return false;
  const raw = text.trim();
  const normalized = raw.toLowerCase();

  const socialPhrases = [
    "thank you",
    "what's next",
    "whats next",
    "what next",
    "got it",
    "all right",
  ];
  if (socialPhrases.some((phrase) => normalized.includes(phrase))) return false;
  if (/\b(okay|ok|yes|no|alright|thanks)\b/i.test(normalized)) return false;

  const compact = raw.replace(/\s+/g, " ").trim();
  if (/^([a-z]\s*)+$/i.test(compact)) return true;

  const lettersOnly = normalized.replace(/[^a-z]/g, "");
  const targetLetters = targetWord.replace(/[^a-z]/g, "");
  if (lettersOnly.length > 0 && lettersOnly === targetLetters) return true;

  const escaped = targetWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i").test(normalized);
}

export function mathContentToSpoken(content: string): string {
  return content
    .replace(/\s*\+\s*/g, " plus ")
    .replace(/\s*-\s*/g, " minus ")
    .replace(/\s*×\s*/g, " times ")
    .replace(/\s*÷\s*/g, " divided by ")
    .replace(/\s*=\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function shouldAcceptInterruptedTranscript(transcript: string): boolean {
  const trimmed = transcript.trim();
  if (trimmed.length === 1 && !/^[a-zA-Z]$/.test(trimmed)) {
    console.log(`  🗑️  Transcript fragment discarded: "${transcript}"`);
    return false;
  }
  if (/^(um+|uh+|hmm+|uhm+)$/i.test(trimmed)) {
    console.log(`  🗑️  Transcript fragment discarded: "${transcript}"`);
    return false;
  }
  return true;
}

export function pronunciationCueFor(word: string | undefined): string | null {
  const clean = String(word ?? "").trim().toLowerCase();
  if (!clean) return null;
  if (clean === "able") return "a-ble";
  if (clean.length <= 3) return clean.split("").join("-");
  const midpoint = Math.max(1, Math.floor(clean.length / 2));
  return `${clean.slice(0, midpoint)}-${clean.slice(midpoint)}`;
}

export function normalizeSessionChartChildId(chartChildId: string | undefined, fallback: string): string {
  const normalized = chartChildId?.trim().toLowerCase();
  return normalized && /^[a-z0-9_-]+$/.test(normalized) ? normalized : fallback;
}
