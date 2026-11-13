export type QuestBossStage = "quest" | "boss";

export interface QuestSpecSceneV1 {
  id: string;
  title: string;
  prompt: string;
}

export interface QuestSpecV1 {
  schemaVersion: 1;
  stage: QuestBossStage;
  title: string;
  theme: string;
  challengeFrame: string;
  visualWorld: string;
  interactionFlavor: string;
  tensionCurve: string;
  rewardMoment: string;
  failureRecoveryStyle: string;
  animationCues: string[];
  styleReference: string;
  wrapperTraits: string[];
  difficulty: 1 | 2 | 3;
  estimatedMinutes: number;
  childFacingIntro: string;
  successCopy: string;
  retryCopy?: string;
  scenes: QuestSpecSceneV1[];
}

export type QuestSpecValidationResult =
  | { ok: true; spec: QuestSpecV1; failures: [] }
  | { ok: false; failures: string[] };

export interface QuestSpecValidationContext {
  stage: QuestBossStage;
  targetWords: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return out;
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
  return out;
}

function containsRuntimeCode(text: string): boolean {
  return /<script\b|<\/script>|window\.|document\.|sendNodeComplete|fireAttemptEvent|fireCompanionEvent|GameBridge|function\s*\(|=>|_contract\.js/i
    .test(text);
}

function containsCompanionChrome(text: string): boolean {
  return /\b(quest[-\s]?giver|companion\s+(avatar|bubble|panel|helper|card)|elli\s+corner|matilda\s+corner|speech\s+bubble|talking\s+mouth)\b/i
    .test(text);
}

function containsTargetWord(text: string, targetWords: string[]): string | null {
  for (const word of targetWords) {
    const normalized = word.trim();
    if (!normalized) continue;
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(String.raw`\b${escaped}\b`, "i").test(text)) return normalized;
  }
  return null;
}

