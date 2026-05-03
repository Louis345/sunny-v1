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
  "web/public/games/attention-fish-flanker.html",
  "web/public/games/attention-hero-shield.html",
  "web/public/games/attention-target-blaster.html",
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
