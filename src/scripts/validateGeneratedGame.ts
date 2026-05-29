export interface GameValidationResult {
  passed: boolean;
  score: number;
  failures: string[];
  warnings: string[];
  shouldRegenerate: boolean;
}

function hasWindowContractCall(html: string, functionName: string): boolean {
  const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    String.raw`\bwindow\s*(?:\.\s*${escaped}|\[\s*["']${escaped}["']\s*\])\s*\(`,
    "i",
  );
  return pattern.test(html);
}

function readsWindowGameParams(html: string): boolean {
  return /\bwindow\s*(?:\.\s*GAME_PARAMS|\[\s*["']GAME_PARAMS["']\s*\])/i.test(html);
}

function hasCanonicalContractScript(html: string): boolean {
  return /<script\b[^>]*\bsrc=(["'])\/games\/_contract\.js\1[^>]*>/i.test(html);
}

function visibleText(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsVisibleTarget(html: string, words: string[]): boolean {
  const text = visibleText(html);
  return words.some((word) => {
    const normalized = word.trim();
    if (!normalized) return false;
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(String.raw`\b${escaped}\b`, "i").test(text);
  });
}

function stripRuntimeParamReferences(html: string): string {
  return html.replace(
    /\bwindow\s*(?:\.\s*GAME_PARAMS|\[\s*["']GAME_PARAMS["']\s*\])(?:\s*\?\.\s*[A-Za-z_$][\w$]*|\s*\.\s*[A-Za-z_$][\w$]*)?/gi,
    "",
  );
}

export function validateGeneratedGame(
  html: string,
  ctx: {
    words: string[];
    homeworkType: string;
    childId: string;
    generationStage?: "quest" | "boss";
  },
): GameValidationResult {
  const failures: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  if (!html.includes("_contract.js")) {
    failures.push("Missing _contract.js script tag");
  }

  if (!html.includes("sendNodeComplete")) {
    failures.push("Missing sendNodeComplete call");
  }

  if (!html.includes("GAME_PARAMS")) {
    failures.push("Not reading GAME_PARAMS — hardcoded data");
  }

  if (ctx.generationStage === "quest" || ctx.generationStage === "boss") {
    if (!hasCanonicalContractScript(html)) {
      failures.push('Quest/Boss artifacts must load the Sunny contract with <script src="/games/_contract.js"></script>');
    }
    if (!readsWindowGameParams(html)) {
      failures.push("Quest/Boss artifacts must read window.GAME_PARAMS for runtime parameters");
    }
    for (const functionName of ["fireAttemptEvent", "sendNodeComplete", "fireCompanionEvent"]) {
      if (!hasWindowContractCall(html, functionName)) {
        failures.push(`Quest/Boss artifacts must call window.${functionName}(...) instead of relying on bare globals`);
      }
    }
  }

  const generatedStage = ctx.generationStage === "quest" || ctx.generationStage === "boss";
  const strippedParams = generatedStage
    ? stripRuntimeParamReferences(html)
    : html.replace(/GAME_PARAMS[^;]+/g, "");
  if (ctx.childId.trim() && strippedParams.toLowerCase().includes(ctx.childId.toLowerCase())) {
    failures.push(`Hardcoded childId "${ctx.childId}" found`);
  }

  const correctBlock = html.match(/correct[^}]{0,200}(shake|error|wrong)/is);
  const wrongBlock = html.match(/wrong[^}]{0,200}(flash-ok|correct|success)/is);
  if (correctBlock || wrongBlock) {
    warnings.push("Correct and wrong feedback may fire from same code path");
    score -= 10;
  }

  if (!html.includes('id="sunny-companion"')) {
    warnings.push("Missing #sunny-companion anchor");
    score -= 10;
  }

  if (!html.includes("fireCompanionEvent")) {
    warnings.push("No companion events fired");
    score -= 10;
  }

  if (!html.includes("fireAttemptEvent")) {
    failures.push("Missing fireAttemptEvent call for assessable interactions");
  }

  if ((ctx.generationStage === "quest" || ctx.generationStage === "boss") && ctx.words.length > 1) {
    const advertisesOneClickCompletion =
      /wordsAttempted\s*:\s*1\b/i.test(html) ||
      /wordsAttempted['"]?\s*[,}]/i.test(html) === false && /Finish\s+(quest|boss)|Complete\s+(quest|boss)/i.test(html);
    const hasValidationHook = /SUNNY_VALIDATION_HOOKS/i.test(html);
    if (advertisesOneClickCompletion && !hasValidationHook) {
      failures.push("Quest/Boss artifact advertises one-click completion without enough assessable attempts");
      score -= 30;
    }
  }

  if (ctx.homeworkType === "spelling_test") {
    if (containsVisibleTarget(html, ctx.words)) {
      const message = "Word list may be visible during spelling — defeats assessment purpose";
      if (ctx.generationStage === "quest" || ctx.generationStage === "boss") {
        failures.push(`Visible spelling targets during ${ctx.generationStage} validation: ${message}`);
      } else {
        warnings.push(message);
      }
      score -= 20;
    }
  }

  const passed = failures.length === 0;
  const shouldRegenerate = failures.some((f) => {
    const fl = f.toLowerCase();
    return (
      fl.includes("correct and wrong") ||
      fl.includes("hardcoded") ||
      fl.includes("/games/_contract.js") ||
      fl.includes("window.game_params") ||
      fl.includes("window.fireattemptevent") ||
      fl.includes("window.sendnodecomplete") ||
      fl.includes("window.firecompanionevent") ||
      fl.includes("fireattemptevent") ||
      fl.includes("visible spelling targets") ||
      fl.includes("one-click")
    );
  });

  return { passed, score, failures, warnings, shouldRegenerate };
}
