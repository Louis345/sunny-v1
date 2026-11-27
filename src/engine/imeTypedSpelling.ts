/**
 * A Japanese-input keyboard turns typed letters into kana ("forgot" → "フォrゴt"). This recovers the letters a
 * child typed, the way wanakana reads romaji back, without guessing: when two keystroke spellings make the same
 * kana and only one of them is the word (カ is "ka" or "ca"), the answer is ambiguous, not right or wrong.
 * Pure: no IO, no logging. Callers log ` 🎮 [spelling-input] [ime-normalized] ...`.
 */
export type TypedSpelling = {
  raw: string;
  /** The letters she typed: the only reading, or the first one when every reading is wrong. */
  value: string;
  status: "plain" | "ime_normalized" | "ime_ambiguous" | "ime_unscorable";
  /** Every keystroke spelling that produces the raw text (one for plain typing). */
  candidates: string[];
};

// Keystrokes that produce each kana. Alternatives are listed only where an English speller could type either
// (c/k, s/c, sh/s, ch/t, f/h, j/z); IME-only spellings such as "tya" or "sya" are left out.
const SINGLE: Record<string, string[]> = {
  あ: ["a"], い: ["i"], う: ["u"], え: ["e"], お: ["o"],
  か: ["ka", "ca"], き: ["ki"], く: ["ku", "cu", "qu"], け: ["ke"], こ: ["ko", "co"],
  さ: ["sa"], し: ["shi", "si", "ci"], す: ["su"], せ: ["se", "ce"], そ: ["so"],
  た: ["ta"], ち: ["chi", "ti"], つ: ["tsu", "tu"], て: ["te"], と: ["to"],
  な: ["na"], に: ["ni"], ぬ: ["nu"], ね: ["ne"], の: ["no"],
  は: ["ha"], ひ: ["hi"], ふ: ["fu", "hu"], へ: ["he"], ほ: ["ho"],
  ま: ["ma"], み: ["mi"], む: ["mu"], め: ["me"], も: ["mo"],
  や: ["ya"], ゆ: ["yu"], よ: ["yo"],
  ら: ["ra"], り: ["ri"], る: ["ru"], れ: ["re"], ろ: ["ro"],
  わ: ["wa"], を: ["wo"],
  が: ["ga"], ぎ: ["gi"], ぐ: ["gu"], げ: ["ge"], ご: ["go"],
  ざ: ["za"], じ: ["ji", "zi"], ず: ["zu"], ぜ: ["ze"], ぞ: ["zo"],
  だ: ["da"], ぢ: ["di"], づ: ["du"], で: ["de"], ど: ["do"],
  ば: ["ba"], び: ["bi"], ぶ: ["bu"], べ: ["be"], ぼ: ["bo"],
  ぱ: ["pa"], ぴ: ["pi"], ぷ: ["pu"], ぺ: ["pe"], ぽ: ["po"],
  ゔ: ["vu"],
};
const PAIRS: Record<string, string[]> = {
  きゃ: ["kya"], きゅ: ["kyu"], きょ: ["kyo"], しゃ: ["sha"], しゅ: ["shu"], しょ: ["sho"], しぇ: ["she"],
  ちゃ: ["cha"], ちゅ: ["chu"], ちょ: ["cho"], ちぇ: ["che"], にゃ: ["nya"], にゅ: ["nyu"], にょ: ["nyo"],
  ひゃ: ["hya"], ひゅ: ["hyu"], ひょ: ["hyo"], みゃ: ["mya"], みゅ: ["myu"], みょ: ["myo"],
  りゃ: ["rya"], りゅ: ["ryu"], りょ: ["ryo"], ぎゃ: ["gya"], ぎゅ: ["gyu"], ぎょ: ["gyo"],
  じゃ: ["ja"], じゅ: ["ju"], じょ: ["jo"], じぇ: ["je"], びゃ: ["bya"], びゅ: ["byu"], びょ: ["byo"],
  ぴゃ: ["pya"], ぴゅ: ["pyu"], ぴょ: ["pyo"], ふぁ: ["fa"], ふぃ: ["fi"], ふぇ: ["fe"], ふぉ: ["fo"],
  ゔぁ: ["va"], ゔぃ: ["vi"], ゔぇ: ["ve"], ゔぉ: ["vo"], うぃ: ["wi"], うぇ: ["we"], いぇ: ["ye"],
  てぃ: ["thi"], でぃ: ["dhi"], くぁ: ["qa"], くぃ: ["qi"], くぇ: ["qe"], くぉ: ["qo"],
};
const MAX_CANDIDATES = 256;
const KANA = /[ぁ-ゖァ-ヺー]/;
const FULL_WIDTH = /[！-～]/;

