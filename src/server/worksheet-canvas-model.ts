export type WorksheetCanvasModel =
  | {
      kind: "money_scene";
      items: Array<{
        id: string;
        label: string;
        priceCents: number;
      }>;
      totalSpentCents?: number;
      budgetCents?: number;
      askVisual: "item_price" | "total_cost" | "item_count" | "payment_choice";
    }
  | {
      kind: "compare_amounts";
      leftAmountCents: number;
      rightAmountCents: number;
      askVisual: "greater" | "less";
    };

type WorksheetCanvasSource = {
  question: string;
  answer: string;
  hint?: string;
  canvas_display: string;
};

const MONEY_REGEX = /(?:\$\s*\d+(?:\.\d{1,2})?|\d+\s*(?:¢|cents?))/i;
const TOTAL_REGEXES = [
  /total\s+spent[:\s]+(?:\$\s*(\d+(?:\.\d{1,2})?)|(\d+)\s*(?:¢|cents?))/i,
  /spent\s+(?:\$\s*(\d+(?:\.\d{1,2})?)|(\d+)\s*(?:¢|cents?))/i,
  /(?:\$\s*(\d+(?:\.\d{1,2})?)|(\d+)\s*(?:¢|cents?))\s+to\s+spend/i,
  /has\s+(?:\$\s*(\d+(?:\.\d{1,2})?)|(\d+)\s*(?:¢|cents?))\s+to\s+spend/i,
  /budget[:\s]+(?:\$\s*(\d+(?:\.\d{1,2})?)|(\d+)\s*(?:¢|cents?))/i,
];
const MONEY_GLOBAL_REGEX = /\$\s*(\d+)(?:\.(\d{1,2}))?|\b(\d+)\s*(?:¢|cents?)\b/gi;

function parseMoneyMatchToCents(match: RegExpMatchArray | null): number | undefined {
  if (!match) return undefined;
  if (match[1] != null) {
    const dollars = Number(match[1]);
    const cents = Number((match[2] ?? "0").padEnd(2, "0"));
    return dollars * 100 + cents;
  }
  if (match[3] != null) {
    return Number(match[3]);
  }
  if (match[0]) {
    const dollarMatch = match[0].match(/\$\s*(\d+)(?:\.(\d{1,2}))?/i);
    if (dollarMatch) {
      const dollars = Number(dollarMatch[1]);
      const cents = Number((dollarMatch[2] ?? "0").padEnd(2, "0"));
      return dollars * 100 + cents;
    }
    const centMatch = match[0].match(/(\d+)\s*(?:¢|cents?)/i);
    if (centMatch) {
      return Number(centMatch[1]);
    }
  }
  return undefined;
}

