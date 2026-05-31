import { describe, expect, it } from "vitest";
import {
  deriveBossBriefFromQuestEvidence,
  prepareQuestBossCandidates,
  questBossChoiceEventInput,
  selectQuestBossCandidate,
  type QuestBossCandidate,
  type QuestBossEvidence,
  type QuestBossExperienceSkin,
} from "./questBossTeamPipeline";
import {
  domainMechanicForQuestBoss,
  renderQuestBossFreeVisionShell,
  renderQuestBossShell,
} from "./questBossExperienceShell";
import { validateGeneratedGame } from "../scripts/validateGeneratedGame";

function skin(overrides: Partial<QuestBossExperienceSkin> = {}): QuestBossExperienceSkin {
  return {
    theme: "secret spelling vault",
    visualIntensity: "high",
    worldImagePath: "/tmp/secret-vault-world.png",
    cardImagePath: "/tmp/secret-vault-card.png",
    palette: {
      background: "#08111f",
      surface: "#101a33",
      accent: "#64f4d4",
      glow: "#ffe46b",
      text: "#fff7e1",
    },
    focalObject: "locked crystal vault",
    mechanicMetaphor: "Spell the hidden word to unlock the vault charge.",
    companionLines: ["The vault is reacting to your spelling.", "No answer is shown until you create it."],
    rewardMoment: "The vault opens and releases a rare light shard.",
    wrapperTraits: ["mystery", "control", "rare reward"],
    ...overrides,
  };
}

const baseCandidates: QuestBossCandidate[] = [
  {
    candidateId: "quest-vault",
    kind: "quest",
    status: "validated_available",
    title: "Secret Spelling Vault",
    purpose: "Mystery recall",
    description: "Unlock the vault by spelling comparative clues from memory.",
    wrapperTraits: ["mystery", "control"],
    targetWords: ["faster", "fastest"],
    evidenceRole: "intervention",
    validationSummary: "card_validated",
    experienceSkin: skin(),
  },
  {
    candidateId: "quest-arena",
    kind: "quest",
    status: "validated_available",
    title: "Championship Arena",
    purpose: "Competitive recall",
    description: "Win rounds by spelling suffix words under light pressure.",
    wrapperTraits: ["competition", "streak"],
    targetWords: ["slower", "slowest"],
    evidenceRole: "intervention",
    validationSummary: "card_validated",
    experienceSkin: skin({
      theme: "championship arena",
      visualIntensity: "balanced",
      worldImagePath: "/tmp/arena-world.png",
      cardImagePath: "/tmp/arena-card.png",
      focalObject: "scoreboard gate",
      mechanicMetaphor: "Spell each hidden word to charge the arena gate.",
      wrapperTraits: ["competition", "streak"],
    }),
  },
];

const questEvidence: QuestBossEvidence = {
  nodeId: "node-4-quest",
  contentId: "content-quest-vault",
  kind: "quest",
  completedAt: "2026-05-29T12:00:00.000Z",
  accuracy: 0.75,
  targetResults: [
    { target: "faster", correct: true, attempts: 1, recovered: false },
    { target: "fastest", correct: false, attempts: 2, recovered: true },
    { target: "slower", correct: true, attempts: 1, recovered: false },
    { target: "slowest", correct: false, attempts: 3, recovered: false },
  ],
  engagement: {
    selectedCandidateId: "quest-vault",
    replayRequested: false,
    activePlayTime_ms: 92_000,
    frustrationScore: 0.2,
  },
};

