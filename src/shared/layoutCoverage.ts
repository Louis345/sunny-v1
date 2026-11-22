/**
 * S40/S41: one rule for every game screen. Nothing covers a game's controls (buttons, inputs, anything tappable) or the
 * pieces a game marks as key with `data-sunny-key` (a rule sign, a target). The kiosk uses it to keep the companion
 * portrait off controls; the game builder uses it to send a game back for repair when its own text hides them.
 */
export type LayoutBox = { x: number; y: number; w: number; h: number; label: string };
export type Corner = "bottom-right" | "bottom-left" | "top-right" | "top-left";
export type CoveredControl = { target: string; coveredBy: string };

function overlapArea(a: LayoutBox, b: LayoutBox): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** The portrait's corner: bottom-right unless that covers a control; otherwise the free corner, else the least covered. */
export function pickFreeCorner(
  viewport: { w: number; h: number },
  size: { w: number; h: number },
  margin: number,
  controls: readonly LayoutBox[],
): { corner: Corner; box: LayoutBox; coveredLabels: string[] } {
  const left = margin, right = viewport.w - margin - size.w, top = margin, bottom = viewport.h - margin - size.h;
  const corners: Array<[Corner, number, number]> = [["bottom-right", right, bottom], ["bottom-left", left, bottom], ["top-right", right, top], ["top-left", left, top]];
  const scored = corners.map(([corner, x, y]) => {
    const portrait = { x, y, w: size.w, h: size.h, label: "portrait" };
    const covered = controls.filter(control => overlapArea(portrait, control) > 0);
    return { corner, box: portrait, coveredLabels: covered.map(control => control.label), area: covered.reduce((sum, control) => sum + overlapArea(portrait, control), 0) };
  });
  const best = scored.find(row => row.area === 0) ?? [...scored].sort((a, b) => a.area - b.area)[0]!;
  return { corner: best.corner, box: best.box, coveredLabels: best.coveredLabels };
}

/**
 * Runs inside a page (the kiosk's game frame, or the builder's headless browser), so it uses nothing from outside
 * itself. Lists the controls and key pieces, and for each one whatever else is painted over its centre.
 */
// Browser objects are typed loosely here: this file is shared with the server, which compiles without DOM types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PageNode = any;
export function collectGameLayout(root?: PageNode): { controls: LayoutBox[]; covered: CoveredControl[] } {
  const doc: PageNode = root ?? (globalThis as PageNode).document;
  const view: PageNode = doc?.defaultView;
  if (!view) return { controls: [], covered: [] };
  const name = (element: PageNode): string => String(element.innerText || element.textContent || element.getAttribute?.("aria-label") || element.getAttribute?.("title")
    || element.placeholder || String(element.tagName).toLowerCase()).replace(/\s+/g, " ").trim().slice(0, 80);
  const selector = "button, input:not([type=hidden]), select, textarea, a[href], [role=button], [data-sunny-key]";
  const controls: LayoutBox[] = [];
  const covered: CoveredControl[] = [];
  for (const element of Array.from(doc.querySelectorAll(selector) as ArrayLike<PageNode>).slice(0, 200)) {
    const style = view.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0 || rect.width < 4 || rect.height < 4) continue;
    if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= view.innerHeight || rect.left >= view.innerWidth) continue;
    const label = name(element);
    controls.push({ x: rect.left, y: rect.top, w: rect.width, h: rect.height, label });
    const hit: PageNode = doc.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    if (!hit || hit === element || element.contains(hit) || hit.contains(element)) continue;
    const coveringText = name(hit);
    if (coveringText && coveringText !== String(hit.tagName).toLowerCase()) covered.push({ target: label, coveredBy: coveringText });
  }
  return { controls, covered };
}

/** The builder's repair feedback, one line per hidden control or key piece. */
export function layoutCoverageProblems(covered: readonly CoveredControl[]): string[] {
  const clip = (text: string) => (text.length > 50 ? `${text.slice(0, 50)}…` : text);
  return covered.map(row => `the text "${clip(row.coveredBy)}" covers "${clip(row.target)}"; move it so nothing she needs is hidden`);
}
