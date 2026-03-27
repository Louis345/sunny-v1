import assert from "node:assert";
import {
  normalizeWorksheetProblem,
  toWorksheetCanvasSource,
} from "../server/worksheet-problem";
import {
  deriveWorksheetCanonicalAnswer,
  deriveWorksheetCanvasModel,
  renderWorksheetCanvasModelSvg,
} from "../server/worksheet-canvas-model";

let failures = 0;

function ok(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`  ✅ ${name}`);
  } else {
    console.log(`  ❌ ${name}`);
    if (detail) console.log(`     ${detail}`);
    failures++;
  }
}

console.log("\nworksheet canvas model\n");

const model = deriveWorksheetCanvasModel({
  question: "I spent 35 cents. How many cookies did I buy?",
  answer: "7",
  canvas_display: "Cookie shop. Cookie 5¢. Peanut 20¢. Total spent 35¢.",
});

ok("derives money scene model", model?.kind === "money_scene");
ok(
  "captures cookie item price",
  model?.kind === "money_scene" &&
    model.items.some((item) => item.label === "Cookie" && item.priceCents === 5),
);
ok(
  "captures peanut item price",
  model?.kind === "money_scene" &&
    model.items.some((item) => item.label === "Peanut" && item.priceCents === 20),
);
ok(
  "captures total spent",
  model?.kind === "money_scene" && model.totalSpentCents === 35,
);
ok(
  "captures ask visual as item count",
  model?.kind === "money_scene" && model.askVisual === "item_count",
);

const svg = model ? renderWorksheetCanvasModelSvg(model) : null;
ok("renders deterministic svg", typeof svg === "string" && svg.includes("<svg"));
ok("renders cookie price", typeof svg === "string" && svg.includes("5¢"));
ok("renders peanut price", typeof svg === "string" && svg.includes("20¢"));
ok("renders total spent box", typeof svg === "string" && svg.includes("Total Spent:"));
ok(
  "does not hallucinate coin choice row",
  typeof svg === "string" &&
    !/choose coins|coin options|circle how much|checkbox|button/i.test(svg),
  svg ?? "no svg",
);

const noModel = deriveWorksheetCanvasModel({
  question: "Spell the word rainbow.",
  answer: "rainbow",
  canvas_display: "Rainbow word boxes.",
});
ok("non-money worksheet falls back for now", noModel == null);

const compareModel = deriveWorksheetCanvasModel({
  question: "Which amount is greater, 36 cents or 41 cents?",
  answer: "41 cents",
  canvas_display: "Two piles of coins. One pile shows 36¢. The other pile shows 41¢.",
});
ok("derives comparison money model", compareModel?.kind === "compare_amounts");
ok(
  "captures left comparison amount",
  compareModel?.kind === "compare_amounts" && compareModel.leftAmountCents === 36,
);
ok(
  "captures right comparison amount",
  compareModel?.kind === "compare_amounts" && compareModel.rightAmountCents === 41,
);

const compareSvg = compareModel ? renderWorksheetCanvasModelSvg(compareModel) : null;
ok(
  "renders both comparison amounts",
  typeof compareSvg === "string" &&
    compareSvg.includes("36¢") &&
    compareSvg.includes("41¢"),
  compareSvg ?? "no svg",
);
ok(
  "comparison svg does not omit the greater amount",
  typeof compareSvg === "string" && !/36¢(?![\s\S]*41¢)/.test(compareSvg),
  compareSvg ?? "no svg",
);

const inferredCountModel = deriveWorksheetCanvasModel({
  question: "I spent 35 cents. How many cookies did I buy?",
  answer: "6 cookies",
  hint: "Each cookie costs 10 cents.",
  canvas_display: "Someone spent 35 cents total on cookies.",
});
ok(
  "derives item-count scene from hint when canvas_display omits price",
  inferredCountModel?.kind === "money_scene" &&
    inferredCountModel.items.some((item) => item.label === "Cookie" && item.priceCents === 10) &&
    inferredCountModel.totalSpentCents === 35 &&
    inferredCountModel.askVisual === "item_count",
  JSON.stringify(inferredCountModel),
);
ok(
  "canonical answer prefers whole-cookie math over contradictory extractor answer",
  deriveWorksheetCanonicalAnswer({
    question: "I spent 35 cents. How many cookies did I buy?",
    answer: "6 cookies",
    hint: "Each cookie costs 10 cents.",
    canvas_display: "Someone spent 35 cents total on cookies.",
  }) === "3",
);

const canonicalCookie = normalizeWorksheetProblem({
  id: 9,
  question: "I spent 35 cents. How many cookies did I buy?",
  instructions: [],
  answer: "6 cookies",
  hint: "Each cookie costs 10 cents.",
  canvas_display: "Someone spent 35 cents total on cookies.",
});
const canonicalSource =
  canonicalCookie.ok === true ? toWorksheetCanvasSource(canonicalCookie.problem) : null;
const canonicalModel = canonicalSource
  ? deriveWorksheetCanvasModel(canonicalSource)
  : null;
const canonicalSvg = canonicalModel
  ? renderWorksheetCanvasModelSvg(canonicalModel)
  : null;
ok(
  "canonical worksheet source re-renders without contradiction",
  canonicalCookie.ok === true &&
    canonicalSource?.answer === "3" &&
    canonicalSource.canvas_display.includes("Cookie 10¢") &&
    typeof canonicalSvg === "string" &&
    canonicalSvg.includes("10¢") &&
    canonicalSvg.includes("35"),
  JSON.stringify({
    canonicalCookie,
    canonicalSource,
    canonicalSvg,
  }),
);

if (failures > 0) {
  console.log(`\n  ${failures} assertion(s) failed\n`);
  process.exit(1);
}

assert.ok(svg);
console.log("\n  All worksheet canvas model assertions passed\n");