describe("quest boss team pipeline", () => {
  it("blocks Boss candidate preparation until Quest evidence exists", async () => {
    const result = await prepareQuestBossCandidates({
      childId: "reina",
      kind: "boss",
      homeworkId: "hw-spelling_test-2da310ad",
      nodeId: "node-5-boss",
      choiceSetId: "boss-choice",
      assignment: {
        domain: "spelling",
        title: "Benchmark Advance Spelling Unit 8 Week 3",
        targetWords: ["faster", "fastest"],
        concepts: ["comparative suffixes"],
      },
      baselineEvidence: [{ nodeId: "node-1", summary: "spell-check complete" }],
      generator: async () => baseCandidates.map((candidate) => ({ ...candidate, kind: "boss" })),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected boss block");
    expect(result.reason).toBe("quest_evidence_required");
    expect(result.candidates).toEqual([]);
  });

  it("does not treat a card-only candidate as validated playable", async () => {
    const cardOnly = baseCandidates.map(({ experienceSkin, ...candidate }) => candidate);
    const result = await prepareQuestBossCandidates({
      childId: "reina",
      kind: "quest",
      homeworkId: "hw-spelling_test-2da310ad",
      nodeId: "node-4-quest",
      choiceSetId: "quest-choice",
      assignment: {
        domain: "spelling",
        title: "Benchmark Advance Spelling Unit 8 Week 3",
        targetWords: ["faster", "fastest"],
        concepts: ["comparative suffixes"],
      },
      baselineEvidence: [{ nodeId: "node-1", summary: "spell-check complete" }],
      generator: async () => cardOnly,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected missing skin block");
    expect(result.reason).toBe("candidate_missing_experience_skin");
    expect(result.candidates).toEqual([]);
  });

  it("derives Boss brief from Quest evidence rather than a disconnected game", () => {
    const brief = deriveBossBriefFromQuestEvidence({
      childId: "reina",
      homeworkId: "hw-spelling_test-2da310ad",
      assignmentTitle: "Benchmark Advance Spelling Unit 8 Week 3",
      questEvidence,
      now: new Date("2026-05-29T13:00:00.000Z"),
    });

    expect(brief.kind).toBe("boss");
    expect(brief.title).toMatch(/final|boss|mastery/i);
    expect(brief.evidenceUsed).toContain("content-quest-vault");
    expect(brief.targetWords).toEqual(["fastest", "slowest", "faster", "slower"]);
    expect(brief.learningGoal).toMatch(/transfer|mastery/i);
  });

  it("marks selected candidate siblings as not_selected, not discarded", async () => {
    const result = await selectQuestBossCandidate({
      childId: "reina",
      kind: "quest",
      nodeId: "node-4-quest",
      choiceSetId: "quest-choice",
      candidates: baseCandidates,
      selectedCandidateId: "quest-vault",
      buildArtifact: async () => ({
        ok: true,
        filename: "quest-vault.html",
        contentId: "content-quest-vault",
        validationReport: { passed: true, score: 100, failures: [], warnings: [] },
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.selected.status).toBe("selected");
    expect(result.notSelectedCandidateIds).toEqual(["quest-arena"]);
    expect(result.lifecycle.map((candidate) => [candidate.candidateId, candidate.status])).toEqual([
      ["quest-vault", "selected"],
      ["quest-arena", "not_selected"],
    ]);
  });

  it("keeps failed generated artifacts unavailable and records validation_failed", async () => {
    const result = await selectQuestBossCandidate({
      childId: "reina",
      kind: "quest",
      nodeId: "node-4-quest",
      choiceSetId: "quest-choice",
      candidates: baseCandidates,
      selectedCandidateId: "quest-vault",
      buildArtifact: async () => ({
        ok: false,
        reason: "generated_game_validation_failed",
        validationReport: { passed: false, score: 40, failures: ["missing attempts"], warnings: [] },
      }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected validation failure");
    expect(result.reason).toBe("generated_game_validation_failed");
    expect(result.lifecycle.find((candidate) => candidate.candidateId === "quest-vault")?.status)
      .toBe("validation_failed");
    expect(result.lifecycle.find((candidate) => candidate.candidateId === "quest-arena")?.status)
      .toBe("not_selected");
  });

  it("records Quest/Boss card selection as choice evidence without mastery proof", () => {
    const event = questBossChoiceEventInput({
      childId: "reina",
      nodeId: "node-4-quest",
      kind: "quest",
      choiceSetId: "quest-choice",
      candidates: baseCandidates,
      selectedCandidateId: "quest-vault",
      createdAt: "2026-05-29T12:10:00.000Z",
    });

    expect(event.context).toBe("quest");
    expect(event.source).toBe("child_choice");
    expect(event.selectedOptionId).toBe("quest-vault");
    expect(event.skippedOptionIds).toEqual(["quest-arena"]);
    expect(event.shownOptions[0]?.thumbnailUrl).toBe("/tmp/secret-vault-card.png");
    expect(event.completed).toBeUndefined();
    expect(event.accuracy).toBeUndefined();
  });

  it("maps domain mechanics into native interaction language instead of worksheet clothing", () => {
    const spellingMechanic = domainMechanicForQuestBoss("spelling");

    expect(spellingMechanic.measuredSkill).toBe("hidden spelling recall");
    expect(spellingMechanic.actionLanguage).toMatch(/unlock|charge|repair/i);
    expect(spellingMechanic.actionLanguage).not.toMatch(/worksheet|quiz card/i);
  });

  it("renders the selected candidate skin into the trusted Quest/Boss shell", () => {
    const html = renderQuestBossShell({
      candidate: baseCandidates[0]!,
      assignment: {
        domain: "spelling",
        title: "Benchmark Advance Spelling Unit 8 Week 3",
        targetWords: ["faster", "fastest"],
        concepts: ["comparative suffixes"],
      },
    });

    expect(html).toContain("/games/_contract.js");
    expect(html).toContain('id="sunny-companion"');
    expect(html).toContain("fireAttemptEvent");
    expect(html).toContain("sendNodeComplete");
    expect(html).toContain("SUNNY_VALIDATION_HOOKS");
    expect(html).toContain("/tmp/secret-vault-world.png");
    expect(html).toContain("locked crystal vault");
    expect(html).toContain("Spell the hidden word to unlock the vault charge.");
    expect(html).not.toContain("faster");
    expect(html).not.toContain("fastest");
    expect(html).not.toContain("Quest intervention");
    expect(html).not.toContain("Boss mastery gate");
    expect(html).not.toContain("hidden spelling answer");
    expect(html).not.toContain("Signal recorded. The shell keeps the evidence.");
    expect(html).not.toContain("class=\"sigil\"");
  });

  it("scrubs generated child-facing copy that would trip static feedback validation", () => {
    const riskyCopyCandidate: QuestBossCandidate = {
      ...baseCandidates[0]!,
      experienceSkin: skin({
        mechanicMetaphor: "Spell correctly so wrong guesses do not cause error storms.",
        companionLines: ["Correctly launch the gate; wrong guesses shake the room."],
        rewardMoment: "Success opens the vault.",
      }),
    };
    const html = renderQuestBossShell({
      candidate: riskyCopyCandidate,
      assignment: {
        domain: "spelling",
        title: "Benchmark Advance Spelling Unit 8 Week 3",
        targetWords: ["faster", "fastest"],
        concepts: ["comparative suffixes"],
      },
    });
    const validation = validateGeneratedGame(html, {
      words: ["faster", "fastest"],
      homeworkType: "spelling_test",
      childId: "reina",
      generationStage: "quest",
    });

    expect(html).not.toContain("wrong guesses");
    expect(html).not.toContain("error storms");
    expect(validation.failures).not.toContain("Correct and wrong feedback may fire from same code path");
  });

  it("renders free-vision as the raw generated image with minimal Sunny evidence plumbing", () => {
    const html = renderQuestBossFreeVisionShell({
      candidate: baseCandidates[0]!,
      assignment: {
        domain: "spelling",
        title: "Benchmark Advance Spelling Unit 8 Week 3",
        targetWords: ["faster", "fastest"],
        concepts: ["comparative suffixes"],
      },
    });

    expect(html).toContain('data-free-vision-runtime="true"');
    expect(html).toContain('data-overlay-policy="minimal"');
    expect(html).toContain('data-free-vision-raw-image');
    expect(html).toContain("/tmp/secret-vault-world.png");
    expect(html).toContain("object-fit:contain");
    expect(html).toContain("/games/_contract.js");
    expect(html).toContain('id="sunny-companion"');
    expect(html).toContain("fireAttemptEvent");
    expect(html).toContain("sendNodeComplete");
    expect(html).toContain("SUNNY_VALIDATION_HOOKS");
    expect(html).not.toContain("faster");
    expect(html).not.toContain("fastest");
    expect(html).not.toContain('class="hud"');
    expect(html).not.toContain("stage-label");
    expect(html).not.toContain("focus-pulse");
    expect(html).not.toContain("linear-gradient(180deg");
    expect(html).not.toContain("backdrop-filter");
    expect(html).not.toContain("Quest unlocked");
    expect(html).not.toContain("Final gate");
  });

  it("makes free-vision a stateful challenge with VFX and SFX cues, not just static art plus input", () => {
    const html = renderQuestBossFreeVisionShell({
      candidate: baseCandidates[0]!,
      assignment: {
        domain: "spelling",
        title: "Benchmark Advance Spelling Unit 8 Week 3",
        targetWords: ["faster", "fastest"],
        concepts: ["comparative suffixes"],
      },
    });

    expect(html).toContain('data-progress="0"');
    expect(html).toContain('data-vfx-state="idle"');
    expect(html).toContain('class="charge-fill"');
    expect(html).toContain('class="round-pips"');
    expect(html).toContain("applyWorldReaction");
    expect(html).toContain("playSfxCue");
    expect(html).toContain("AudioContext");
    expect(html).toContain("quest_boss_sfx_cue");
    expect(html).toContain("quest_boss_vfx_state");
    expect(html).toContain("window.__sunnyQuestBossStateSnapshots");
    expect(html).not.toContain('class="hud"');
  });

  it("keeps free-vision static validation strict while target words stay out of saved HTML", () => {
    const html = renderQuestBossFreeVisionShell({
      candidate: baseCandidates[0]!,
      assignment: {
        domain: "spelling",
        title: "Benchmark Advance Spelling Unit 8 Week 3",
        targetWords: ["faster", "fastest"],
        concepts: ["comparative suffixes"],
      },
    });
    const validation = validateGeneratedGame(html, {
      words: ["faster", "fastest"],
      homeworkType: "spelling_test",
      childId: "reina",
      generationStage: "quest",
    });

    expect(html).not.toContain("faster");
    expect(html).not.toContain("fastest");
    expect(validation.failures).toEqual([]);
  });
});
