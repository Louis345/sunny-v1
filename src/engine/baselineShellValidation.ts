import { validateGeneratedGame } from "../scripts/validateGeneratedGame";

export type BaselineShellValidationResult = {
  passed: boolean;
  failures: string[];
  warnings: string[];
};

export function validateBaselineShellHtml(
  html: string,
  ctx: {
    childId: string;
    homeworkType: string;
    targets: string[];
    expectedTitle?: string;
  },
): BaselineShellValidationResult {
  const base = validateGeneratedGame(html, {
    childId: ctx.childId,
    homeworkType: ctx.homeworkType,
    words: ctx.targets,
    generationStage: "baseline",
  });

  const failures = [...base.failures];
  const warnings = [...base.warnings];

  if (ctx.expectedTitle && !html.toLowerCase().includes(ctx.expectedTitle.trim().toLowerCase())) {
    failures.push(`Baseline shell rendered title must match ${ctx.expectedTitle}`);
  }

  const readsConfig =
    /\bconfig\b/i.test(html) &&
    (/\/api\/activity-config\//i.test(html) ||
      /fetch\s*\(\s*[^)]*config/i.test(html) ||
      /params\.get\(\s*["']config["']\s*\)/i.test(html) ||
      /URLSearchParams/i.test(html));

  if (!readsConfig) {
    failures.push("Baseline shell must load refillable config JSON via config URL param");
  }

  if (!/GameBridge\.reportState|reportState\s*\(/i.test(html)) {
    failures.push("Baseline shell must call GameBridge.reportState for companion context");
  }

  // Sound is an engagement requirement. A candidate without an attached audio
  // path is not the artifact the child was promised, so fail it before attach.
  if (!/AudioContext|webkitAudioContext/i.test(html)) {
    failures.push("Baseline shell must include WebAudio sound effects (AudioContext missing)");
  }
  if (!/id=["']mute["']|mute.*onclick|sound/i.test(html)) {
    failures.push("Baseline shell must expose a sound control");
  }
  if (!/fireAttemptEvent/i.test(html) || !/fireCompanionEvent/i.test(html)) {
    failures.push("Baseline shell must emit attempt and companion evidence");
  }

  // Accept the literal domain or a config-sourced domain (e.g. domain: config.domain),
  // which resolves to "math" at runtime because the refill config always sets it.
  const hasAttemptDomain =
    /domain\s*:\s*["']math["']/i.test(html) ||
    /domain\s*:\s*[\w$.\[\]"']+\.domain\b/i.test(html) ||
    /domain\s*:\s*\w+\[["']domain["']\]/i.test(html);
  if (!hasAttemptDomain) {
    failures.push('Baseline shell fireAttemptEvent must include domain: "math" (or domain from the loaded config)');
  }

  const usesRoundLock = /roundLocked\s*=\s*true/i.test(html);
  const releasesRoundLockWhenRendering =
    /function\s+render(?:Round|Question)\s*\([^)]*\)\s*\{[\s\S]{0,1200}?roundLocked\s*=\s*false/i.test(html);
  if (usesRoundLock && !releasesRoundLockWhenRendering) {
    failures.push("Baseline shell must release its answer lock for every new round");
  }

  return {
    passed: failures.length === 0,
    failures,
    warnings,
  };
}
