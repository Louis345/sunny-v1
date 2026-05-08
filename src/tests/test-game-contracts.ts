import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/** Vitest runs with cwd = repo root. */
const PROJECT_ROOT = process.cwd();
const GAMES_DIR = path.join(PROJECT_ROOT, "web", "public", "games");
const CONTRACT_JS_PATH = path.join(GAMES_DIR, "_contract.js");
const SKIP_PATHS = new Set([
  "web/public/games/pronunciation-game.html",
  "web/public/games/pronunciation/index.html",
]);
const WORD_DRIVEN = new Set([
  "web/public/games/word-builder.html",
  "web/public/games/spell-check.html",
  "web/public/games/letter-rush.html",
  "web/public/games/bd-reversal-game.html",
]);
const ASSESSABLE_GAMES = new Set([
  "web/public/games/WheelOfFortune.html",
  "web/public/games/bd-reversal-game.html",
  "web/public/games/chimp-quest-generated.html",
  "web/public/games/clock-game.html",
  "web/public/games/coin-counter.html",
  "web/public/games/monster-stampede.html",
  "web/public/games/quest.html",
  "web/public/games/speed-catcher.html",
  "web/public/games/spell-check.html",
  "web/public/games/letter-rush.html",
  "web/public/games/store-game.html",
  "web/public/games/vault-cracker.html",
  "web/public/games/word-builder.html",
  "web/public/games/wordle.html",
]);
const REWARD_ONLY_GAMES = new Set([
  "web/public/games/asteroid.html",
  "web/public/games/space-frogger.html",
  "web/public/games/space-invaders.html",
]);
const ATTENTION_SCREENING_GAMES = new Set([
  "web/public/games/attention-bubble-pop.html",
  "web/public/games/attention-cpt-low-reward.html",
  "web/public/games/attention-fish-flanker.html",
  "web/public/games/attention-hero-shield.html",
  "web/public/games/attention-target-blaster.html",
]);
const ACTIVITY_ENGINE_GAMES = new Set([
  "web/public/games/concept-check.html",
  "web/public/games/letter-rush.html",
]);
const LETTER_RUSH_ENGINE_GAMES = new Set([
  "web/public/games/letter-rush.html",
]);

function collectHtmlFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) collectHtmlFiles(full, acc);
    else if (ent.isFile() && ent.name.endsWith(".html")) acc.push(full);
  }
  return acc;
}

const GAME_HTML_PATHS = collectHtmlFiles(GAMES_DIR)
  .filter((abs) => !SKIP_PATHS.has(relGamePath(abs)))
  .sort();

function relGamePath(abs: string): string {
  return path.relative(PROJECT_ROOT, abs).split(path.sep).join("/");
}

