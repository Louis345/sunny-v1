import { describe, expect, it } from "vitest";
import {
  buildConceptCheckConfigFromCapturedHomework,
  validateActivityEngineConfig,
  validateActivityEvidenceEvent,
  validateLetterRushConfig,
  type ActivityEngineConfig,
  type LetterRushConfig,
} from "./activityEngineConfig";
import { buildCapturedHomeworkContent, normalizeContentProfile } from "../scripts/contentAwareHomeworkPlanner";

describe("activity engine config contract", () => {
  const erosionConceptCheck: ActivityEngineConfig = {
    schemaVersion: 1,
    activityId: "concept-check",
    engine: {
      id: "concept-check",
      mode: "diagnostic",
    },
    topic: "Erosion",
    domain: "science",
    learningGoal: "Explain how water and wind change Earth's surface.",
    gradeBand: "early_elementary",
    appearance: {
      palette: {
        bg1: "#f2aa55",
        bg2: "#df7841",
        bg3: "#51281f",
        accent: "#ffe17b",
      },
      typography: {
        display: "serif",
        body: "rounded",
      },
      visuals: {
        heroGlyph: "mountain",
        particles: ["water", "rock", "water"],
        companionGlyph: "sunny",
      },
    },
    targets: [
      {
        id: "erosion",
        label: "Erosion",
        type: "concept",
        definition: "The process of water, wind, or ice moving rock and soil.",
      },
    ],
    rounds: [
      {
        id: "erosion-cause",
        mechanic: "choose",
        targetId: "erosion",
        prompt: "What can cause erosion?",
        options: [
          { id: "water-wind", label: "Water and wind", correct: true },
          {
            id: "sunlight",
            label: "Only sunlight",
            correct: false,
            misconception: "sunlight_causes_erosion",
          },
        ],
        scaffoldLevel: 0,
      },
    ],
    evidencePolicy: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: true,
      requiresPerTargetResult: true,
      allowedEvidence: ["practice", "mastery"],
    },
  };

  it("accepts a reusable Concept Check config that points every round at a measurable target", () => {
    const result = validateActivityEngineConfig(erosionConceptCheck);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.normalized?.activityId).toBe("concept-check");
    expect(result.normalized?.rounds[0]?.targetId).toBe("erosion");
    expect(result.normalized?.appearance?.palette.bg2).toBe("#df7841");
    expect(result.normalized?.appearance?.visuals.heroGlyph).toBe("mountain");
  });

  it("rejects appearance palettes that cannot be safely applied as CSS colors", () => {
    const result = validateActivityEngineConfig({
      ...erosionConceptCheck,
      appearance: {
        ...erosionConceptCheck.appearance,
        palette: {
          ...erosionConceptCheck.appearance?.palette,
          bg2: "url(javascript:bad)",
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: "appearance_invalid_color",
      path: "appearance.palette.bg2",
    }));
  });

  it("accepts AI-generated emoji visuals for a brand-new topic", () => {
    const result = validateActivityEngineConfig({
      ...erosionConceptCheck,
      topic: "Dinosaurs",
      appearance: {
        ...erosionConceptCheck.appearance,
        visuals: {
          heroGlyph: "🦖",
          particles: ["🌋", "🥚"],
          companionGlyph: "☀️",
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(result.normalized?.appearance?.visuals.heroGlyph).toBe("🦖");
  });

  it("rejects unknown visual labels that would render as literal words", () => {
    const result = validateActivityEngineConfig({
      ...erosionConceptCheck,
      appearance: {
        ...erosionConceptCheck.appearance,
        visuals: {
          heroGlyph: "dinosaur",
          particles: ["volcano", "egg"],
          companionGlyph: "sunny",
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: "appearance_invalid_glyph",
      path: "appearance.visuals.heroGlyph",
    }));
  });

  it("rejects hardcoded-looking content that has rounds without targets", () => {
    const result = validateActivityEngineConfig({
      ...erosionConceptCheck,
      rounds: [
        {
          id: "floating-question",
          mechanic: "choose",
          prompt: "What can cause erosion?",
          options: [
            { id: "a", label: "Water", correct: true },
            { id: "b", label: "Candy", correct: false },
          ],
          scaffoldLevel: 0,
        },
      ],
    } as unknown);

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: "round_missing_target",
      path: "rounds[0].targetId",
    }));
  });

  it("rejects Concept Check choose rounds unless exactly one option is correct", () => {
    const result = validateActivityEngineConfig({
      ...erosionConceptCheck,
      rounds: [
        {
          ...erosionConceptCheck.rounds[0]!,
          options: [
            { id: "water", label: "Water", correct: true },
            { id: "wind", label: "Wind", correct: true },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: "choose_round_requires_one_correct_option",
      path: "rounds[0].options",
    }));
  });

  it("rejects diagnostic Concept Check configs that use pre-answer scaffolds", () => {
    const result = validateActivityEngineConfig({
      ...erosionConceptCheck,
      rounds: [
        {
          ...erosionConceptCheck.rounds[0]!,
          scaffoldLevel: 1,
          preAnswerHint: "Look for water and wind.",
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: "diagnostic_round_must_be_unscaffolded",
      path: "rounds[0].scaffoldLevel",
    }));
  });

  it("builds first-pass Concept Check discovery config from captured homework evidence", () => {
    const captured = buildCapturedHomeworkContent({
      title: "Erosion Study Guide",
      type: "reading",
      rawText: "Water and wind can wear away rocks and move soil.",
      words: ["erosion", "water", "wind", "soil"],
      questions: [
        {
          id: "q1",
          question: "What can cause erosion?",
          correctAnswer: "water and wind",
          distractors: ["sunlight", "rocks growing bigger"],
        },
      ],
      contentProfile: normalizeContentProfile({
        title: "Erosion Study Guide",
        type: "reading",
        words: ["erosion", "water", "wind", "soil"],
        questions: [],
        contentProfile: {
          practiceDomain: "reading",
          contentDomain: "science",
          topic: "erosion",
          primarySkill: "reading_comprehension",
          assignmentFormat: "study_guide",
          concepts: ["erosion", "water", "wind", "soil"],
        },
      }),
    });

    const config = buildConceptCheckConfigFromCapturedHomework({
      childId: "ila",
      homeworkId: "hw-reading-erosion",
      nodeId: "n-concept-check-hw-reading-erosion",
      captured,
    });
    const validation = validateActivityEngineConfig(config);

    expect(config.activityId).toBe("concept-check");
    expect(config.engine.mode).toBe("diagnostic");
    expect(config.topic).toBe("erosion");
    expect(config.targets.map((target) => target.id)).toEqual(
      expect.arrayContaining(["erosion", "water", "wind", "soil"]),
    );
    expect(config.rounds.length).toBeGreaterThanOrEqual(1);
    expect(config.appearance?.palette.bg2).toBe("#df7841");
    expect(config.appearance?.visuals.heroGlyph).toBe("mountain");
    expect(validation.ok).toBe(true);
  });

  it("requires diagnostic target evidence to be per-target and unscaffolded", () => {
    expect(validateActivityEvidenceEvent({
      type: "activity_target_result",
      activityId: "concept-check",
      nodeId: "n-concept-check",
      target: "erosion",
      correct: true,
      attemptedValue: "Water and wind",
      responseTime_ms: 1234,
      scaffoldLevel: 0,
      concept: "erosion",
      misconception: null,
    })).toMatchObject({ ok: true });

    expect(validateActivityEvidenceEvent({
      type: "activity_complete",
      activityId: "concept-check",
      nodeId: "n-concept-check",
      completed: true,
      accuracy: 0.8,
      targetResults: [],
    })).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: "completion_requires_target_results" })],
    });
  });
});

