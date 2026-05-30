import type { QuestBossAssignmentContext, QuestBossCandidate } from "./questBossTeamPipeline";

export type QuestBossDomainMechanic = {
  domain: string;
  measuredSkill: string;
  actionLanguage: string;
  inputLabel: string;
  roundLabel: string;
  buttonText: string;
  completionLanguage: string;
  missLanguage: string;
};

const FALLBACK_PALETTE = {
  background: "#08111f",
  surface: "#101a33",
  accent: "#64f4d4",
  glow: "#ffe46b",
  text: "#fff7e1",
};

export function domainMechanicForQuestBoss(domain: string): QuestBossDomainMechanic {
  const normalized = domain.trim().toLowerCase();
  if (normalized.includes("read")) {
    return {
      domain: "reading",
      measuredSkill: "comprehension transfer",
      actionLanguage: "Reveal the next route by remembering what the story already told you.",
      inputLabel: "route clue",
      roundLabel: "Map clue",
      buttonText: "Reveal the route",
      completionLanguage: "Route revealed.",
      missLanguage: "The map flickered. Keep moving.",
    };
  }
  if (normalized.includes("math")) {
    return {
      domain: "math",
      measuredSkill: "reasoning transfer",
      actionLanguage: "Power the machine by solving the next control lock.",
      inputLabel: "power code",
      roundLabel: "Power lock",
      buttonText: "Power up",
      completionLanguage: "Power restored.",
      missLanguage: "The machine sparked. Try the next control.",
    };
  }
  if (normalized.includes("science")) {
    return {
      domain: "science",
      measuredSkill: "cause and effect transfer",
      actionLanguage: "Stabilize the experiment by choosing the evidence that belongs.",
      inputLabel: "stability key",
      roundLabel: "Stability key",
      buttonText: "Stabilize",
      completionLanguage: "System stabilized.",
      missLanguage: "The lab shook, but the reading was captured.",
    };
  }
  return {
    domain: "spelling",
    measuredSkill: "hidden spelling recall",
    actionLanguage: "Unlock the world by creating the missing signal from memory.",
    inputLabel: "memory key",
    roundLabel: "Vault key",
    buttonText: "Unlock",
    completionLanguage: "The gate responded.",
    missLanguage: "The lock shimmered and saved the attempt.",
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function childFacingText(value: string): string {
  return value
    .replace(/\bcorrectly\b/gi, "cleanly")
    .replace(/\bcorrect\b/gi, "right")
    .replace(/\bwrong\b/gi, "off track")
    .replace(/\berrors?\b/gi, "misses")
    .replace(/\bsuccess\b/gi, "win");
}

function escapeScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function cssUrl(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "");
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function renderQuestBossShell(input: {
  candidate: QuestBossCandidate;
  assignment: QuestBossAssignmentContext;
}): string {
  const { candidate, assignment } = input;
  if (!candidate.experienceSkin) {
    throw new Error(`Quest/Boss candidate ${candidate.candidateId} is missing experienceSkin.`);
  }

  const skin = candidate.experienceSkin;
  const palette = { ...FALLBACK_PALETTE, ...skin.palette };
  const mechanic = domainMechanicForQuestBoss(assignment.domain);
  const title = escapeHtml(childFacingText(candidate.title));
  const focalObject = escapeHtml(skin.focalObject);
  const mechanicMetaphor = escapeHtml(childFacingText(skin.mechanicMetaphor));
  const companionLine = escapeHtml(childFacingText(skin.companionLines[0] ?? "This world is waiting for your next move."));
  const rewardMoment = escapeHtml(childFacingText(skin.rewardMoment));
  const worldImage = skin.worldImagePath ?? skin.cardImagePath ?? candidate.imagePath ?? "";
  const traits = unique([...skin.wrapperTraits, ...candidate.wrapperTraits]);
  const intensityClass = `intensity-${skin.visualIntensity}`;
  const stageLabel = candidate.kind === "boss" ? "Final gate" : "Quest unlocked";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="/games/_contract.js"></script>
  <title>${title}</title>
  <style>
    :root {
      --bg:${palette.background};
      --surface:${palette.surface};
      --accent:${palette.accent};
      --glow:${palette.glow};
      --text:${palette.text};
    }
    * { box-sizing: border-box; }
    body {
      margin:0;
      min-height:100vh;
      font-family: Inter, ui-rounded, system-ui, sans-serif;
      color:var(--text);
      background:var(--bg);
      overflow:hidden;
    }
    .world {
      position:relative;
      min-height:100vh;
      isolation:isolate;
      display:grid;
      grid-template-rows:1fr auto;
      background-image:
        linear-gradient(180deg, rgba(3,8,18,.08), rgba(3,8,18,.52) 58%, rgba(3,8,18,.84)),
        url("${cssUrl(worldImage)}");
      background-position:center;
      background-size:cover;
    }
    .world::before {
      content:"";
      position:absolute;
      inset:0;
      z-index:-1;
      background:
        radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--glow) 46%, transparent), transparent 18%),
        radial-gradient(circle at 75% 20%, color-mix(in srgb, var(--accent) 36%, transparent), transparent 24%);
      opacity:.72;
      mix-blend-mode:screen;
      pointer-events:none;
    }
    .world.intensity-subtle::before { opacity:.28; }
    .world.intensity-balanced::before { opacity:.52; }
    .world.intensity-high::before { opacity:.84; }
    #sunny-companion {
      position:fixed;
      left:30px;
      bottom:28px;
      width:118px;
      height:118px;
      border-radius:999px;
      background:linear-gradient(145deg, var(--accent), color-mix(in srgb, var(--surface) 65%, #000));
      box-shadow:0 14px 36px rgba(0,0,0,.34), 0 0 0 5px color-mix(in srgb, var(--accent) 46%, transparent);
    }
    #sunny-companion::after {
      content:"";
      position:absolute;
      left:94px;
      bottom:22px;
      width:min(420px, calc(100vw - 180px));
      min-height:66px;
      border-radius:22px 22px 22px 6px;
      background:rgba(255,255,255,.94);
      color:#172033;
      box-shadow:0 10px 26px rgba(0,0,0,.24);
    }
    .companion-line {
      position:fixed;
      left:148px;
      bottom:48px;
      width:min(386px, calc(100vw - 214px));
      color:#172033;
      font-weight:850;
      line-height:1.2;
      z-index:3;
    }
    .hud {
      align-self:end;
      width:min(980px, calc(100vw - 44px));
      margin:0 auto 36px;
      border:1px solid color-mix(in srgb, var(--accent) 48%, transparent);
      border-radius:26px;
      padding:26px;
      background:linear-gradient(180deg, rgba(7,14,30,.78), rgba(7,14,30,.92));
      box-shadow:0 22px 70px rgba(0,0,0,.42);
      backdrop-filter: blur(12px);
    }
    .stage-label {
      display:inline-flex;
      align-items:center;
      gap:8px;
      margin-bottom:10px;
      color:var(--accent);
      font-weight:950;
      letter-spacing:.08em;
      text-transform:uppercase;
      font-size:13px;
    }
    h1 {
      margin:0;
      font-size:clamp(44px, 7vw, 82px);
      line-height:.92;
      max-width:780px;
    }
    .metaphor {
      margin:16px 0 0;
      max-width:760px;
      color:color-mix(in srgb, var(--text) 86%, transparent);
      font-size:clamp(18px, 2.3vw, 25px);
      line-height:1.26;
      font-weight:750;
    }
    .focus-pulse {
      position:absolute;
      top:48%;
      left:50%;
      transform:translate(-50%, -50%);
      width:min(360px, 36vw);
      min-width:220px;
      aspect-ratio:1;
      border-radius:999px;
      background:
        radial-gradient(circle at 35% 25%, #fff, transparent 16%),
        radial-gradient(circle, var(--glow), var(--accent) 48%, color-mix(in srgb, var(--surface) 74%, #000));
      box-shadow:0 0 0 7px color-mix(in srgb, var(--accent) 70%, transparent), 0 32px 90px rgba(0,0,0,.38);
      opacity:.62;
      mix-blend-mode:screen;
      pointer-events:none;
    }
    .rounds {
      margin-top:22px;
      display:grid;
      gap:14px;
      max-width:760px;
    }
    .round { display:none; gap:12px; }
    .round.active { display:grid; }
    label {
      color:color-mix(in srgb, var(--text) 70%, transparent);
      font-weight:900;
      font-size:15px;
    }
    input {
      width:100%;
      border:0;
      border-radius:16px;
      padding:18px 20px;
      color:#101727;
      font-weight:900;
      font-size:28px;
      box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 72%, transparent);
    }
    button {
      border:0;
      border-radius:16px;
      padding:18px 22px;
      color:#14121f;
      background:linear-gradient(90deg, var(--glow), color-mix(in srgb, var(--accent) 58%, var(--glow)));
      font-size:21px;
      font-weight:1000;
      cursor:pointer;
    }
    .feedback {
      min-height:30px;
      color:var(--accent);
      font-size:18px;
      font-weight:950;
    }
    .reward {
      display:none;
      margin-top:18px;
      color:var(--glow);
      font-size:24px;
      font-weight:1000;
    }
    .reward.visible { display:block; }
  </style>
</head>
<body>
  <div class="world ${intensityClass}" data-testid="quest-boss-world" data-skin-theme="${escapeHtml(skin.theme)}" data-wrapper-traits="${escapeHtml(traits.join(","))}" data-focal-object="${focalObject}">
    <div id="sunny-companion" aria-hidden="true"></div>
    <div class="companion-line">${companionLine}</div>
    <div class="focus-pulse" aria-hidden="true"></div>
    <main class="hud">
      <div class="stage-label">${stageLabel}</div>
      <h1>${title}</h1>
      <p class="metaphor">${mechanicMetaphor}</p>
      <p class="metaphor">${escapeHtml(mechanic.actionLanguage)}</p>
      <section class="rounds" id="rounds"></section>
      <div class="reward" id="reward">${rewardMoment}</div>
    </main>
  </div>
  <script>
    const fallbackTargets = [];
    const targets = (window.GAME_PARAMS && window.GAME_PARAMS.words && window.GAME_PARAMS.words.length ? window.GAME_PARAMS.words : fallbackTargets).filter(Boolean);
    const rounds = document.getElementById("rounds");
    const reward = document.getElementById("reward");
    let index = 0;
    let correct = 0;
    const targetResults = [];
    const started = Date.now();
    const completionLanguage = ${escapeScriptJson(mechanic.completionLanguage)};
    const missLanguage = ${escapeScriptJson(mechanic.missLanguage)};
    const kind = ${escapeScriptJson(candidate.kind)};
    const candidateId = ${escapeScriptJson(candidate.candidateId)};
    const makeRound = (target, i) => {
      const section = document.createElement("section");
      section.className = "round" + (i === 0 ? " active" : "");
      const label = document.createElement("label");
      label.textContent = ${escapeScriptJson(mechanic.roundLabel)} + " " + (i + 1) + " / " + targets.length;
      const input = document.createElement("input");
      input.setAttribute("aria-label", ${escapeScriptJson(mechanic.inputLabel)} + " " + (i + 1));
      input.setAttribute("autocomplete", "off");
      const button = document.createElement("button");
      button.textContent = ${escapeScriptJson(mechanic.buttonText)};
      const feedback = document.createElement("div");
      feedback.className = "feedback";
      button.addEventListener("click", () => {
        const answer = input.value.trim();
        const ok = answer.toLowerCase() === String(target).toLowerCase();
        if (ok) correct += 1;
        targetResults.push({
          target,
          correct: ok,
          attempts: 1,
          attemptedValue: answer,
          scaffoldLevel: 0,
          evidenceTier: kind === "boss" ? "mastery_gate" : "intervention",
          masteryEligible: kind === "boss"
        });
        fireAttemptEvent({
          target,
          attemptedValue: answer,
          correct: ok,
          attempts: 1,
          scaffoldLevel: 0,
          game: kind,
          candidateId,
          mechanic: ${escapeScriptJson(mechanic.measuredSkill)}
        });
        feedback.textContent = ok ? completionLanguage : missLanguage;
        section.classList.remove("active");
        index += 1;
        if (rounds.children[index]) {
          rounds.children[index].classList.add("active");
        } else {
          reward.classList.add("visible");
          sendNodeComplete({
            completed: true,
            accuracy: correct / Math.max(1, targets.length),
            timeSpent_ms: Date.now() - started,
            wordsAttempted: targets.length,
            candidateId,
            activityId: kind,
            purpose: kind === "boss" ? "mastery_gate" : "intervention",
            evidenceTier: kind === "boss" ? "mastery_gate" : "intervention",
            masteryEligible: kind === "boss",
            targetResults
          });
        }
      });
      section.append(label, input, button, feedback);
      return section;
    };
    targets.forEach((target, i) => rounds.appendChild(makeRound(target, i)));
    window.SUNNY_VALIDATION_HOOKS = {
      playthrough: async ({ words }) => {
        const validationWords = Array.isArray(words) && words.length ? words : targets;
        for (let i = 0; i < validationWords.length; i += 1) {
          const section = rounds.children[i];
          if (!section) break;
          section.querySelector("input").value = validationWords[i];
          section.querySelector("input").dispatchEvent(new Event("input", { bubbles: true }));
          section.querySelector("button").click();
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
      }
    };
  </script>
</body>
</html>`;
}

export function renderQuestBossFreeVisionShell(input: {
  candidate: QuestBossCandidate;
  assignment: QuestBossAssignmentContext;
}): string {
  const { candidate, assignment } = input;
  if (!candidate.experienceSkin) {
    throw new Error(`Quest/Boss candidate ${candidate.candidateId} is missing experienceSkin.`);
  }

  const skin = candidate.experienceSkin;
  const palette = { ...FALLBACK_PALETTE, ...skin.palette };
  const mechanic = domainMechanicForQuestBoss(assignment.domain);
  const title = escapeHtml(childFacingText(candidate.title));
  const worldImage = skin.worldImagePath ?? skin.cardImagePath ?? candidate.imagePath ?? "";
  const companionLine = escapeHtml(childFacingText(
    skin.companionLines[0] ?? "This world is reacting. Make the next move from memory.",
  ));
  const rewardMoment = escapeHtml(childFacingText(skin.rewardMoment));

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="/games/_contract.js"></script>
  <title>${title}</title>
  <style>
    :root {
      --surface:${palette.surface};
      --accent:${palette.accent};
      --glow:${palette.glow};
      --text:${palette.text};
    }
    * { box-sizing:border-box; }
    body {
      margin:0;
      width:100vw;
      height:100vh;
      overflow:hidden;
      background:#02040a;
      color:var(--text);
      font-family:Inter, ui-rounded, system-ui, sans-serif;
    }
    .free-vision {
      position:relative;
      width:100vw;
      height:100vh;
      background:#02040a;
      isolation:isolate;
    }
    .free-vision-image {
      position:absolute;
      inset:0;
      width:100%;
      height:100%;
      object-fit:contain;
      display:block;
      margin:auto;
      background:#02040a;
    }
    #sunny-companion {
      position:fixed;
      left:18px;
      bottom:18px;
      width:58px;
      height:58px;
      border-radius:999px;
      background:rgba(255,255,255,.14);
      border:2px solid color-mix(in srgb, var(--accent) 72%, white);
      box-shadow:0 10px 30px rgba(0,0,0,.3), 0 0 26px color-mix(in srgb, var(--accent) 36%, transparent);
    }
    .recall-strip {
      position:fixed;
      left:50%;
      bottom:18px;
      transform:translateX(-50%);
      width:min(520px, calc(100vw - 112px));
      display:grid;
      grid-template-columns:1fr auto;
      gap:10px;
      padding:10px;
      border:1px solid rgba(255,255,255,.26);
      border-radius:999px;
      background:rgba(2,6,16,.64);
      box-shadow:0 14px 40px rgba(0,0,0,.34);
    }
    .recall-strip input {
      min-width:0;
      border:0;
      border-radius:999px;
      padding:13px 16px;
      color:#101727;
      font-size:20px;
      font-weight:900;
      outline:2px solid transparent;
    }
    .recall-strip button {
      border:0;
      border-radius:999px;
      padding:13px 20px;
      color:#0c1220;
      background:var(--glow);
      font-weight:1000;
      cursor:pointer;
    }
    .status {
      position:fixed;
      left:50%;
      bottom:82px;
      transform:translateX(-50%);
      max-width:min(520px, calc(100vw - 112px));
      padding:9px 14px;
      border-radius:999px;
      background:rgba(2,6,16,.58);
      color:var(--text);
      font-weight:850;
      text-align:center;
      opacity:0;
      transition:opacity .16s ease;
      pointer-events:none;
    }
    .status.visible { opacity:1; }
    .reward {
      position:fixed;
      top:18px;
      left:50%;
      transform:translateX(-50%);
      max-width:min(620px, calc(100vw - 36px));
      padding:10px 16px;
      border-radius:999px;
      background:rgba(2,6,16,.58);
      color:var(--glow);
      font-weight:1000;
      text-align:center;
      opacity:0;
      transition:opacity .2s ease;
      pointer-events:none;
    }
    .reward.visible { opacity:1; }
  </style>
</head>
<body>
  <main class="free-vision" data-testid="quest-boss-free-vision" data-free-vision-runtime="true" data-overlay-policy="minimal">
    <img class="free-vision-image" data-free-vision-raw-image src="${escapeHtml(worldImage)}" alt="" />
    <div id="sunny-companion" data-free-vision-overlay aria-hidden="true"></div>
    <div class="status" id="status" data-free-vision-overlay>${companionLine}</div>
    <div class="reward" id="reward" data-free-vision-overlay>${rewardMoment}</div>
    <section class="recall-strip" id="rounds" data-free-vision-overlay aria-label="${escapeHtml(mechanic.inputLabel)}"></section>
  </main>
  <script>
    const fallbackTargets = [];
    const targets = (window.GAME_PARAMS && window.GAME_PARAMS.words && window.GAME_PARAMS.words.length ? window.GAME_PARAMS.words : fallbackTargets).filter(Boolean);
    const rounds = document.getElementById("rounds");
    const status = document.getElementById("status");
    const reward = document.getElementById("reward");
    let index = 0;
    let clean = 0;
    const targetResults = [];
    const started = Date.now();
    const completionLanguage = ${escapeScriptJson(mechanic.completionLanguage)};
    const missLanguage = ${escapeScriptJson(mechanic.missLanguage)};
    const kind = ${escapeScriptJson(candidate.kind)};
    const candidateId = ${escapeScriptJson(candidate.candidateId)};
    const showStatus = (text) => {
      status.textContent = text;
      status.classList.add("visible");
    };
    const fireCompanion = () => {
      if (typeof fireCompanionEvent === "function") {
        fireCompanionEvent({ type: "quest_boss_reaction", text: ${escapeScriptJson(companionLine)} });
      }
    };
    const makeRound = (target, i) => {
      const input = document.createElement("input");
      input.setAttribute("aria-label", ${escapeScriptJson(mechanic.inputLabel)} + " " + (i + 1));
      input.setAttribute("autocomplete", "off");
      input.style.display = i === 0 ? "block" : "none";
      const button = document.createElement("button");
      button.textContent = ${escapeScriptJson(mechanic.buttonText)};
      button.style.display = i === 0 ? "block" : "none";
      button.addEventListener("click", () => {
        const answer = input.value.trim();
        const ok = answer.toLowerCase() === String(target).toLowerCase();
        if (ok) clean += 1;
        targetResults.push({
          target,
          correct: ok,
          attempts: 1,
          attemptedValue: answer,
          scaffoldLevel: 0,
          evidenceTier: kind === "boss" ? "mastery_gate" : "intervention",
          masteryEligible: kind === "boss"
        });
        fireAttemptEvent({
          target,
          attemptedValue: answer,
          correct: ok,
          attempts: 1,
          scaffoldLevel: 0,
          game: kind,
          candidateId,
          mechanic: ${escapeScriptJson(mechanic.measuredSkill)}
        });
        showStatus(ok ? completionLanguage : missLanguage);
        input.style.display = "none";
        button.style.display = "none";
        index += 1;
        const nextInput = rounds.querySelectorAll("input")[index];
        const nextButton = rounds.querySelectorAll("button")[index];
        if (nextInput && nextButton) {
          nextInput.style.display = "block";
          nextButton.style.display = "block";
          nextInput.focus();
        } else {
          reward.classList.add("visible");
          sendNodeComplete({
            completed: true,
            accuracy: clean / Math.max(1, targets.length),
            timeSpent_ms: Date.now() - started,
            wordsAttempted: targets.length,
            candidateId,
            activityId: kind,
            purpose: kind === "boss" ? "mastery_gate" : "intervention",
            evidenceTier: kind === "boss" ? "mastery_gate" : "intervention",
            masteryEligible: kind === "boss",
            targetResults
          });
        }
      });
      return [input, button];
    };
    targets.forEach((target, i) => rounds.append(...makeRound(target, i)));
    fireCompanion();
    window.SUNNY_VALIDATION_HOOKS = {
      playthrough: async ({ words }) => {
        const validationWords = Array.isArray(words) && words.length ? words : targets;
        for (let i = 0; i < validationWords.length; i += 1) {
          const input = rounds.querySelectorAll("input")[i];
          const button = rounds.querySelectorAll("button")[i];
          if (!input || !button) break;
          input.value = validationWords[i];
          input.dispatchEvent(new Event("input", { bubbles: true }));
          button.click();
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
      }
    };
  </script>
</body>
</html>`;
}