const toHiragana = (text: string) => text.replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
const toHalfWidth = (text: string) => text.replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/　/g, " ");
const STARTS_WITH_VOWEL_OR_Y = /^[aiueoy]/;

/** Reads kana back to the letters typed. Returns null when some character cannot be letters. */
function readings(raw: string): string[] | null {
  const text = toHiragana(toHalfWidth(raw.normalize("NFKC") === raw ? raw : raw)).replace(/　/g, " ");
  const chars = [...text];
  const tokens: Array<{ options: string[]; kind: "kana" | "n" | "sokuon" | "ascii" }> = [];
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const pair = PAIRS[ch + (chars[i + 1] ?? "")];
    if (pair) { tokens.push({ options: pair, kind: "kana" }); i += 1; continue; }
    if (SINGLE[ch]) { tokens.push({ options: SINGLE[ch], kind: "kana" }); continue; }
    if (ch === "ん") { tokens.push({ options: ["n"], kind: "n" }); continue; }
    if (ch === "っ") { tokens.push({ options: [], kind: "sokuon" }); continue; }
    if (/^[\x20-\x7e]$/.test(ch)) { tokens.push({ options: [ch.toLowerCase()], kind: "ascii" }); continue; }
    return null;
  }
  for (let i = 0; i < tokens.length; i += 1) {
    const next = tokens[i + 1];
    // ん before a vowel kana can only be "nn": a single n would have joined the vowel (な, に, ...).
    if (tokens[i].kind === "n" && next?.kind === "kana" && next.options.every(option => STARTS_WITH_VOWEL_OR_Y.test(option))) tokens[i].options = ["nn"];
    // っ doubles the first letter of whatever she typed next ("kk" → っk, "tte" → って).
    if (tokens[i].kind === "sokuon") {
      if (!next || next.kind === "sokuon" || next.kind === "n") return null;
      tokens[i].options = [...new Set(next.options.map(option => option[0]).filter(letter => /[a-z]/.test(letter)))];
      if (!tokens[i].options.length) return null;
    }
  }
  let built = [""];
  for (const token of tokens) {
    built = built.flatMap(prefix => token.options.map(option => prefix + option));
    if (built.length > MAX_CANDIDATES) return null;
  }
  // っ's letter must match the reading chosen for the kana after it ("cchi" or "tti", never "cti").
  const result = tokens.some(token => token.kind === "sokuon") ? built.filter(reading => consistentDoubling(reading, tokens)) : built;
  return [...new Set(result)];
}

function consistentDoubling(reading: string, tokens: Array<{ options: string[]; kind: string }>): boolean {
  // Walk tokens against the reading; every sokuon letter must equal the next token's first letter.
  const walk = (position: number, index: number, pending: string | null): boolean => {
    if (index === tokens.length) return position === reading.length && pending === null;
    for (const option of tokens[index].options) {
      if (!reading.startsWith(option, position)) continue;
      if (pending !== null && option[0] !== pending) continue;
      if (walk(position + option.length, index + 1, tokens[index].kind === "sokuon" ? option : null)) return true;
    }
    return false;
  };
  return walk(0, 0, null);
}

export function readTypedSpelling(raw: string, acceptedForms: string[] = [], caseSensitive = false): TypedSpelling {
  if (!KANA.test(raw) && !FULL_WIDTH.test(raw)) return { raw, value: raw, status: "plain", candidates: [raw] };
  const all = readings(raw);
  if (!all || !all.length || all.some(reading => /[^\x20-\x7e]/.test(reading))) return { raw, value: raw, status: "ime_unscorable", candidates: [] };
  const fold = (text: string) => caseSensitive ? text.normalize("NFC").trim() : text.normalize("NFC").trim().toLocaleLowerCase("en-US");
  const accepted = new Set(acceptedForms.map(fold));
  const matching = all.filter(reading => accepted.has(fold(reading)));
  if (matching.length > 0 && matching.length < all.length) return { raw, value: matching[0], status: "ime_ambiguous", candidates: all };
  return { raw, value: matching[0] ?? all[0], status: "ime_normalized", candidates: all };
}
