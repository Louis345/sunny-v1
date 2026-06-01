export function parsePronunciationStoryWords(search: string, key: string): string[] {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const raw = params.get(key);
  if (!raw) return [];

  const seen = new Set<string>();
  const words: string[] = [];
  for (const token of raw.split(/[,|\n]/g)) {
    const word = token.toLowerCase().replace(/[^a-z'-]+/g, "").trim();
    if (!word || word.length < 2 || seen.has(word)) continue;
    seen.add(word);
    words.push(word);
  }
  return words;
}

export function readPronunciationStoryWordsFromSearch(search: string): {
  words: string[];
  replayWords: string[];
  wordsProvided: boolean;
  replayWordsProvided: boolean;
} {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return {
    words: parsePronunciationStoryWords(search, "sunnyWords"),
    replayWords: parsePronunciationStoryWords(search, "sunnyReplayWords"),
    wordsProvided: params.has("sunnyWords"),
    replayWordsProvided: params.has("sunnyReplayWords"),
  };
}

export function readPronunciationStoryWordsFromLocation(): ReturnType<
  typeof readPronunciationStoryWordsFromSearch
> {
  if (typeof window === "undefined") {
    return {
      words: [],
      replayWords: [],
      wordsProvided: false,
      replayWordsProvided: false,
    };
  }
  return readPronunciationStoryWordsFromSearch(window.location.search);
}
