export interface WilsonStep {
  step: number;
  name: string;
  patterns: string[];
  sampleWords: string[];
  phonemeRules: string[];
}

export const WILSON_STEPS: WilsonStep[] = [
  {
    step: 1,
    name: "CVC Short Vowels",
    patterns: ["CVC", "short_a", "short_i", "short_o", "short_u", "short_e"],
    sampleWords: ["sat", "hit", "big", "cup", "red", "dog", "mat", "pin", "hut", "bed"],
    phonemeRules: ["Each letter makes one sound", "Vowel is short in closed syllable"],
  },
  {
    step: 2,
    name: "Digraphs and Bonus Letters",
    patterns: ["digraph_sh", "digraph_ch", "digraph_th", "digraph_wh", "bonus_ll", "bonus_ss", "bonus_ff", "bonus_zz"],
    sampleWords: ["ship", "much", "bell", "fish", "thin", "chess", "whip", "fuzz"],
    phonemeRules: ["Two letters can make one sound", "Bonus letters double after short vowel"],
  },
  {
    step: 3,
    name: "Blends",
    patterns: ["initial_blend", "final_blend", "CCVC", "CVCC"],
    sampleWords: ["stop", "frog", "clap", "just", "best", "drink", "stamp", "blend"],
    phonemeRules: ["Each consonant in a blend keeps its sound", "Blend = glue, not new sound"],
  },
  {
    step: 4,
    name: "Closed Syllable Exceptions",
    patterns: ["old", "ild", "ind", "ost", "olt"],
    sampleWords: ["old", "cold", "wild", "find", "most", "bolt", "kind", "told"],
    phonemeRules: ["Some closed syllables have long vowels", "Memorize the exception families"],
  },
  {
    step: 5,
    name: "VCe Syllables",
    patterns: ["VCe", "silent_e"],
    sampleWords: ["make", "time", "note", "bike", "cube", "game", "hope", "ride"],
    phonemeRules: ["Silent e makes the vowel say its name", "The e is silent but powerful"],
  },
  {
    step: 6,
    name: "Open Syllables",
    patterns: ["open_syllable", "CV"],
    sampleWords: ["go", "he", "my", "no", "she", "we", "be", "so"],
    phonemeRules: ["Syllable ends in a vowel = vowel is long", "Nothing closes the syllable"],
  },
];

export function getStepByNumber(step: number): WilsonStep | undefined {
  return WILSON_STEPS.find((s) => s.step === step);
}