export function validateQuestSpecV1(
  value: unknown,
  ctx: QuestSpecValidationContext,
): QuestSpecValidationResult {
  const failures: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, failures: ["QuestSpec must be an object."] };
  }
  if (value.schemaVersion !== 1) failures.push("QuestSpec schemaVersion must be 1.");
  if (value.stage !== ctx.stage || (value.stage !== "quest" && value.stage !== "boss")) {
    failures.push(`QuestSpec stage must be ${ctx.stage}.`);
  }
  for (const field of [
    "title",
    "theme",
    "challengeFrame",
    "visualWorld",
    "interactionFlavor",
    "tensionCurve",
    "rewardMoment",
    "failureRecoveryStyle",
    "styleReference",
    "childFacingIntro",
    "successCopy",
  ]) {
    if (typeof value[field] !== "string" || !value[field].trim()) {
      failures.push(`QuestSpec ${field} is required.`);
    }
  }
  if (!Array.isArray(value.animationCues) || value.animationCues.length === 0) {
    failures.push("QuestSpec animationCues must include at least one cue.");
  }
  if (!Array.isArray(value.wrapperTraits) || value.wrapperTraits.length === 0) {
    failures.push("QuestSpec wrapperTraits must include at least one trait.");
  }
  if (value.difficulty !== 1 && value.difficulty !== 2 && value.difficulty !== 3) {
    failures.push("QuestSpec difficulty must be 1, 2, or 3.");
  }
  if (typeof value.estimatedMinutes !== "number" || value.estimatedMinutes < 1 || value.estimatedMinutes > 15) {
    failures.push("QuestSpec estimatedMinutes must be between 1 and 15.");
  }
  if (!Array.isArray(value.scenes) || value.scenes.length === 0) {
    failures.push("QuestSpec scenes must include at least one scene.");
  } else {
    for (const [index, scene] of value.scenes.entries()) {
      if (!isRecord(scene)) {
        failures.push(`QuestSpec scene ${index + 1} must be an object.`);
        continue;
      }
      for (const field of ["id", "title", "prompt"]) {
        if (typeof scene[field] !== "string" || !scene[field].trim()) {
          failures.push(`QuestSpec scene ${index + 1} ${field} is required.`);
        }
      }
    }
  }

  const allText = collectStrings(value).join("\n");
  if (containsRuntimeCode(allText)) {
    failures.push("QuestSpec must not include runtime JavaScript or contract code.");
  }
  if (containsCompanionChrome(allText)) {
    failures.push("QuestSpec must not describe or render companion chrome.");
  }
  const visibleTarget = containsTargetWord(allText, ctx.targetWords);
  if (visibleTarget) {
    failures.push(`QuestSpec includes visible target word "${visibleTarget}".`);
  }

  if (failures.length > 0) return { ok: false, failures };
  return { ok: true, spec: value as unknown as QuestSpecV1, failures: [] };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderQuestBossShellFromSpec(
  spec: QuestSpecV1,
  opts: {
    stage: QuestBossStage;
    targetWords: string[];
  },
): string {
  const title = escapeHtml(spec.title);
  const intro = escapeHtml(spec.childFacingIntro);
  const challenge = escapeHtml(spec.challengeFrame);
  const visualWorld = escapeHtml(spec.visualWorld);
  const interactionFlavor = escapeHtml(spec.interactionFlavor);
  const tensionCurve = escapeHtml(spec.tensionCurve);
  const rewardMoment = escapeHtml(spec.rewardMoment);
  const failureRecoveryStyle = escapeHtml(spec.failureRecoveryStyle);
  const styleReference = escapeHtml(spec.styleReference);
  const animationCues = spec.animationCues.map(escapeHtml);
  const success = escapeHtml(spec.successCopy);
  const retry = escapeHtml(spec.retryCopy ?? "Try the next clue.");
  const scenesJson = JSON.stringify(spec.scenes.map((scene) => ({
    id: scene.id,
    title: scene.title,
    prompt: scene.prompt,
  })));
  const targetsJson = JSON.stringify(opts.targetWords);
  const stageLabel = opts.stage === "boss" ? "Boss" : "Quest";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="/games/_contract.js"></script>
  <title>${title}</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: Inter, system-ui, sans-serif;
      background:
        radial-gradient(circle at 20% 18%, rgba(252, 211, 77, .22), transparent 28%),
        radial-gradient(circle at 82% 24%, rgba(124, 58, 237, .24), transparent 30%),
        linear-gradient(160deg, #064e3b, #065f46, #047857, #1a3a1a);
      color: #1f0f2d;
      overflow-x: hidden;
    }
    main {
      width: min(760px, calc(100vw - 40px));
      border: 4px solid #1f0f2d;
      border-radius: 8px;
      background: #fff7e1;
      box-shadow: 0 12px 0 #fcd34d, 0 28px 80px rgba(0, 0, 0, .32);
      padding: 28px;
    }
    h1 { margin: 0 0 10px; font-size: clamp(32px, 5vw, 54px); line-height: .95; letter-spacing: 0; }
    p { font-size: 18px; line-height: 1.4; }
    .hud { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
    .chip { border: 3px solid #1f0f2d; border-radius: 999px; background: #fef3c7; padding: 6px 10px; font-weight: 900; }
    .world {
      border: 3px solid #1f0f2d;
      border-radius: 8px;
      background: linear-gradient(135deg, #ede9fe, #fef3c7);
      padding: 14px;
      margin: 16px 0;
      font-weight: 800;
    }
    .panel { display: grid; gap: 14px; margin-top: 20px; }
    .scene { border: 3px solid #1f0f2d; border-radius: 8px; background: #fff; padding: 18px; box-shadow: 0 6px 0 rgba(31, 15, 45, .14); }
    label { display: block; font-weight: 900; margin-bottom: 8px; }
    input { width: 100%; box-sizing: border-box; border: 3px solid #1f0f2d; border-radius: 8px; font-size: 24px; padding: 12px; }
    button { border: 3px solid #1f0f2d; border-radius: 8px; background: #7c3aed; color: #fff; font-size: 20px; font-weight: 900; padding: 14px 18px; cursor: pointer; }
    button:disabled { opacity: .55; cursor: default; }
    .feedback { min-height: 28px; font-weight: 900; }
    .complete { display: none; border-color: #10b981; background: #ecfdf5; }
    .cue-track { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .cue { border-radius: 8px; background: #1f0f2d; color: #fff; padding: 6px 8px; font-size: 13px; font-weight: 900; }
  </style>
</head>
<body>
  <div id="sunny-companion"></div>
  <main data-style-reference="${styleReference}">
    <div class="hud">
      <span class="chip">${stageLabel}</span>
      <span class="chip">${escapeHtml(spec.theme)}</span>
      <span class="chip">Level ${spec.difficulty}</span>
    </div>
    <h1>${title}</h1>
    <p>${intro}</p>
    <p>${challenge}</p>
    <section class="world" aria-label="adventure world">
      <p>${visualWorld}</p>
      <p>${interactionFlavor}</p>
      <p>${tensionCurve}</p>
      <div class="cue-track">${animationCues.map((cue) => `<span class="cue">${cue}</span>`).join("")}</div>
    </section>
    <section class="panel" id="rounds" aria-live="polite"></section>
    <section class="scene complete" id="complete">
      <h2>${success}</h2>
      <p>${rewardMoment}</p>
      <p>${failureRecoveryStyle}</p>
      <p>${retry}</p>
    </section>
  </main>
  <script>
    const params = window.GAME_PARAMS || {};
    const fallbackTargets = ${targetsJson};
    const scenes = ${scenesJson};
    const targets = Array.isArray(params.words) && params.words.length ? params.words : fallbackTargets;
    const rounds = document.getElementById("rounds");
    const completePanel = document.getElementById("complete");
    const startTime = Date.now();
    let index = 0;
    let correct = 0;

    function activeTarget(i) {
      return String(targets[i] || "");
    }

    function completeGame() {
      rounds.style.display = "none";
      completePanel.style.display = "block";
      const accuracy = correct / Math.max(1, targets.length);
      console.log("🎮 [quest-boss-shell] [complete] stage=${opts.stage} accuracy=" + accuracy);
      window.fireCompanionEvent("game_complete", { accuracy, stage: "${opts.stage}" });
      window.sendNodeComplete({
        completed: true,
        accuracy,
        timeSpent_ms: Date.now() - startTime,
        wordsAttempted: targets.length
      });
    }

    function submitRound(round, input, feedback) {
      const target = activeTarget(index);
      const attemptedValue = input.value.trim();
      const ok = attemptedValue.toLowerCase() === target.toLowerCase();
      if (ok) correct += 1;
      console.log("🎮 [quest-boss-shell] [attempt] stage=${opts.stage} index=" + index + " correct=" + ok);
      window.fireAttemptEvent({
        domain: "spelling",
        target,
        attemptedValue,
        correct: ok,
        quality: ok ? 5 : 1,
        scaffoldLevel: 0
      });
      window.fireCompanionEvent("attempt_result", { stage: "${opts.stage}", correct: ok });
      feedback.textContent = ok ? "Clue accepted." : "Clue recorded.";
      round.querySelector("button").disabled = true;
      input.disabled = true;
      index += 1;
      setTimeout(() => {
        round.hidden = true;
        const next = rounds.children[index];
        if (next) {
          next.hidden = false;
          const nextInput = next.querySelector("input");
          if (nextInput) nextInput.focus();
        } else {
          completeGame();
        }
      }, 10);
    }

    targets.forEach((_target, i) => {
      const scene = scenes[i % Math.max(1, scenes.length)] || scenes[0] || { title: "Memory clue", prompt: "Type the answer from memory." };
      const round = document.createElement("section");
      round.className = "scene";
      round.hidden = i !== 0;
      const label = document.createElement("label");
      label.textContent = scene.title + " - clue " + (i + 1) + " of " + targets.length;
      const prompt = document.createElement("p");
      prompt.textContent = scene.prompt;
      const input = document.createElement("input");
      input.setAttribute("aria-label", "hidden recall answer " + (i + 1));
      input.setAttribute("autocomplete", "off");
      input.setAttribute("spellcheck", "false");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Submit clue";
      const feedback = document.createElement("p");
      feedback.className = "feedback";
      round.append(label, prompt, input, button, feedback);
      button.addEventListener("click", () => submitRound(round, input, feedback));
      rounds.appendChild(round);
    });

    console.log("🎮 [quest-boss-shell] [start] stage=${opts.stage} targets=" + targets.length);
    window.fireCompanionEvent("game_start", { stage: "${opts.stage}", totalTargets: targets.length });
    window.SUNNY_VALIDATION_HOOKS = {
      playthrough: async ({ words }) => {
        const validationWords = Array.isArray(words) && words.length ? words : targets;
        for (let i = 0; i < validationWords.length; i += 1) {
          const round = rounds.children[i];
          const input = round.querySelector("input");
          input.value = validationWords[i];
          input.dispatchEvent(new Event("input", { bubbles: true }));
          round.querySelector("button").click();
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }
    };
  </script>
</body>
</html>`;
}
