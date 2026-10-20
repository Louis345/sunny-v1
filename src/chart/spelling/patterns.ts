/** Draft taxonomy for human review. IDs and version 1 meanings are immutable. */
export const TAXONOMY_VERSION = 1;
export const PATTERN_IDS = [
    'spelling.silent_letters', 'spelling.short_vowels', 'spelling.long_vowels',
    'spelling.vowel_teams', 'spelling.consonant_blends', 'spelling.consonant_digraphs',
    'spelling.r_controlled_vowels', 'spelling.double_consonants', 'spelling.prefixes',
    'spelling.suffixes', 'spelling.inflections', 'spelling.irregular',
] as const;
