import { planSession } from "../engine/learningEngine";
import { readChildMeta } from "../profiles/childrenConfig";
import { daysUntilHomeworkTest, selectHomeworkSessionWords } from "../shared/homeworkWordSelection";
import { readWordBank } from "../utils/wordBankIO";

export type HomeworkType =
  | "spelling_test"
  | "reading"
  | "math"
  | "coins"
  | "clocks"
  | "generic";

export type PracticeDomain =
  | "spelling"
  | "reading"
  | "math"
  | "writing"
  | "generic";

export type ContentDomain =
  | "science"
  | "social_studies"
  | "language_arts"
  | "math"
  | "generic";

export type ContentProfile = {
  practiceDomain: PracticeDomain;
  contentDomain: ContentDomain;
  topic: string;
  primarySkill: string;
  assignmentFormat: string;
  concepts: string[];
  sourceEvidence: string[];
};

export type PlannedHomeworkNode = {
  id: string;
  type:
    | "word-radar"
    | "spell-check"
    | "pronunciation"
    | "karaoke"
    | "word-builder"
    | "quest"
    | "boss"
    | "wheel-of-fortune";
  words: string[];
  wordRadarItems?: Array<{
    display: string;
    acceptedResponses: string[];
    label?: string;
    subject?: string;
  }>;
  difficulty: 1 | 2 | 3;
  rationale: string;
  gameFile?: string | null;
  storyFile?: string | null;
  storyText?: string;
  storyTitle?: string;
  storyImagePrompt?: string;
  date?: string;
};

type NormalizableExtraction = {
  title: string;
  type: HomeworkType | string;
  words: string[];
  questions: unknown[];
  contentProfile?: Partial<ContentProfile> | null;
};

function cleanList(values: unknown[] | undefined): string[] {
  return [...new Set(
    (values ?? [])
      .map((v) => String(v ?? "").trim())
      .filter(Boolean),
  )];
}

function evidenceText(extraction: NormalizableExtraction): string {
  return [
    extraction.title,
    extraction.words.join(" "),
    extraction.questions
      .map((q) => JSON.stringify(q))
      .join(" "),
  ].join(" ").toLowerCase();
}

function practiceDomainFor(type: string): PracticeDomain {
  if (type === "spelling_test" || type === "spelling") return "spelling";
  if (type === "reading" || type === "comprehension") return "reading";
  if (type === "math" || type === "coins" || type === "clocks") return "math";
  return "generic";
}

function inferPrimarySkill(extraction: NormalizableExtraction): string {
  const words = extraction.words.map((w) => w.toLowerCase());
  const hasErEstPairs = words.some((w) => w.endsWith("er")) && words.some((w) => w.endsWith("est"));
  if (hasErEstPairs) return "comparative_and_superlative_adjectives";
  if (practiceDomainFor(String(extraction.type)) === "spelling") return "spelling_production";
  return "content_understanding";
}

function inferAssignmentFormat(extraction: NormalizableExtraction): string {
  const text = evidenceText(extraction);
  if (text.includes("picture code") || text.includes("decode")) return "picture_code_decode";
  if (text.includes("multiple_choice")) return "multiple_choice";
  return "worksheet";
}

function inferContentDomainAndTopic(extraction: NormalizableExtraction): Pick<ContentProfile, "contentDomain" | "topic" | "concepts" | "sourceEvidence"> {
  const text = evidenceText(extraction);
  const scienceConcepts = [
    "erosion",
    "weathering",
    "sediment",
    "landform",
    "landforms",
    "soil",
    "rocks",
    "water",
    "wind",
  ];
  const hits = scienceConcepts.filter((term) => text.includes(term));
  if (hits.length > 0) {
    return {
      contentDomain: "science",
      topic: hits.includes("erosion") ? "erosion" : hits[0]!,
      concepts: cleanList(hits),
      sourceEvidence: hits.map((term) => `matched science term: ${term}`),
    };
  }
  return {
    contentDomain: practiceDomainFor(String(extraction.type)) === "math" ? "math" : "language_arts",
    topic: extraction.title || String(extraction.type || "homework"),
    concepts: [],
    sourceEvidence: ["No explicit cross-domain topic detected."],
  };
}

export function normalizeContentProfile(extraction: NormalizableExtraction): ContentProfile {
  const inferred = inferContentDomainAndTopic(extraction);
  const raw = extraction.contentProfile ?? {};
  const practiceDomain = raw.practiceDomain ?? practiceDomainFor(String(extraction.type));
  const contentDomain = raw.contentDomain ?? inferred.contentDomain;
  const topic = String(raw.topic ?? inferred.topic ?? extraction.title).trim() || "homework";
  const primarySkill =
    String(raw.primarySkill ?? inferPrimarySkill(extraction)).trim() || "content_understanding";
  const assignmentFormat =
    String(raw.assignmentFormat ?? inferAssignmentFormat(extraction)).trim() || "worksheet";
  const concepts = cleanList([
    ...inferred.concepts,
    ...cleanList(raw.concepts),
  ]);
  const sourceEvidence = cleanList([
    ...inferred.sourceEvidence,
    ...cleanList(raw.sourceEvidence),
  ]);
  return {
    practiceDomain,
    contentDomain,
    topic,
    primarySkill,
    assignmentFormat,
    concepts,
    sourceEvidence,
  };
}