describe("letter rush config contract", () => {
  const letterRushConfig: LetterRushConfig = {
    schemaVersion: 1,
    activityId: "letter-rush",
    mode: "mastery-run",
    topic: "Week 5 spelling",
    domain: "spelling",
    learningGoal: "Check whether the child can spell the weekly words without seeing them.",
    gradeBand: "early_elementary",
    appearance: {
      palette: {
        bg1: "#1B0B3A",
        bg2: "#5B21B6",
        bg3: "#070010",
        accent: "#F59E0B",
      },
      backgroundImage: "/assets/letter-rush/week-5-space.webp",
      fallbackBackground: "radial-gradient(ellipse 100% 70% at 50% 0%, #5B21B6 0%, #1B0B3A 50%, #070010 100%)",
    },
    scaffolds: {
      showWord: false,
      letterBank: false,
      allowRetryBeforeScore: false,
      companionHints: false,
    },
    words: [
      {
        id: "farmer",
        text: "farmer",
        definition: "A person who grows food or raises animals.",
        sentence: "The farmer planted seeds.",
        traps: ["farmar", "farner"],
        imposterChunks: ["ar", "or", "ur", "ir"],
        targetPatterns: ["er-ending"],
      },
    ],
    trap: {
      goal: 4,
      timerSeconds: 20,
      imposterSpawnRate: 0.76,
      maxVisibleChunks: 5,
      spawnInterval_ms: 780,
      fallDuration_ms: 4100,
    },
    bonusRound: {
      enabled: true,
      unlockAccuracy: 0.8,
      unlockStreak: 4,
      goal: 5,
      timerSeconds: 12,
      imposterSpawnRate: 0.84,
      maxVisibleChunks: 6,
      spawnInterval_ms: 620,
      fallDuration_ms: 3300,
      speedMultiplier: 1.25,
      stake: 20,
      multiplier: 3,
      riskSource: "session_earnings",
    },
    sfx: {
      enabled: true,
      arcadeCombos: true,
      comboThreshold: 3,
      heatingUpEvery: 5,
      comboBreakerStreak: 8,
      comboBreakerEvery: 5,
      comboMilestoneEvery: 5,
      comboVolume: 0.9,
      comboBreakerSrc: "/sfx/pronunciation/combo_breaker.mp3",
      eventMap: {
        start: { effect: "start" },
        prompt: { effect: "prompt-chime" },
        correct: { effect: "letter-correct" },
        combo: { effect: "combo" },
        heatingUp: { effect: "heating-up" },
        wordClear: { effect: "word-clear" },
        lifeLost: { effect: "life-lost" },
        bonusStart: { effect: "heating-up" },
        bonusWin: { effect: "word-clear" },
      },
      comboMilestones: [
        { minStreak: 5, label: "COMBO BREAKER!", effect: "combo-breaker", src: "/sfx/pronunciation/combo_breaker.mp3" },
        { minStreak: 10, label: "ON FIRE!", effect: "on-fire" },
        { minStreak: 15, label: "MEGA STREAK!", effect: "mega-streak" },
      ],
    },
    evidencePolicy: {
      writesPracticeEvidence: true,
      writesMasteryEvidence: true,
      requiresPerTargetResult: true,
      allowedEvidence: ["practice", "mastery"],
    },
  };

  it("accepts AI-selected Letter Rush modes as config, not UI state", () => {
    const modes: LetterRushConfig["mode"][] = [
      "type-and-spell",
      "hear-and-spell",
      "read-and-race",
      "trap-the-imposter",
      "mastery-run",
    ];

    for (const mode of modes) {
      const result = validateLetterRushConfig({
        ...letterRushConfig,
        mode,
        evidencePolicy: {
          ...letterRushConfig.evidencePolicy,
          writesMasteryEvidence:
            mode === "type-and-spell" ||
            mode === "hear-and-spell" ||
            mode === "mastery-run",
          allowedEvidence: mode === "read-and-race" || mode === "trap-the-imposter"
            ? ["practice"]
            : ["practice", "mastery"],
        },
      });

      expect(result.ok).toBe(true);
      expect(result.normalized?.mode).toBe(mode);
      expect(result.normalized?.trap).toMatchObject({ goal: 4, timerSeconds: 20 });
      expect(result.normalized?.bonusRound).toMatchObject({
        enabled: true,
        riskSource: "session_earnings",
        stake: 20,
      });
      expect(result.normalized?.sfx).toMatchObject({
        enabled: true,
        arcadeCombos: true,
        comboThreshold: 3,
        comboBreakerStreak: 8,
        comboBreakerEvery: 5,
        comboMilestoneEvery: 5,
        comboVolume: 0.9,
        comboBreakerSrc: "/sfx/pronunciation/combo_breaker.mp3",
        eventMap: expect.objectContaining({
          start: expect.objectContaining({ effect: "start" }),
          prompt: expect.objectContaining({ effect: "prompt-chime" }),
          correct: expect.objectContaining({ effect: "letter-correct" }),
          wordClear: expect.objectContaining({ effect: "word-clear" }),
        }),
        comboMilestones: expect.arrayContaining([
          expect.objectContaining({ minStreak: 5, effect: "combo-breaker" }),
          expect.objectContaining({ minStreak: 10, effect: "on-fire" }),
          expect.objectContaining({ minStreak: 15, effect: "mega-streak" }),
        ]),
      });
    }
  });

  it("rejects Mastery Run when any scaffold contaminates the first attempt", () => {
    for (const scaffold of ["showWord", "letterBank", "allowRetryBeforeScore", "companionHints"] as const) {
      const result = validateLetterRushConfig({
        ...letterRushConfig,
        scaffolds: {
          ...letterRushConfig.scaffolds,
          [scaffold]: true,
        },
      });

      expect(result.ok).toBe(false);
      expect(result.errors).toContainEqual(expect.objectContaining({
        code: "letter_rush_mastery_scaffolded",
        path: `scaffolds.${scaffold}`,
      }));
    }
  });

  it("keeps Read & Race and Trap the Imposter as practice-only evidence", () => {
    for (const mode of ["read-and-race", "trap-the-imposter"] as const) {
      const result = validateLetterRushConfig({
        ...letterRushConfig,
        mode,
        evidencePolicy: {
          ...letterRushConfig.evidencePolicy,
          writesMasteryEvidence: true,
        },
      });

      expect(result.ok).toBe(false);
      expect(result.errors).toContainEqual(expect.objectContaining({
        code: "letter_rush_mode_not_mastery_eligible",
        path: "evidencePolicy.writesMasteryEvidence",
      }));
    }
  });

  it("allows local or data background images and rejects external network images", () => {
    expect(validateLetterRushConfig(letterRushConfig).ok).toBe(true);
    expect(validateLetterRushConfig({
      ...letterRushConfig,
      appearance: {
        ...letterRushConfig.appearance,
        backgroundImage: "data:image/webp;base64,AAAA",
      },
    }).ok).toBe(true);

    const result = validateLetterRushConfig({
      ...letterRushConfig,
      appearance: {
        ...letterRushConfig.appearance,
        backgroundImage: "https://example.com/space.webp",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: "letter_rush_background_not_local",
      path: "appearance.backgroundImage",
    }));
  });
});
