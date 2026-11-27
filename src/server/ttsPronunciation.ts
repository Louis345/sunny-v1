import { readChildrenConfig } from "../profiles/childrenConfig";

/**
 * How Sunny's voice says words it would otherwise mispronounce (2026-11-10). One place for every speech path:
 * the companion's replies and game narration both pass through pronounceForTts before text-to-speech.
 *
 * Children's names come from their profile (children.config.json `childProfiles[id].ttsName`, plus
 * `ttsAliases`: older spoken spellings, e.g. a game generated when her name was spelled "Ayla" for speech).
 * Theme words live in the small lexicon below; add a word here, never in a speech path.
 */
export const THEME_WORD_PRONUNCIATIONS: Readonly<Record<string, string>> = {
  Fuji: "Foo-jee",
  kappa: "kahp-pah",
  tanuki: "tah-noo-kee",
  kitsune: "keet-soo-neh",
  onigiri: "oh-nee-gee-ree",
  sakura: "sah-koo-rah",
  torii: "toh-ree-ee",
  yokai: "yoh-kye",
  mochi: "moh-chee",
};

type SpokenName = { written: string; spoken: string };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Every child's written name (and old spoken spellings) mapped to the pronunciation in her profile. */
function childNamePronunciations(): SpokenName[] {
  let profiles: ReturnType<typeof readChildrenConfig>["childProfiles"];
  try {
    profiles = readChildrenConfig().childProfiles;
  } catch (error) {
    console.error(" 🎮 [tts-pronunciation] [child-names] [unavailable]", error);
    return [];
  }
  return Object.entries(profiles ?? {}).flatMap(([id, row]) => {
    const spoken = row?.ttsName?.trim();
    if (!spoken) return [];
    const written = id.charAt(0).toUpperCase() + id.slice(1);
    return [written, ...(row?.ttsAliases ?? [])]
      .map(name => name.trim())
      .filter(name => name && name.toLowerCase() !== spoken.toLowerCase())
      .map(name => ({ written: name, spoken }));
  });
}

/** The text as the voice should say it: children's names from their profiles, then theme words. */
export function pronounceForTts(text: string): string {
  let spoken = text;
  for (const { written, spoken: say } of childNamePronunciations()) {
    spoken = spoken.replace(new RegExp(`\\b${escapeRegExp(written)}\\b`, "gi"), say);
  }
  for (const [word, say] of Object.entries(THEME_WORD_PRONUNCIATIONS)) {
    // Plurals keep their s ("tanukis" -> "tah-noo-kees").
    spoken = spoken.replace(new RegExp(`\\b${escapeRegExp(word)}(s?)\\b`, "gi"), (_match, plural: string) => `${say}${plural}`);
  }
  return spoken;
}