function titleCase(raw: string): string {
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function normalizeItemLabel(raw: string): string {
  let label = raw
    .replace(/^(and|a|an|the|each|every|one)\s+/i, "")
    .replace(/\b(costs?|for|priced?)\b.*$/i, "")
    .replace(/\b(shop|store|stand|where|with|child|there|are|is)\b.*$/i, "")
    .replace(/[^a-z\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (label.endsWith("ies")) label = `${label.slice(0, -3)}y`;
  else if (label.endsWith("s") && !label.endsWith("ss")) label = label.slice(0, -1);

  return titleCase(label);
}

function extractTotalSpent(text: string): number | undefined {
  for (const regex of TOTAL_REGEXES) {
    const match = text.match(regex);
    const cents = parseMoneyMatchToCents(match);
    if (cents != null) return cents;
  }
  return undefined;
}

function isMoneySentence(sentence: string): boolean {
  return MONEY_REGEX.test(sentence);
}

function extractMoneyItems(text: string): Array<{ id: string; label: string; priceCents: number }> {
  const sentences = text
    .split(/[.!?\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter(isMoneySentence);

  const items: Array<{ id: string; label: string; priceCents: number }> = [];
  const seen = new Set<string>();

  for (const sentence of sentences) {
    if (/(total|spent|budget|to spend|coins? to pay|coin options?)/i.test(sentence)) {
      continue;
    }

    const moneyMatch = sentence.match(MONEY_REGEX);
    if (!moneyMatch) continue;

    const priceCents = parseMoneyMatchToCents(moneyMatch);
    if (priceCents == null) continue;
    const label = normalizeItemLabel(sentence.slice(0, moneyMatch.index ?? sentence.length));
    if (!label) continue;

    const key = `${label.toLowerCase()}-${priceCents}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      label,
      priceCents,
    });
  }

  return items;
}

function inferMoneyAskVisual(
  question: string,
): Extract<WorksheetCanvasModel, { kind: "money_scene" }>["askVisual"] {
  const q = question.toLowerCase();
  if ((q.includes("what coin") || q.includes("which coin") || q.includes("pay")) && q.includes("buy")) {
    return "payment_choice";
  }
  if (q.includes("how many") && (q.includes("buy") || q.includes("bought"))) {
    return "item_count";
  }
  if (q.includes("how much") && (q.includes("need") || q.includes("cost"))) {
    return "item_price";
  }
  if (q.includes("how much") || q.includes("total")) {
    return "total_cost";
  }
  return "item_price";
}

function extractMoneyAmounts(text: string): number[] {
  const amounts: number[] = [];
  for (const match of text.matchAll(MONEY_GLOBAL_REGEX)) {
    const value = parseMoneyMatchToCents(match as unknown as RegExpMatchArray);
    if (value != null && Number.isFinite(value)) amounts.push(value);
  }
  return amounts;
}

function deriveComparisonAmounts(
  question: string,
  sourceText: string,
): Extract<WorksheetCanvasModel, { kind: "compare_amounts" }> | null {
  const q = question.toLowerCase();
  if (!/(greater|less|more|bigger|smaller)/i.test(q)) {
    return null;
  }
  const amounts = extractMoneyAmounts(sourceText);
  if (amounts.length < 2) return null;
  return {
    kind: "compare_amounts",
    leftAmountCents: amounts[0],
    rightAmountCents: amounts[1],
    askVisual: q.includes("less") || q.includes("smaller") ? "less" : "greater",
  };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderCookie(x: number, y: number): string {
  return [
    `<circle cx="${x}" cy="${y}" r="34" fill="#D97706"/>`,
    `<circle cx="${x - 10}" cy="${y - 12}" r="5" fill="#7C2D12"/>`,
    `<circle cx="${x + 12}" cy="${y - 4}" r="5" fill="#7C2D12"/>`,
    `<circle cx="${x - 2}" cy="${y + 12}" r="5" fill="#7C2D12"/>`,
  ].join("");
}

function renderPeanut(x: number, y: number): string {
  return [
    `<ellipse cx="${x - 12}" cy="${y}" rx="22" ry="28" fill="#E6BE8A"/>`,
    `<ellipse cx="${x + 12}" cy="${y}" rx="22" ry="28" fill="#D4A373"/>`,
    `<line x1="${x - 26}" y1="${y + 2}" x2="${x + 26}" y2="${y - 2}" stroke="#B08968" stroke-width="3"/>`,
  ].join("");
}

function renderGenericItem(x: number, y: number): string {
  return `<rect x="${x - 28}" y="${y - 28}" width="56" height="56" rx="16" fill="#FCD34D"/>`;
}

function renderItemArtwork(label: string, x: number, y: number): string {
  const lower = label.toLowerCase();
  if (lower.includes("cookie")) return renderCookie(x, y);
  if (lower.includes("peanut")) return renderPeanut(x, y);
  return renderGenericItem(x, y);
}

export function summarizeWorksheetCanvasModel(model: WorksheetCanvasModel): string {
  if (model.kind === "money_scene") {
    const itemSummary = model.items
      .map((item) => `${item.label} ${item.priceCents}¢`)
      .join(". ");
    const total =
      model.totalSpentCents != null ? `. Total spent ${model.totalSpentCents}¢.` : "";
    const budget =
      model.budgetCents != null ? `. Budget ${model.budgetCents}¢.` : "";
    return `Money scene. ${itemSummary}${total}${budget}`.trim();
  }
  if (model.kind === "compare_amounts") {
    return `Compare amounts. ${model.leftAmountCents}¢ and ${model.rightAmountCents}¢.`;
  }
  return "Worksheet scene.";
}

export function deriveWorksheetCanvasModel(
  source: WorksheetCanvasSource,
): WorksheetCanvasModel | null {
  const canvasDisplay = String(source.canvas_display ?? "").trim();
  const question = String(source.question ?? "").trim();
  const hint = String(source.hint ?? "").trim();
  const sourceText = `${canvasDisplay} ${question} ${hint}`.trim();
  const comparison = deriveComparisonAmounts(question, sourceText);
  if (comparison) return comparison;

  const items = extractMoneyItems(sourceText);
  const totalSpentCents = extractTotalSpent(sourceText);

  if (items.length >= 1 && (totalSpentCents != null || /cent|¢/i.test(sourceText))) {
    return {
      kind: "money_scene",
      items,
      totalSpentCents,
      askVisual: inferMoneyAskVisual(question),
    };
  }

  return null;
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

function extractFirstCount(text: string): number | null {
  const numeric = text.match(/\b(\d+)\b/);
  if (numeric) return Number(numeric[1]);

  const words = text.toLowerCase().match(/\b[a-z]+\b/g) ?? [];
  for (const word of words) {
    if (word in NUMBER_WORDS) return NUMBER_WORDS[word];
  }
  return null;
}

export function deriveWorksheetCanonicalAnswer(
  source: WorksheetCanvasSource,
): string | null {
  const model = deriveWorksheetCanvasModel(source);
  if (
    model?.kind === "money_scene" &&
    model.askVisual === "item_count" &&
    model.items.length === 1 &&
    model.totalSpentCents != null &&
    model.items[0].priceCents > 0
  ) {
    return String(Math.floor(model.totalSpentCents / model.items[0].priceCents));
  }
  return null;
}

export function isWorksheetTranscriptCorrect(
  source: WorksheetCanvasSource,
  transcript: string,
): boolean | null {
  const canonical = deriveWorksheetCanonicalAnswer(source);
  if (canonical == null) return null;
  const count = extractFirstCount(transcript);
  if (count == null) return false;
  return count === Number(canonical);
}

export function renderWorksheetCanvasModelSvg(
  model: WorksheetCanvasModel,
): string | null {
  if (model.kind === "compare_amounts") {
    const leftIsGreater = model.leftAmountCents > model.rightAmountCents;
    const rightIsGreater = model.rightAmountCents > model.leftAmountCents;
    return `<svg width="500" height="300" viewBox="0 0 500 300" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.12"/>
    </filter>
  </defs>
  <rect x="28" y="36" width="444" height="228" rx="28" fill="#FFF9E6"/>
  <g>
    <rect x="72" y="88" width="140" height="116" rx="18" fill="#FFFFFF" filter="url(#shadow)"/>
    <circle cx="108" cy="126" r="20" fill="#FACC15"/>
    <text x="108" y="132" text-anchor="middle" font-family="Nunito, Arial, sans-serif" font-size="16" font-weight="900" fill="#854D0E">¢</text>
    <text x="142" y="134" text-anchor="start" font-family="Nunito, Arial, sans-serif" font-size="36" font-weight="900" fill="#1D4ED8">${model.leftAmountCents}¢</text>
    <text x="142" y="168" text-anchor="start" font-family="Nunito, Arial, sans-serif" font-size="16" font-weight="800" fill="#4B5563">Pile A</text>
    ${leftIsGreater ? '<text x="142" y="192" text-anchor="start" font-family="Nunito, Arial, sans-serif" font-size="14" font-weight="800" fill="#16A34A">Greater amount</text>' : ""}
  </g>
  <text x="250" y="152" text-anchor="middle" font-family="Nunito, Arial, sans-serif" font-size="28" font-weight="900" fill="#92400E">vs</text>
  <g>
    <rect x="288" y="88" width="140" height="116" rx="18" fill="#FFFFFF" filter="url(#shadow)"/>
    <circle cx="324" cy="126" r="20" fill="#FACC15"/>
    <text x="324" y="132" text-anchor="middle" font-family="Nunito, Arial, sans-serif" font-size="16" font-weight="900" fill="#854D0E">¢</text>
    <text x="358" y="134" text-anchor="start" font-family="Nunito, Arial, sans-serif" font-size="36" font-weight="900" fill="#1D4ED8">${model.rightAmountCents}¢</text>
    <text x="358" y="168" text-anchor="start" font-family="Nunito, Arial, sans-serif" font-size="16" font-weight="800" fill="#4B5563">Pile B</text>
    ${rightIsGreater ? '<text x="358" y="192" text-anchor="start" font-family="Nunito, Arial, sans-serif" font-size="14" font-weight="800" fill="#16A34A">Greater amount</text>' : ""}
  </g>
</svg>`;
  }

  if (model.kind !== "money_scene") return null;

  const itemCount = Math.max(model.items.length, 1);
  const leftWidth = model.totalSpentCents != null ? 330 : 400;
  const spacing = leftWidth / itemCount;

  const cards = model.items
    .map((item, index) => {
      const centerX = 90 + spacing * index;
      const cardX = centerX - 55;
      return `
      <g>
        <rect x="${cardX}" y="78" width="110" height="138" rx="16" fill="#FFFFFF" filter="url(#shadow)"/>
        ${renderItemArtwork(item.label, centerX, 122)}
        <text x="${centerX}" y="168" text-anchor="middle" font-family="Nunito, Arial, sans-serif" font-size="22" font-weight="800" fill="#2B2B2B">${escapeXml(item.label)}</text>
        <rect x="${centerX - 32}" y="182" width="64" height="30" rx="8" fill="#FB923C"/>
        <text x="${centerX}" y="203" text-anchor="middle" font-family="Nunito, Arial, sans-serif" font-size="18" font-weight="800" fill="#FFFFFF">${item.priceCents}¢</text>
      </g>`;
    })
    .join("");

  const totalBox =
    model.totalSpentCents != null
      ? `
      <g>
        <rect x="365" y="96" width="110" height="82" rx="16" fill="#BFE5FF" filter="url(#shadow)"/>
        <circle cx="390" cy="128" r="16" fill="#FACC15"/>
        <text x="390" y="133" text-anchor="middle" font-family="Nunito, Arial, sans-serif" font-size="14" font-weight="900" fill="#854D0E">¢</text>
        <text x="442" y="136" text-anchor="middle" font-family="Nunito, Arial, sans-serif" font-size="26" font-weight="900" fill="#1D4ED8">${model.totalSpentCents}</text>
        <text x="420" y="158" text-anchor="middle" font-family="Nunito, Arial, sans-serif" font-size="14" font-weight="800" fill="#1D4ED8">Total Spent:</text>
      </g>`
      : "";

  return `<svg width="500" height="300" viewBox="0 0 500 300" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.12"/>
    </filter>
  </defs>
  <rect x="28" y="36" width="444" height="228" rx="28" fill="#FFF9E6"/>
  ${cards}
  ${totalBox}
</svg>`;
}
