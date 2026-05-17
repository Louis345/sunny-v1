import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getSyntheticChildPersonas,
  buildLabAssertionPlan,
  buildCompanionContractFailures,
  buildLabMissCoverage,
  buildReadinessGate,
  runSyntheticSpellingLab,
} from "./syntheticChildLab";

describe("Sunny Synthetic Child Lab", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function root(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-synthetic-lab-"));
    roots.push(dir);
    return dir;
  }

  it("defines spelling personas with mastery definitions and expected adaptations", () => {
    const personas = getSyntheticChildPersonas("all");

    expect(personas.map((persona) => persona.id)).toEqual([
      "struggling_reader",
      "advanced_speller",
      "distracted_child",
      "confidence_sensitive",
    ]);
    for (const persona of personas) {
      expect(persona.masteryDefinition.requiresCleanRecall).toBe(true);
      expect(persona.masteryDefinition.scaffoldedSuccessIsNotMastery).toBe(true);
      expect(persona.expectedAdaptationBehavior.length).toBeGreaterThan(0);
      expect(persona.learningRisks.length).toBeGreaterThan(0);
    }
  });

  it("writes assertion plans before a run so failures cannot be justified after the fact", () => {
    const [persona] = getSyntheticChildPersonas("struggling_reader");
    const plan = buildLabAssertionPlan(persona!);

    expect(plan.personaId).toBe("struggling_reader");
    expect(plan.productTruth).toContain("No hidden answer leaks.");
    expect(plan.learningTruth).toContain("Visible answer is not clean recall.");
    expect(plan.adaptationTruth).toContain("Weak evidence routes to targeted support before quest or boss.");
    expect(plan.unlockTruth).toContain("Boss remains locked until quest evidence plus clean recall support readiness.");
    expect(plan.noveltyTruth).toContain("Novelty changes the intervention wrapper, not the academic target.");
  });

  it("runs all spelling personas in the sandbox and writes the full lab artifact set", async () => {
    const projectRoot = root();
    const report = await runSyntheticSpellingLab({
      rootDir: projectRoot,
      persona: "all",
      iterations: 3,
      generatedAt: "2026-05-17T12:00:00.000Z",
    });

    expect(report.childId).toBe("demo_adaptive");
    expect(report.personas).toHaveLength(4);
    expect(report.summary.personasRun).toBe(4);
    expect(report.summary.iterationsRun).toBe(12);
    expect(report.realChildSessionAllowed).toBe(false);
    expect(report.bugProposals.some((bug) => bug.code === "word_radar_answer_visible")).toBe(true);
    expect(report.bugProposals.some((bug) => bug.code === "pronunciation_contamination_risk")).toBe(true);

    const expectedFiles = [
      "persona.json",
      "assertions.before.json",
      "plan-before.json",
      "session-dirs.json",
      "game-traces.ndjson",
      "latency-spans.ndjson",
      "psychologist-packet.json",
      "plan-after.json",
      "adaptation-diff.json",
      "activity-efficacy.json",
      "bug-proposals.md",
      "lab-report.md",
    ];
    for (const file of expectedFiles) {
      expect(fs.existsSync(path.join(report.labDir, file))).toBe(true);
    }
    expect(fs.existsSync(path.join(report.labDir, "screenshots", "screenshot-manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, "src", "context", "ila"))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, "src", "context", "reina"))).toBe(false);
  });

  it("rates weak or buggy activities below real-session quality instead of treating all games as equal", async () => {
    const projectRoot = root();
    const report = await runSyntheticSpellingLab({
      rootDir: projectRoot,
      persona: "struggling_reader",
      iterations: 3,
      generatedAt: "2026-05-17T12:10:00.000Z",
    });

    const wordRadar = report.activityEfficacy.find((activity) => activity.activityId === "word-radar");
    const pronunciation = report.activityEfficacy.find((activity) => activity.activityId === "pronunciation");
    const spellCheck = report.activityEfficacy.find((activity) => activity.activityId === "spell-check");

    expect(wordRadar).toMatchObject({
      rating: "D",
      decision: "refactor",
    });
    expect(pronunciation).toMatchObject({
      rating: "D",
      decision: "refactor",
    });
    expect(spellCheck?.rating === "A" || spellCheck?.rating === "B").toBe(true);
  });

  it("optionally drives a browser target with the persona actions and records browser artifacts", async () => {
    const projectRoot = root();
    const browserUrl =
      'data:text/html,<button data-node-id="pronunciation">Pronunciation</button><button data-node-id="mystery">Mystery</button><button data-mystery-option="wheel-of-fortune">Wheel</button><input aria-label="answer" />';
    const report = await (
      runSyntheticSpellingLab as (opts: Record<string, unknown>) => Promise<
        ReturnType<typeof runSyntheticSpellingLab> extends Promise<infer T> ? T & { browserRuns?: unknown[] } : never
      >
    )({
      rootDir: projectRoot,
      persona: "struggling_reader",
      iterations: 1,
      generatedAt: "2026-05-17T12:20:00.000Z",
      browserUrl,
    });

    expect(report.browserRuns).toHaveLength(1);
    expect(fs.existsSync(path.join(report.labDir, "browser-runs.json"))).toBe(true);
    const screenshots = fs.readdirSync(path.join(report.labDir, "screenshots"));
    expect(screenshots.some((file) => file.endsWith("-start.png"))).toBe(true);
    expect(screenshots.some((file) => file.endsWith("-end.png"))).toBe(true);
  });

  it("uses real browser evidence to write readiness gate failures", async () => {
    const projectRoot = root();
    const browserUrl = `data:text/html,${encodeURIComponent(`
      <button data-node-id="pronunciation">Pronunciation</button>
      <button data-node-id="mystery">Mystery</button>
      <button data-mystery-option="wheel-of-fortune">Wheel</button>
      <script>
        document.querySelector("[data-node-id='pronunciation']").addEventListener("click", () => {
          window.postMessage({
            type: "game_state_update",
            payload: {
              activityId: "word-radar",
              phase: "response",
              currentWord: "machine",
              answerVisibility: "visible",
              evidenceTier: "clean_recall"
            }
          }, "*");
        });
      </script>
    `)}`;
    const report = await runSyntheticSpellingLab({
      rootDir: projectRoot,
      persona: "struggling_reader",
      iterations: 1,
      generatedAt: "2026-05-17T12:30:00.000Z",
      browserUrl,
    });

    expect(report.readinessGate.allowed).toBe(false);
    expect(report.readinessGate.highSeverityFailures).toContain(
      "Word Radar exposed answer during clean recall.",
    );
    expect(fs.existsSync(path.join(report.labDir, "browser-events.ndjson"))).toBe(true);
    expect(fs.existsSync(path.join(report.labDir, "activity-contract-failures.json"))).toBe(true);
    expect(fs.existsSync(path.join(report.labDir, "companion-contract-failures.json"))).toBe(true);
    expect(fs.existsSync(path.join(report.labDir, "readiness-gate.json"))).toBe(true);
  }, 15_000);

  it("does not turn synthetic scenario risks into product bugs when browser evidence is authoritative", async () => {
    const projectRoot = root();
    const browserUrl = `data:text/html,${encodeURIComponent(`
      <button data-node-id="pronunciation">Pronunciation</button>
      <button data-node-id="mystery">Mystery</button>
      <button data-mystery-option="wheel-of-fortune">Wheel</button>
      <script>
        document.querySelector("[data-node-id='pronunciation']").addEventListener("click", () => {
          window.postMessage({
            type: "game_state_update",
            payload: {
              activityId: "pronunciation",
              phase: "listening",
              currentWord: "government"
            }
          }, "*");
        });
      </script>
    `)}`;

    const report = await runSyntheticSpellingLab({
      rootDir: projectRoot,
      persona: "struggling_reader",
      iterations: 1,
      generatedAt: "2026-05-17T12:40:00.000Z",
      browserUrl,
    });

    expect(report.browserEvents.some((event) => event.activityId === "pronunciation")).toBe(true);
    expect(report.bugProposals.some((bug) => bug.code === "word_radar_answer_visible")).toBe(false);
    expect(report.bugProposals.some((bug) => bug.code === "pronunciation_contamination_risk")).toBe(false);
  }, 15_000);

  it("does not block full-browser readiness with synthetic placeholder latency spans", () => {
    const failures = buildCompanionContractFailures({
      browserUrl: "http://localhost:3001",
      browserEvents: [
        {
          source: "browser",
          eventType: "game_state_update",
          sessionId: "lab-struggling_reader-1",
          personaId: "struggling_reader",
          iteration: 1,
          activityId: "pronunciation",
          phase: "listening",
          timestamp: "2026-05-17T12:00:00.000Z",
        },
      ],
      latencySpans: [
        {
          type: "companion_latency_span",
          source: "synthetic_child_lab",
          childId: "demo_adaptive",
          sessionId: "lab-struggling_reader-1",
          personaId: "struggling_reader",
          utterance: "what word is it?",
          activityId: "spell-check",
          snapshotAge_ms: 120,
          firstToken_ms: 3200,
          firstAudio_ms: 4100,
          staleResponse: false,
          pass: false,
          timestamp: "2026-05-17T12:00:01.000Z",
        },
      ],
    });

    expect(failures).toEqual([]);
  });

  it("does not block a ready current path just because unused activities are certified blocked", () => {
    const gate = buildReadinessGate({
      activityContractFailures: [],
      companionContractFailures: [],
      activityEfficacy: [
        {
          activityId: "pronunciation",
          displayName: "Pronunciation",
          rating: "B",
          decision: "keep",
          diagnosticClarity: "clear",
          evidenceQuality: "usable",
          masteryValidity: "practice only",
          bugRisk: "none",
          flowValue: "high",
          adaptationValue: "useful",
          coherence: "care-plan aligned",
          reasons: [],
        },
        {
          activityId: "word-builder",
          displayName: "Word Builder",
          rating: "Blocked",
          decision: "blocked",
          diagnosticClarity: "missing",
          evidenceQuality: "missing",
          masteryValidity: "no",
          bugRisk: "blocked",
          flowValue: "unknown",
          adaptationValue: "none",
          coherence: "blocked",
          reasons: [],
        },
      ],
    });

    expect(gate.allowed).toBe(true);
  });

  it("includes human-miss coverage in the spelling lab readiness report", async () => {
    const projectRoot = root();
    const report = await runSyntheticSpellingLab({
      rootDir: projectRoot,
      persona: "struggling_reader",
      iterations: 1,
      generatedAt: "2026-05-17T12:50:00.000Z",
    });

    expect(report.labMissCoverage.knownCount).toBeGreaterThanOrEqual(3);
    expect(report.labMissCoverage.items.map((item) => item.invariantCode)).toContain(
      "word_radar_audio_affordance_requires_narration",
    );
    expect(fs.existsSync(path.join(report.labDir, "lab-miss-coverage.json"))).toBe(true);
    expect(fs.readFileSync(path.join(report.labDir, "lab-report.md"), "utf8")).toContain(
      "## Lab Miss Coverage",
    );
  });

  it("blocks readiness when a known human-caught bug has no matching lab invariant", () => {
    const coverage = buildLabMissCoverage({
      coveredInvariantCodes: ["word_radar_audio_affordance_requires_narration"],
      requiredInvariantCodes: [
        "word_radar_audio_affordance_requires_narration",
        "word_radar_hidden_scaffold_not_fillable_boxes",
      ],
    });
    const gate = buildReadinessGate({
      activityContractFailures: [],
      companionContractFailures: [],
      labMissCoverage: coverage,
      activityEfficacy: [
        {
          activityId: "spell-check",
          displayName: "Spell Check",
          rating: "B",
          decision: "keep",
          diagnosticClarity: "clear",
          evidenceQuality: "usable",
          masteryValidity: "practice only",
          bugRisk: "none",
          flowValue: "high",
          adaptationValue: "useful",
          coherence: "care-plan aligned",
          reasons: [],
        },
      ],
    });

    expect(gate.allowed).toBe(false);
    expect(gate.highSeverityFailures).toContain(
      "Known human-caught bug lacks lab invariant coverage: word_radar_hidden_scaffold_not_fillable_boxes.",
    );
  });

  it("rejects real child ids for synthetic lab runs", async () => {
    await expect(
      runSyntheticSpellingLab({
        rootDir: root(),
        childId: "ila",
        persona: "struggling_reader",
      }),
    ).rejects.toThrow(/demo_adaptive/);
  });
});
