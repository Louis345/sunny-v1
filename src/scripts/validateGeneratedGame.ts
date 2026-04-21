export interface GameValidationResult {
  passed: boolean;
  score: number;
  failures: string[];
  warnings: string[];
  shouldRegenerate: boolean;
}

export function validateGeneratedGame(
  html: string,
  ctx: {
    words: string[];
    homeworkType: string;
    childId: string;
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

  const strippedParams = html.replace(/GAME_PARAMS[^;]+/g, "");
  if (ctx.childId.trim() && strippedParams.toLowerCase().includes(ctx.childId.toLowerCase())) {
    failures.push(`Hardcoded childId "${ctx.childId}" found`);
  }

  const correctBlock = html.match(/correct[^}]{0,200}(shake|error|wrong)/is);
  const wrongBlock = html.match(/wrong[^}]{0,200}(flash-ok|correct|success)/is);
  if (correctBlock || wrongBlock) {
    failures.push("Correct and wrong feedback may fire from same code path");
    score -= 30;
  }

  if (!html.includes('id="sunny-companion"')) {
    warnings.push("Missing #sunny-companion anchor");
    score -= 10;
  }

  if (!html.includes("fireCompanionEvent")) {
    warnings.push("No companion events fired");
    score -= 10;
  }

  if (ctx.homeworkType === "spelling_test") {
    const firstWord = ctx.words[0];
    const hasWordChips =
      html.includes("word-chip") ||
      html.includes("word-list") ||
      (html.includes("chip") &&
        typeof firstWord === "string" &&
        firstWord.length > 0 &&
        html.includes(firstWord));
    if (hasWordChips) {
      warnings.push(
        "Word list may be visible during spelling — " + "defeats assessment purpose",
      );
      score -= 20;
    }
  }

  const passed = failures.length === 0;
  const shouldRegenerate = failures.some((f) => {
    const fl = f.toLowerCase();
    return fl.includes("correct and wrong") || fl.includes("hardcoded");
  });

  return { passed, score, failures, warnings, shouldRegenerate };
}
