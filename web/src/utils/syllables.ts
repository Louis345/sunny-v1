/**
 * Splits a word into the chunks Elli's beat lands on (car·ni·val). A small rule set, the way word study
 * teaches it: one consonant between vowels goes with the next chunk (ni·val), two split between them
 * (car·ni), digraphs stay together (ch, sh, th...), a silent final e joins the chunk before it (charge),
 * and a consonant + le ending is its own chunk (ta·ble). Good for practice words; not a dictionary.
 */
const VOWELS = new Set(["a", "e", "i", "o", "u"]);
const DIGRAPHS = ["ch", "sh", "th", "ph", "wh", "ck", "ng", "qu"];

function isVowel(word: string, index: number): boolean {
  const letter = word[index];
  if (VOWELS.has(letter)) return true;
  // y is a vowel unless it starts the word or follows a vowel.
  return letter === "y" && index > 0 && !VOWELS.has(word[index - 1]);
}

export function syllables(input: string): string[] {
  const word = input.trim().toLowerCase();
  if (!/^[a-z]+$/.test(word) || word.length <= 3) return [input.trim()];
  // Vowel groups: [start, end) of each run of vowels.
  const groups: Array<[number, number]> = [];
  for (let index = 0; index < word.length; index += 1) {
    if (!isVowel(word, index)) continue;
    const start = index;
    while (index + 1 < word.length && isVowel(word, index + 1)) index += 1;
    groups.push([start, index + 1]);
  }
  // A silent final e (charge, make) is not its own beat; consonant + le (table) is.
  const last = groups[groups.length - 1];
  const leEnding = word.endsWith("le") && word.length > 3 && !isVowel(word, word.length - 3);
  if (groups.length > 1 && last[0] === word.length - 1 && word.endsWith("e") && !leEnding) groups.pop();
  if (groups.length <= 1) return [word];
  const cuts: number[] = [];
  for (let group = 0; group < groups.length - 1; group += 1) {
    const from = groups[group][1];
    const to = groups[group + 1][0];
    const cluster = word.slice(from, to);
    if (leEnding && group === groups.length - 2) {
      cuts.push(word.length - 3);
    } else if (cluster.length <= 1) {
      cuts.push(from);
    } else if (DIGRAPHS.includes(cluster.slice(0, 2)) && cluster.length === 2) {
      cuts.push(cluster === "ck" ? to : from);
    } else {
      cuts.push(from + 1);
    }
  }
  const parts: string[] = [];
  let start = 0;
  for (const cut of cuts) {
    if (cut > start && cut < word.length) {
      parts.push(word.slice(start, cut));
      start = cut;
    }
  }
  parts.push(word.slice(start));
  return parts;
}