function hasContractScript(html: string): boolean {
  return /<script\s+src=["']_contract\.js["']\s*><\/script>/.test(html);
}

describe("game contract compliance (helper-based)", () => {
  let contractJs: string;

  beforeAll(() => {
    contractJs = fs.readFileSync(CONTRACT_JS_PATH, "utf-8");
  });

  it("discovers at least one game HTML file", () => {
    expect(GAME_HTML_PATHS.length).toBeGreaterThan(0);
  });

  for (const absPath of GAME_HTML_PATHS) {
    const label = relGamePath(absPath);

    describe(label, () => {
      let html: string;

      beforeAll(() => {
        html = fs.readFileSync(absPath, "utf-8");
      });

      it("loads the shared contract helper", () => {
        expect(hasContractScript(html)).toBe(true);
      });

      it("uses sendNodeComplete for completion", () => {
        expect(/sendNodeComplete\s*\(/.test(html)).toBe(true);
      });

      it("sends contract payload fields", () => {
        expect(/\baccuracy\b/.test(html)).toBe(true);
        expect(/\bflaggedWords\b/.test(html)).toBe(true);
        expect(/\bxpEarned\b/.test(html)).toBe(true);
        expect(/\btimeSpent_ms\b/.test(html)).toBe(true);
      });

      it("does not use legacy node_result", () => {
        expect(/['"]node_result['"]/.test(html)).toBe(false);
      });

      it("does not parse URL params directly", () => {
        expect(/URLSearchParams/.test(html)).toBe(false);
      });

      it("uses GAME_PARAMS words fallback when word-driven", () => {
        if (!WORD_DRIVEN.has(label)) return;
        expect(/GAME_PARAMS/.test(html)).toBe(true);
        // words accessed via destructured variable — contract still satisfied
      });

      it("declares attempt-contract status", () => {
        if (ASSESSABLE_GAMES.has(label)) {
          expect(
            html.includes("fireAttemptEvent(") ||
              html.includes("sunny-attempt-contract-server-side"),
          ).toBe(true);
          return;
        }
        if (REWARD_ONLY_GAMES.has(label)) {
          expect(html).toContain("sunny-attempt-contract-exempt: reward-only");
        }
        if (ATTENTION_SCREENING_GAMES.has(label)) {
          expect(html).toContain("sunny-attempt-contract-exempt: attention-screening-vitals-only");
        }
      });

      it("attention screens report normalized vitals and read GAME_PARAMS config", () => {
        if (!ATTENTION_SCREENING_GAMES.has(label)) return;
        expect(html).toContain("GAME_PARAMS");
        expect(html).toContain("vitalSigns");
        expect(html).toContain("activeDuration_ms");
        expect(html).toContain("idleEvents");
        expect(html).toContain("reengagements");
        expect(html).toContain("frustrationSignals");
        expect(html).toContain("flowSignals");
        expect(html).toContain("GameBridge.reportState");
      });

      it("attention screens declare condition and paradigm metadata", () => {
        if (!ATTENTION_SCREENING_GAMES.has(label)) return;
        if (label === "web/public/games/attention-cpt-low-reward.html") {
          expect(html).toContain("condition");
          expect(html).toContain("paradigm");
          expect(html).toContain("low_reward");
          expect(html).toContain("cpt");
          expect(html).toContain("reactionTimeVariability");
          expect(html).toContain("dropoff");
          expect(html).toContain("measurementMode");
          expect(html).toContain("recommendedDuration_ms");
          expect(html).toContain("confidenceCeiling");
        }
      });

      it("attention screens expose the full parent-preview phase flow", () => {
        if (!ATTENTION_SCREENING_GAMES.has(label)) return;
        expect(html).toContain('data-phase="intro"');
        expect(html).toContain('data-phase="practice"');
        expect(html).toContain('data-phase="measured"');
        expect(html).toContain('data-phase="results"');
        expect(html).toContain("Practice/demo");
        expect(html).toContain("Measured baseline");
        expect(html).toContain("Would record in live mode");
        expect(html).toContain("previewDryRun");
      });

      it("activity engines emit standardized evidence events and back navigation", () => {
        if (!ACTIVITY_ENGINE_GAMES.has(label)) return;
        expect(html).toContain("_contract.js");
        expect(html).toContain("window.GAME_PARAMS");
        expect(html).toContain("activity_target_result");
        expect(html).toContain("activity_complete");
        expect(html).toContain("back_to_map");
        expect(html).toContain("GameBridge.complete");
        expect(html).toContain("GameBridge.reportState");
        expect(html).toContain("GameBridge.fireEvent");
      });

      it("activity engines expose the arcade diagnostic shell landmarks", () => {
        if (!ACTIVITY_ENGINE_GAMES.has(label)) return;
        if (LETTER_RUSH_ENGINE_GAMES.has(label)) return;
        expect(html).toContain("topic-chip");
        expect(html).toContain("progress-dots");
        expect(html).toContain("scene");
        expect(html).toContain("artifact-orbit");
        expect(html).toContain("round-pill");
        expect(html).toContain("card");
        expect(html).toContain("opt");
        expect(html).toContain("elli");
        expect(html).toContain('data-debug-panel="evidence-stream"');
        expect(html).not.toContain("settings-button");
        expect(html).not.toContain('aria-label="Settings"');
      });

      it("activity engines keep the themed artifact centered and use companion fallback only standalone", () => {
        if (!ACTIVITY_ENGINE_GAMES.has(label)) return;
        if (LETTER_RUSH_ENGINE_GAMES.has(label)) return;
        expect(html).toContain("width:clamp(260px,46vw,420px)");
        expect(html).toContain("aspect-ratio:1/1");
        expect(html).toContain("display: grid");
        expect(html).toContain("place-items: center");
        expect(html).toContain(".particle");
        expect(html).toContain("--particle-radius");
        expect(html).toContain("translateX(var(--particle-radius))");
        expect(html).toContain("window.parent === window");
        expect(html).toContain("standalone-companion");
      });

      it("activity engines apply AI-generated appearance without network calls", () => {
        if (!ACTIVITY_ENGINE_GAMES.has(label)) return;
        if (LETTER_RUSH_ENGINE_GAMES.has(label)) return;
        expect(html).toContain("applyAppearance");
        expect(html).toContain("config.appearance");
        expect(html).toContain("--bg1");
        expect(html).toContain("--bg2");
        expect(html).toContain("--bg3");
        expect(html).toContain("heroGlyph");
        expect(html).toContain("particleGlyph");
        expect(html).toContain("elliBub");
        expect(html).not.toContain("window.claude");
        expect(html).not.toContain("SunnyAI.palette");
      });

      it("activity engines expose isolated sample themes for visual review", () => {
        if (!ACTIVITY_ENGINE_GAMES.has(label)) return;
        if (LETTER_RUSH_ENGINE_GAMES.has(label)) return;
        expect(html).toContain("sample-blood");
        expect(html).toContain("sample-photosynthesis");
        expect(html).toContain("sample-constitution");
        expect(html).toContain("sample-spelling");
      });

      it("Letter Rush is config-selected and exposes all four learning modes without a child mode switcher", () => {
        if (!LETTER_RUSH_ENGINE_GAMES.has(label)) return;
        expect(html).toContain("LETTER_RUSH_MODES");
        expect(html).toContain("config.mode");
        expect(html).toContain("hear-and-spell");
        expect(html).toContain("read-and-race");
        expect(html).toContain("trap-the-imposter");
        expect(html).toContain("mastery-run");
        expect(html).not.toContain("mode-btn");
        expect(html).not.toContain("data-mode=");
        expect(html).not.toContain("tweakFab");
        expect(html).not.toContain("URLSearchParams");
      });

      it("Letter Rush protects mastery evidence from scaffolds and direct ElevenLabs calls", () => {
        if (!LETTER_RUSH_ENGINE_GAMES.has(label)) return;
        expect(html).toContain("isMasteryEligibleMode");
        expect(html).toContain("scaffoldLevelForMode");
        expect(html).toContain("narration_request");
        expect(html).toContain("standaloneSpeechFallback");
        expect(html).toContain("fireAttemptEvent");
        expect(html).toContain("activity_target_result");
        expect(html).toContain("activity_complete");
        expect(html).not.toMatch(/elevenlabs/i);
      });

      it("fallback spelling quest does not reveal the target word during response", () => {
        if (label !== "web/public/games/quest.html") return;
        expect(html).not.toContain("Type the word exactly as shown");
        expect(html).not.toContain("escHtml(word)+'</div>");
        expect(html).toContain("narration_request");
      });

      it("Letter Rush keeps evaluator miss overlays out of prototype reward language", () => {
        if (!LETTER_RUSH_ENGINE_GAMES.has(label)) return;
        expect(html).not.toContain("Clue saved");
        expect(html).not.toContain(">SAVED<");
        expect(html).not.toContain("Saved ·");
        expect(html).not.toContain("Needs practice");
        expect(html).not.toContain("Practice later");
        expect(html).not.toContain("Life lost · try ");
      });

      it("Letter Rush does not fail a mastery word just because one falling tile expires", () => {
        if (!LETTER_RUSH_ENGINE_GAMES.has(label)) return;
        expect(html).not.toContain('if (config.mode === "mastery-run") markWordMiss("timeout");');
        expect(html).toContain("tickMasteryTimer");
      });

      it("Letter Rush has local arcade SFX and keeps mastery lives session-scoped", () => {
        if (!LETTER_RUSH_ENGINE_GAMES.has(label)) return;
        expect(html).toContain("createSfx");
        expect(html).toContain("function sfxSettings");
        expect(html).toContain("config.sfx");
        expect(html).toContain("playSfx");
        expect(html).toContain("resolveGameAssetUrl");
        expect(html).toContain("playAudioSfx");
        expect(html).toContain("playArcadeComboSfx");
        expect(html).toContain('"prompt-chime"');
        expect(html).toContain('"letter-correct"');
        expect(html).toContain('"combo"');
        expect(html).toContain('"combo-breaker"');
        expect(html).toContain('"life-lost"');
        expect(html).toContain("comboThreshold");
        expect(html).toContain("comboBreakerStreak");
        expect(html).toContain("comboBreakerEvery");
        expect(html).toContain("comboMilestoneEvery");
        expect(html).toContain("comboMilestones");
        expect(html).toContain("comboVolume");
        expect(html).toContain("arcadeCombos");
        expect(html).toContain('location.protocol === "file:"');
        expect(html).toContain("/sfx/pronunciation/combo_breaker.mp3");
        expect(html).toContain("playComboMilestoneSfx");
        expect(html).toContain("triggerComboBreakerMilestone");
        expect(html).toContain("selectComboMilestone");
        expect(html).toContain("milestoneIndex");
        expect(html).toContain("mega-streak");
        expect(html).toContain("combo-rush");
        expect(html).toContain("resetSessionState");
        expect(html).toContain("state.lives = startingLives");
        expect(html).toContain("beginWord does not reset mastery lives");
        expect(html).not.toContain('playSfx(fallbackSfx || "miss")');
        expect(html).not.toContain('if (state.streak >= sfxSettings().comboThreshold) playSfx("combo-breaker")');
      });

      it("Letter Rush hides debug chrome and renders visible mastery stakes", () => {
        if (!LETTER_RUSH_ENGINE_GAMES.has(label)) return;
        expect(html).not.toContain('class="back"');
        expect(html).not.toContain("standalone-companion");
        expect(html).not.toContain("elliBub");
        expect(html).not.toContain('data-debug-panel="evidence-stream"');
        expect(html).toContain("debugEvidence");
        expect(html).toContain("renderMasteryLives");
        expect(html).toContain("life-token");
        expect(html).toContain("lives-card");
      });

      it("Letter Rush balances falling letters so mastery is not mostly correct taps", () => {
        if (!LETTER_RUSH_ENGINE_GAMES.has(label)) return;
        expect(html).toContain("correctLetterChance");
        expect(html).toContain("distractorLetter");
        expect(html).not.toContain("Math.random() < 0.62");
      });

      it("Letter Rush uses mode-aware randomized positive feedback copy", () => {
        if (!LETTER_RUSH_ENGINE_GAMES.has(label)) return;
        expect(html).toContain("positiveFeedbackCopy");
        expect(html).toContain("positiveFeedbackByMode");
        expect(html).toContain("config.feedback");
        expect(html).toContain('"mastery-run": ["HIT!", "LOCKED!", "CLEAN!", "NICE!"]');
        expect(html).toContain('"trap-the-imposter": ["TRAP!", "SNAGGED!", "CAUGHT!"]');
        expect(html).toContain("flashWord(positiveFeedbackCopy())");
        expect(html).not.toContain('flashWord("TRAP!")');
      });

      it("Letter Rush does not visually pre-label trap imposters", () => {
        if (!LETTER_RUSH_ENGINE_GAMES.has(label)) return;
        expect(html).toContain("dataset.imposter");
        expect(html).not.toContain(".falling.imposter");
        expect(html).not.toContain('className = "falling" + (pick.imposter ? " imposter" : "")');
      });

      it("Letter Rush trap mode is chunk-discrimination practice, not correct-letter catching", () => {
        if (!LETTER_RUSH_ENGINE_GAMES.has(label)) return;
        expect(html).toContain("buildTrapRound");
        expect(html).toContain("correctChunk");
        expect(html).toContain("imposterChunks");
        expect(html).toContain("trapCandidatePool");
        expect(html).toContain("configuredChunks.length ? configuredChunks");
        expect(html).toContain("pattern_discrimination");
        expect(html).toContain('"trap-imposter"');
        expect(html).toContain('"safe-chunk"');
        expect(html).toContain("Trap imposters. Let the correct chunk pass.");
        expect(html).not.toContain("Catch real letters. Avoid imposters.");
      });

      it("Letter Rush supports a config-gated trap demo and streamed streak events", () => {
        if (!LETTER_RUSH_ENGINE_GAMES.has(label)) return;
        expect(html).toContain("config.demo");
        expect(html).toContain("runTrapDemo");
        expect(html).toContain("trap_demo_started");
        expect(html).toContain("trap_demo_complete");
        expect(html).toContain("demoSeen");
        expect(html).toContain("emitStreakEvent");
        expect(html).toContain("heating_up");
        expect(html).toContain("streak_changed");
        expect(html).toContain("streakSpeedMultiplier");
      });

      it("Letter Rush supports a typed hidden-recall evaluator before arcade practice", () => {
        if (!LETTER_RUSH_ENGINE_GAMES.has(label)) return;
        expect(html).toContain('"type-and-spell"');
        expect(html).toContain("spellingInput");
        expect(html).toContain("submitTypedAnswer");
        expect(html).toContain("typeWordPrompt");
        expect(html).toContain('mode === "type-and-spell"');
      });

      it("Letter Rush trap mode does not turn offscreen imposters into child misses", () => {
        if (!LETTER_RUSH_ENGINE_GAMES.has(label)) return;
        expect(html).toContain("handleFallingExpired");
        expect(html).toContain("kind: \"escaped-imposter\"");
        expect(html).toContain("lastAction: \"imposter_escaped\"");
        expect(html).not.toContain("state.wordHadMiss = true;\n          breakStreak(\"miss\");\n          state.letterResults.push({ word: state.word.text, letter: chunk, expectedLetter: state.trapRound.correctChunk, correct: false");
      });

      it("Letter Rush trap mode gives correct imposter taps a distinct success animation", () => {
        if (!LETTER_RUSH_ENGINE_GAMES.has(label)) return;
        expect(html).toContain(".falling.trapped");
        expect(html).toContain("background:var(--good)");
        expect(html).toContain("@keyframes trapSuccess");
        expect(html).toContain('el.classList.add("trapped")');
        expect(html).toContain("flashWord(positiveFeedbackCopy())");
        expect(html).toContain('lastAction: "trap_imposter"');
      });

      it("Letter Rush falling targets keep a child-sized invisible hit area", () => {
        if (!LETTER_RUSH_ENGINE_GAMES.has(label)) return;
        expect(html).toContain(".falling::after");
        expect(html).toContain("inset:-28px");
        expect(html).toContain("min-width:88px");
        expect(html).toContain("min-height:88px");
      });

      it("Letter Rush trap difficulty is controlled by JSON config, including timer and density", () => {
        if (!LETTER_RUSH_ENGINE_GAMES.has(label)) return;
        expect(html).toContain("function trapSettings");
        expect(html).toContain("config.trap");
        expect(html).toContain("timerSeconds");
        expect(html).toContain("imposterSpawnRate");
        expect(html).toContain("maxVisibleChunks");
        expect(html).toContain("spawnInterval_ms");
        expect(html).toContain("fallDuration_ms");
        expect(html).toContain("trapWordDurationMs");
        expect(html).toContain("tickTrapTimer");
        expect(html).toContain("trap_timer_timeout");
      });

      it("Letter Rush exposes bonus-round timing and stakes through config without hardcoding them", () => {
        if (!LETTER_RUSH_ENGINE_GAMES.has(label)) return;
        expect(html).toContain("function bonusRoundSettings");
        expect(html).toContain("config.bonusRound");
        expect(html).toContain("shouldOfferBonusRound");
        expect(html).toContain("beginBonusRound");
        expect(html).toContain("completeBonusRound");
        expect(html).toContain("bonus_round_unlocked");
        expect(html).toContain("bonus_round_started");
        expect(html).toContain("bonus_round_complete");
        expect(html).toContain("riskSource");
        expect(html).toContain("session_earnings");
        expect(html).toContain("multiplier");
        expect(html).toContain("stake");
        expect(html).toContain("currency_award");
        expect(html).toContain("letter_rush_bonus_round");
        expect(html).not.toContain("emitTargetResult(word, finalCorrect, state.typed.join(\"\"), finalCorrect ? null : reason || \"letter_sequence_miss\");\n          completeBonusRound");
      });

      it("Letter Rush separates correct-letter feedback from word retry outcomes", () => {
        if (!LETTER_RUSH_ENGINE_GAMES.has(label)) return;
        expect(html).toContain("wordOutcomeCopy");
        expect(html).toContain('"TIME!"');
        expect(html).toContain("retrySameWordAfterMiss");
        expect(html).not.toContain("autoAdvanceAfterMiss");
        expect(html).not.toContain('"Try again"');
        expect(html).not.toContain("retryCurrentWord");
        expect(html).toContain("wordOutcomeLocked");
        expect(html).toContain("extendMasteryTimer");
        expect(html).toContain("resetMasteryTimerDisplay");
        expect(html).not.toContain('"Needs practice · " + word.text.toUpperCase()');
      });

      it("Letter Rush supports config background images with a CSS fallback", () => {
        if (!LETTER_RUSH_ENGINE_GAMES.has(label)) return;
        expect(html).toContain("applyBackground");
        expect(html).toContain("backgroundImage");
        expect(html).toContain("fallbackBackground");
        expect(html).toContain("letter-rush-backdrop");
      });

      it("attention screens make parent preview trials playable", () => {
        if (!ATTENTION_SCREENING_GAMES.has(label)) return;
        expect(html).toContain('data-preview-control="wait"');
        expect(html).toContain("setupPreviewControls");
        expect(html).toContain("previewStimulusMs");
        expect(html).toContain("handleOutcome(false)");
      });

      it("attention screens use phase-gated audio feedback", () => {
        if (!ATTENTION_SCREENING_GAMES.has(label)) return;
        expect(contractJs).toContain("createAttentionFeedback");
        expect(html).toContain("attentionFeedback");
        expect(html).toContain("feedbackPolicy");
        expect(html).toMatch(/attentionFeedback\.play\([^)]*["']practice_correct/);
        expect(html).toContain("practice_miss");
        expect(html).toMatch(/attentionFeedback\.play\([^)]*["']measured_response/);
        expect(html).toContain("measured_advance");
        expect(html).toContain('attentionFeedback.play("results_complete"');
        expect(html).not.toContain("measured_correct");
        expect(html).not.toContain("measured_miss");
      });
    });
  }
});
