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

function hasSunnyCompanionAnchor(html: string): boolean {
  return /<[^>]+\bid=(["'])sunny-companion\1[^>]*>/i.test(html);
}

function hasSelfOwnedCompanionChrome(html: string): boolean {
  const hardMarkers = [
    /\bquest-giver\b/i,
    /\bquest-avatar\b/i,
    /\belli-corner\b/i,
    /\bcompanion-bubble\b/i,
    /\bcompanion-avatar\b/i,
    /\bcompanion-panel\b/i,
    /\bid=(["'])questGiver\1/i,
  ];
  if (hardMarkers.some((marker) => marker.test(html))) return true;

  const hasSpeechBubble = /\bspeech-bubble\b|\bid=(["'])speechBubble\1/i.test(html);
  const speechBubbleLooksLikeCompanion =
    hasSpeechBubble && /\b(Elli|Matilda|companion|quest\s+giver|helper)\b/i.test(visibleText(html));
  return speechBubbleLooksLikeCompanion;
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

function normalizeWord(value: string): string {
  return value.trim().toLowerCase();
}

function scriptOwnedTargetWords(html: string): string[] {
  const words: string[] = [];
  const scripts = html.match(/<script\b[\s\S]*?<\/script>/gi) ?? [];
  const arrayPattern = /\b(?:const|let|var)\s+(?:WORDS|targetWords|targets)\s*=\s*\[([\s\S]*?)\]/gi;
  for (const script of scripts) {
    for (const match of script.matchAll(arrayPattern)) {
      const body = match[1] ?? "";
      for (const item of body.matchAll(/["']([A-Za-z][A-Za-z'-]{1,})["']/g)) {
        words.push(item[1] ?? "");
      }
    }
  }
  return words;
}

function inlineScriptSyntaxFailures(html: string): string[] {
  const failures: string[] = [];
  const scripts = html.match(/<script\b[\s\S]*?<\/script>/gi) ?? [];
  scripts.forEach((script, index) => {
    if (/\bsrc\s*=/i.test(script)) return;
    const typeMatch = script.match(/\btype=(["'])(.*?)\1/i);
    const type = typeMatch?.[2]?.trim().toLowerCase();
    if (type && !["text/javascript", "application/javascript", "module"].includes(type)) return;
    const body = script
      .replace(/^<script\b[^>]*>/i, "")
      .replace(/<\/script>$/i, "");
    try {
      if (type === "module") {
        new Function(`"use strict";\n${body}`);
      } else {
        new Function(body);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push(`Inline script syntax error in script ${index + 1}: ${message}`);
    }
  });
  return failures;
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
    generationStage?: "quest" | "boss" | "baseline";
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

  if (ctx.generationStage === "quest" || ctx.generationStage === "boss" || ctx.generationStage === "baseline") {
    failures.push(...inlineScriptSyntaxFailures(html));
    if (!hasCanonicalContractScript(html)) {
      failures.push('Generated artifacts must load the Sunny contract with <script src="/games/_contract.js"></script>');
    }
    if (!readsWindowGameParams(html)) {
      failures.push("Generated artifacts must read window.GAME_PARAMS for runtime parameters");
    }
    for (const functionName of ["fireAttemptEvent", "sendNodeComplete", "fireCompanionEvent"]) {
      if (!hasWindowContractCall(html, functionName)) {
        failures.push(`Generated artifacts must call window.${functionName}(...) instead of relying on bare globals`);
      }
    }
    if (!hasSunnyCompanionAnchor(html)) {
      failures.push("Generated artifacts must include #sunny-companion so Sunny owns companion rendering");
    }
    if (hasSelfOwnedCompanionChrome(html)) {
      failures.push("Generated artifacts must not render their own companion chrome; use #sunny-companion plus contract companion events");
    }
  }

  if (ctx.generationStage === "baseline") {
    const readsConfig =
      /\bconfig\b/i.test(html) &&
      (/\/api\/activity-config\//i.test(html) ||
        /fetch\s*\(\s*[^)]*config/i.test(html) ||
        /params\.get\(\s*["']config["']\s*\)/i.test(html));
    if (!readsConfig) {
      failures.push("Baseline shell must load refillable config JSON via config URL param");
    }
    if (!/GameBridge\.reportState|reportState\s*\(/i.test(html)) {
      failures.push("Baseline shell must call GameBridge.reportState for companion context");
    }
  }

  const generatedStage =
    ctx.generationStage === "quest" || ctx.generationStage === "boss" || ctx.generationStage === "baseline";
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

  if (!hasSunnyCompanionAnchor(html)) {
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
    if (ctx.generationStage === "quest" || ctx.generationStage === "boss") {
      const approved = new Set(ctx.words.map(normalizeWord).filter(Boolean));
      const unapproved = scriptOwnedTargetWords(html)
        .map(normalizeWord)
        .filter((word) => word && !approved.has(word));
      if (unapproved.length > 0) {
        failures.push(`Unapproved spelling targets in generated ${ctx.generationStage}: ${[...new Set(unapproved)].join(", ")}`);
        score -= 30;
      }
    }
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
      fl.includes("sunny-companion") ||
      fl.includes("own companion chrome") ||
      fl.includes("fireattemptevent") ||
      fl.includes("unapproved spelling targets") ||
      fl.includes("visible spelling targets") ||
      fl.includes("one-click") ||
      fl.includes("inline script syntax error")
    );
  });

  return { passed, score, failures, warnings, shouldRegenerate };
}
