export type QuestVisualSignal = {
  source: string;
  wrapperTraits: string[];
  outcome: "completed" | "abandoned" | "skipped";
  postActivityAction?: "replay_same" | "replay_harder" | "back_to_map" | "abandon";
  accuracy?: number | null;
  frustration?: number | null;
};

export type QuestVisualPromptLabFixture = {
  id: string;
  child: {
    name: string;
    age: number;
  };
  assignment: {
    domain: "spelling" | "reading" | "math" | "science";
    masteryTopic: string;
    skills: string[];
    proofMode: string;
    targetWords?: string[];
  };
  recentSignals: QuestVisualSignal[];
};

export type QuestVisualDesignerBrief = {
  childName: string;
  age: number;
  domain: QuestVisualPromptLabFixture["assignment"]["domain"];
  masteryTopic: string;
  learningTruth: string;
  childPreferenceTheory: string;
  concept: string;
  shellConstraints: string;
  style: string;
  safety: string;
};

export type QuestVisualPromptVariant = {
  id: string;
  label: string;
  brief: QuestVisualDesignerBrief;
  prompt: string;
  shouldGenerateImage: boolean;
  notes: string[];
};

export function findQuestVisualPromptPollution(prompt: string, targetWords: string[]): string[] {
  const findings: string[] = [];
  if (/candidate purpose|candidate description|race tower climb/i.test(prompt)) {
    findings.push("planner_candidate_text");
  }
  for (const word of targetWords) {
    const trimmed = word.trim();
    if (!trimmed) continue;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-zA-Z])${escaped}([^a-zA-Z]|$)`, "i").test(prompt)) {
      findings.push(`target_word:${trimmed}`);
    }
  }
  return findings;
}

type TraitScore = {
  positive: number;
  negative: number;
};

const DEFAULT_SHELL_CONSTRAINTS =
  "full-bleed interactive game art, central challenge zone, space for a hidden input/answer mechanic, progress 1 of 3, reward meter, one clear action area, no companion character inside the iframe, no visible answers, no worksheet paper, no generic flat cards. UI text should be minimal and non-answer-related; abstract icons are preferred over readable copy.";

const DEFAULT_QUALITY_BAR =
  "high-end stylized 3D game concept art, colorful but not babyish, polished, dynamic, magical, inviting, crisp readable composition, no watermarks.";

export function createQuestVisualPromptLabFixture(id: string): QuestVisualPromptLabFixture {
  if (id === "spelling-speed-avoidant") {
    return {
      id,
      child: { name: "Reina", age: 8 },
      assignment: {
        domain: "spelling",
        masteryTopic: "comparative and superlative suffix recall",
        skills: ["comparative suffix -er", "superlative suffix -est"],
        proofMode: "listen or see a clue, then type the answer from memory",
        targetWords: ["faster", "fastest", "slower", "slowest"],
      },
      recentSignals: [
        {
          source: "speed-catcher",
          wrapperTraits: ["speed", "competition", "timer"],
          outcome: "abandoned",
          postActivityAction: "abandon",
          accuracy: 0.48,
          frustration: 0.82,
        },
        {
          source: "word-builder",
          wrapperTraits: ["control", "visual", "calm"],
          outcome: "completed",
          postActivityAction: "replay_same",
          accuracy: 0.88,
          frustration: 0.12,
        },
      ],
    };
  }

  if (id === "math-competition-positive") {
    return {
      id,
      child: { name: "Ila", age: 10 },
      assignment: {
        domain: "math",
        masteryTopic: "multi-step fraction reasoning",
        skills: ["equivalent fractions", "multi-step reasoning"],
        proofMode: "solve a reasoning lock and explain the chosen operation",
      },
      recentSignals: [
        {
          source: "letter-rush",
          wrapperTraits: ["challenge", "progress", "light competition"],
          outcome: "completed",
          postActivityAction: "replay_harder",
          accuracy: 0.91,
          frustration: 0.18,
        },
        {
          source: "mystery-choice",
          wrapperTraits: ["mystery", "choice", "reward"],
          outcome: "completed",
          postActivityAction: "back_to_map",
          accuracy: null,
          frustration: 0.05,
        },
      ],
    };
  }

  if (id === "reading-cozy-explorer") {
    return {
      id,
      child: { name: "Ila", age: 10 },
      assignment: {
        domain: "reading",
        masteryTopic: "story comprehension and evidence recall",
        skills: ["main idea", "text evidence", "sequence"],
        proofMode: "choose and explain route clues using remembered story evidence",
      },
      recentSignals: [
        {
          source: "karaoke-reading",
          wrapperTraits: ["story", "calm", "progress"],
          outcome: "completed",
          postActivityAction: "replay_same",
          accuracy: 0.9,
          frustration: 0.08,
        },
      ],
    };
  }

  return {
    id: "reina-spelling-mystery",
    child: { name: "Reina", age: 8 },
    assignment: {
      domain: "spelling",
      masteryTopic: "silent letters and high-frequency words",
      skills: ["silent letters", "high-frequency words"],
      proofMode: "listen or see a clue, then type the word from memory",
      targetWords: ["faster", "fastest", "write", "sign"],
    },
    recentSignals: [
      {
        source: "mystery-box",
        wrapperTraits: ["mystery", "surprise", "reward"],
        outcome: "completed",
        postActivityAction: "replay_same",
        accuracy: null,
        frustration: 0.05,
      },
      {
        source: "word-radar",
        wrapperTraits: ["visual progress", "control", "recognition"],
        outcome: "completed",
        postActivityAction: "back_to_map",
        accuracy: 0.86,
        frustration: 0.1,
      },
      {
        source: "pronunciation",
        wrapperTraits: ["confidence", "replay", "voice"],
        outcome: "completed",
        postActivityAction: "replay_same",
        accuracy: 0.92,
        frustration: 0.1,
      },
    ],
  };
}

export function renderQuestVisualPrompt(brief: QuestVisualDesignerBrief): string {
  return [
    `Create a premium 16:9 game screen concept for Sunny, an adaptive learning Quest for ${brief.childName}, age ${brief.age}.`,
    "",
    `Learning truth: ${brief.learningTruth}`,
    "",
    `Child preference theory: ${brief.childPreferenceTheory}`,
    "",
    `Concept: ${brief.concept}`,
    "",
    `Sunny shell constraints: ${brief.shellConstraints}`,
    "",
    `Style: ${brief.style}`,
  ].join("\n");
}

export function buildQuestVisualPromptVariants(fixture: QuestVisualPromptLabFixture): QuestVisualPromptVariant[] {
  const northStar = buildNorthStarBaselineBrief(fixture);
  const minimal = buildMinimalBrief(fixture);
  const signalDerived = buildSignalDerivedBrief(fixture);
  const polluted = buildPollutedControlBrief(fixture);

  return [
    {
      id: "north-star-baseline",
      label: "North-star baseline",
      brief: northStar,
      prompt: renderQuestVisualPrompt(northStar),
      shouldGenerateImage: true,
      notes: ["Known-good shape from prior winning prompt."],
    },
    {
      id: "minimal-clean",
      label: "Minimal clean brief",
      brief: minimal,
      prompt: renderQuestVisualPrompt(minimal),
      shouldGenerateImage: true,
      notes: ["Small input: assignment truth, tiny taste hint, quality bar, safety."],
    },
    {
      id: "signal-derived",
      label: "Signal-derived brief",
      brief: signalDerived,
      prompt: renderQuestVisualPrompt(signalDerived),
      shouldGenerateImage: true,
      notes: ["Prompt built from recent activity signals without raw target words."],
    },
    {
      id: "polluted-control",
      label: "Polluted negative control",
      brief: polluted,
      prompt: renderQuestVisualPrompt(polluted),
      shouldGenerateImage: false,
      notes: ["Prompt-only negative control. Do not send to image API."],
    },
  ];
}

function buildNorthStarBaselineBrief(fixture: QuestVisualPromptLabFixture): QuestVisualDesignerBrief {
  return {
    childName: fixture.child.name,
    age: fixture.child.age,
    domain: fixture.assignment.domain,
    masteryTopic: fixture.assignment.masteryTopic,
    learningTruth:
      `this is a ${fixture.assignment.domain} mastery quest for ${fixture.assignment.masteryTopic}. The child must prove recall by listening/seeing a clue and typing the word from memory, but the actual spelling target words must NOT be visible in the image.`,
    childPreferenceTheory:
      `${fixture.child.name} responds to mystery, magical rewards, collection energy, visual progress, light competition, control, and surprise. She should feel like she is unlocking something rare, not doing a worksheet.`,
    concept:
      "Secret Spelling Vault. A luminous fantasy vault in a magical lab/forest hybrid, glowing glyphs, crystal locks, collectible badge energy, cinematic VFX, warm dramatic lighting, playful high-polish game UI. Make it feel like a Class A reusable learning game, something a child would want to enter.",
    shellConstraints: DEFAULT_SHELL_CONSTRAINTS.replace("no visible answers", "no visible spelling answers"),
    style: DEFAULT_QUALITY_BAR,
    safety: "No target words, answers, worksheet paper, or readable homework text.",
  };
}

function buildMinimalBrief(fixture: QuestVisualPromptLabFixture): QuestVisualDesignerBrief {
  const domainTruth = domainLearningTruth(fixture);
  return {
    childName: fixture.child.name,
    age: fixture.child.age,
    domain: fixture.assignment.domain,
    masteryTopic: fixture.assignment.masteryTopic,
    learningTruth: domainTruth,
    childPreferenceTheory:
      `${fixture.child.name} should feel like this is a premium game moment, not homework. Use mystery, reward, progress, choice, and playful game energy only where they fit the learning truth.`,
    concept:
      `Create one original world where ${domainMechanicPhrase(fixture.assignment.domain)}. The concept should be clear, exciting, and buildable inside Sunny without showing answers.`,
    shellConstraints: DEFAULT_SHELL_CONSTRAINTS,
    style: "premium 16:9 game screen, high-polish, cinematic, readable, inviting, not babyish, no watermarks.",
    safety: "No target words, answers, worksheet paper, or readable homework text.",
  };
}

function buildSignalDerivedBrief(fixture: QuestVisualPromptLabFixture): QuestVisualDesignerBrief {
  const scored = scoreTraits(fixture.recentSignals);
  const positive = topTraits(scored, "positive");
  const negative = topTraits(scored, "negative");
  const concept = conceptFromSignals(fixture, positive, negative);
  const style = styleFromSignals(positive, negative);

  return {
    childName: fixture.child.name,
    age: fixture.child.age,
    domain: fixture.assignment.domain,
    masteryTopic: fixture.assignment.masteryTopic,
    learningTruth: domainLearningTruth(fixture),
    childPreferenceTheory: preferenceTheoryFromSignals(fixture.child.name, positive, negative),
    concept,
    shellConstraints: DEFAULT_SHELL_CONSTRAINTS,
    style,
    safety: "No target words, answers, worksheet paper, or readable homework text.",
  };
}

function buildPollutedControlBrief(fixture: QuestVisualPromptLabFixture): QuestVisualDesignerBrief {
  const firstWord = fixture.assignment.targetWords?.[0] ?? "target";
  return {
    childName: fixture.child.name,
    age: fixture.child.age,
    domain: fixture.assignment.domain,
    masteryTopic: fixture.assignment.masteryTopic,
    learningTruth: domainLearningTruth(fixture),
    childPreferenceTheory: "This intentionally includes raw planner/candidate-style text so the lab can catch prompt pollution.",
    concept:
      `Race Tower Climb. Candidate purpose: intervention targeting spelling through competitive vertical progression. Candidate description: flags say '${firstWord}' and the child boosts racers by reading the flags.`,
    shellConstraints: DEFAULT_SHELL_CONSTRAINTS,
    style: DEFAULT_QUALITY_BAR,
    safety: "This variant is a negative control and should never be sent to the image API.",
  };
}

function domainLearningTruth(fixture: QuestVisualPromptLabFixture): string {
  const topic = fixture.assignment.masteryTopic;
  if (fixture.assignment.domain === "math") {
    return `this is a math mastery quest for ${topic}. The child must prove reasoning by solving the challenge; reasoning powers the system, but no worked answer should be visible in the image.`;
  }
  if (fixture.assignment.domain === "reading") {
    return `this is a reading mastery quest for ${topic}. The child must prove comprehension by using remembered evidence to reveal the next route, but no passage answers should be visible in the image.`;
  }
  if (fixture.assignment.domain === "science") {
    return `this is a science mastery quest for ${topic}. The child must prove cause/effect understanding by stabilizing or testing the system, but no answer key should be visible in the image.`;
  }
  return `this is a spelling mastery quest for ${topic}. The child must prove hidden recall by ${fixture.assignment.proofMode}, but the actual spelling target words must NOT be visible in the image.`;
}

function domainMechanicPhrase(domain: QuestVisualPromptLabFixture["assignment"]["domain"]): string {
  if (domain === "math") return "reasoning powers the system";
  if (domain === "reading") return "comprehension reveals the route";
  if (domain === "science") return "evidence stabilizes the experiment";
  return "hidden recall changes the world";
}

function scoreTraits(signals: QuestVisualSignal[]): Record<string, TraitScore> {
  const scores: Record<string, TraitScore> = {};
  for (const signal of signals) {
    const replay = signal.postActivityAction === "replay_same" || signal.postActivityAction === "replay_harder";
    const abandoned = signal.outcome === "abandoned" || signal.postActivityAction === "abandon";
    const frustrated = Number(signal.frustration ?? 0) >= 0.65;
    const accurate = signal.accuracy == null || signal.accuracy >= 0.75;
    for (const rawTrait of signal.wrapperTraits) {
      const trait = normalizeTrait(rawTrait);
      scores[trait] ??= { positive: 0, negative: 0 };
      if (abandoned || frustrated) {
        scores[trait].negative += frustrated ? 2 : 1;
      } else if (signal.outcome === "completed" && accurate) {
        scores[trait].positive += replay ? 2 : 1;
      }
    }
  }
  return scores;
}

function normalizeTrait(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "visual progress") return "progress";
  if (normalized === "light competition") return "competition";
  if (normalized === "reward") return "magical rewards";
  return normalized;
}

function topTraits(scores: Record<string, TraitScore>, side: "positive" | "negative"): string[] {
  return Object.entries(scores)
    .filter(([, score]) => score[side] > 0)
    .sort((a, b) => b[1][side] - a[1][side])
    .slice(0, 7)
    .map(([trait]) => trait);
}

function preferenceTheoryFromSignals(childName: string, positive: string[], negative: string[]): string {
  const supported = positive.length ? positive.join(", ") : "playful progress, choice, and reward";
  const softened = negative.length ? ` Soften or avoid ${negative.join(", ")}; those signals showed friction.` : "";
  return `${childName} has recent engagement signals around ${supported}.${softened} The experience should feel like something worth entering, not a worksheet.`;
}

function conceptFromSignals(
  fixture: QuestVisualPromptLabFixture,
  positive: string[],
  negative: string[],
): string {
  const likesMystery = positive.some((trait) => ["mystery", "surprise", "magical rewards", "reward"].includes(trait));
  const likesProgress = positive.some((trait) => ["progress", "control", "visual"].includes(trait));
  const avoidsSpeed = negative.some((trait) => ["speed", "timer", "competition"].includes(trait));

  if (fixture.assignment.domain === "math") {
    return likesProgress
      ? "Power Reactor Challenge. A bright kinetic machine where each solved reasoning lock restores energy to bridges, gears, and glowing circuits; the child feels the system come alive through their thinking."
      : "Pattern Gate Workshop. A premium puzzle-machine world where math reasoning repairs a beautiful control system without showing worked answers.";
  }
  if (fixture.assignment.domain === "reading") {
    return "Cozy Story Map. A warm explorer room where remembered evidence lights routes on a living map; the child unlocks paths by understanding what happened, not by reading an answer panel.";
  }
  if (fixture.assignment.domain === "science") {
    return "Wonder Lab Stabilizer. A luminous lab/ecosystem where evidence choices calm reactions, balance instruments, and reveal cause/effect without showing an answer key.";
  }
  if (avoidsSpeed) {
    return "Quiet Rune Workshop. A calm magical puzzle room where hidden recall fills rune sockets and gently opens rare drawers; no timer pressure or high-pressure competitive framing.";
  }
  if (likesMystery || likesProgress) {
    return "Secret Spelling Vault. A luminous fantasy vault in a magical lab/forest hybrid, glowing glyphs, crystal locks, rare unlock energy, empty hidden-recall slots, cinematic VFX, warm dramatic lighting, playful high-polish game UI. Make it feel like a Class A reusable learning game, something a child would want to enter.";
  }
  return "Hidden Signal Gate. A premium game-world door where recalled spellings become energy keys that wake the scene without showing the target words.";
}

function styleFromSignals(positive: string[], negative: string[]): string {
  const avoidsSpeed = negative.some((trait) => ["speed", "timer", "competition"].includes(trait));
  const likesMystery = positive.some((trait) => ["mystery", "surprise", "magical rewards", "reward"].includes(trait));
  if (avoidsSpeed) {
    return "cozy high-polish 3D puzzle game concept art, calm magical lighting, tactile UI, inviting, readable, not babyish, no watermarks.";
  }
  if (likesMystery) {
    return DEFAULT_QUALITY_BAR;
  }
  return "premium game screen, polished, playful, clear, inviting, crisp readable composition, no watermarks.";
}