function wordRadarItemsFromWordList(wordList: string[]): NonNullable<PlannedHomeworkNode["wordRadarItems"]> {
  return wordList.map((w) => ({
    display: w,
    acceptedResponses: [w.toLowerCase()],
    label: "Spelling",
    subject: "spelling",
  }));
}

function tokenizeStory(story: string): string[] {
  return story
    .replace(/[^A-Za-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

function storyForContent(profile: ContentProfile, words: string[]): {
  title: string;
  text: string;
  imagePrompt: string;
} {
  const topic = profile.topic || "today's homework";
  const conceptLine = profile.concepts.slice(0, 5).join(", ") || topic;
  const spellingLine = words.slice(0, 8).join(", ");
  if (profile.contentDomain === "science" && topic.toLowerCase().includes("erosion")) {
    const text = [
      "Rain rushed down a small hill and carried bits of soil away.",
      "That slow change is called erosion.",
      "When water moved faster, it covered more ground and pulled tiny rocks along.",
      "When the water moved slower, the soil settled in a new place.",
      `Reina noticed the words ${spellingLine} while she compared how landforms changed.`,
      "The newest channel was not the deepest yet, but the coldest wind made the sand shift again.",
    ].join(" ");
    return {
      title: "The Hill That Changed",
      text,
      imagePrompt:
        "A clear child-friendly science illustration of erosion: rainwater flowing faster down a hill, carrying soil and small rocks, forming a channel and new landform.",
    };
  }
  const text = [
    `Today we are learning about ${topic}.`,
    `Key ideas include ${conceptLine}.`,
    `The practice words are ${spellingLine}.`,
    "Read each sentence carefully, then use the words in the next challenge.",
  ].join(" ");
  return {
    title: topic,
    text,
    imagePrompt: `A child-friendly illustration for ${topic}, showing ${conceptLine}.`,
  };
}

function buildSpellingNodes(args: {
  childId: string;
  homeworkId: string;
  words: string[];
  testDate?: string | null;
  missedWords?: string[];
}): PlannedHomeworkNode[] {
  const childMeta = readChildMeta(args.childId);
  const maxWords =
    childMeta?.games?.["word-radar"]?.maxWords ??
    childMeta?.games?.["spell-check"]?.maxWords ??
    5;
  const today = new Date().toISOString().slice(0, 10);
  const bank = readWordBank(args.childId);
  const sm2Plan = planSession(args.childId, "spelling", {
    homeworkFallbackWords: args.words,
  });
  const selected = selectHomeworkSessionWords({
    wordList: args.words,
    sm2Plan,
    missedWords: args.missedWords ?? [],
    testDate: args.testDate ?? null,
    maxWords,
    testImminent: daysUntilHomeworkTest(args.testDate ?? null, today) <= 5,
    wordBankWords: bank.words,
    todayIso: today,
  });
  const idSuffix = args.homeworkId.replace(/[^a-zA-Z0-9-_]/g, "-");
  return [
    {
      id: `n-word-radar-${idSuffix}`,
      type: "word-radar",
      words: [...selected],
      wordRadarItems: wordRadarItemsFromWordList(selected),
      difficulty: 1,
      rationale: "Word radar warms up recognition for the spelling-list words.",
      gameFile: null,
      storyFile: null,
    },
    {
      id: `n-spell-check-${idSuffix}`,
      type: "spell-check",
      words: [...selected],
      difficulty: 2,
      rationale: "Spell-check captures spelling production attempts for diagnostics.",
      gameFile: null,
      storyFile: null,
    },
    {
      id: `n-wheel-${idSuffix}`,
      type: "wheel-of-fortune",
      words: [...selected],
      difficulty: 2,
      rationale: "Wheel of Fortune gives competitive retrieval practice with the same list.",
      gameFile: null,
      storyFile: null,
    },
  ];
}

export function buildContentAwareHomeworkNodes(args: {
  type: HomeworkType;
  words: string[];
  homeworkId: string;
  childId: string;
  testDate?: string | null;
  missedWords?: string[];
  contentProfile?: ContentProfile | null;
}): PlannedHomeworkNode[] {
  const spellingNodes =
    args.type === "spelling_test"
      ? buildSpellingNodes(args)
      : [];
  const profile = args.contentProfile;
  const hasContentContext =
    profile &&
    profile.contentDomain !== "language_arts" &&
    profile.contentDomain !== "generic" &&
    profile.topic.trim().length > 0 &&
    profile.topic !== "homework" &&
    profile.topic !== "spelling_test";

  if (!hasContentContext) {
    return spellingNodes;
  }

  const story = storyForContent(profile, args.words);
  return [
    {
      id: `n-karaoke-${args.homeworkId.replace(/[^a-zA-Z0-9-_]/g, "-")}`,
      type: "karaoke",
      words: tokenizeStory(story.text),
      difficulty: 1,
      rationale: `Build background knowledge for ${profile.topic} before practicing ${profile.practiceDomain}.`,
      gameFile: null,
      storyFile: null,
      storyText: story.text,
      storyTitle: story.title,
      storyImagePrompt: story.imagePrompt,
    },
    ...spellingNodes,
  ];
}
