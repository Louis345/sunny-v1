/**
 * S40/S41: one rule for every game screen. Nothing covers a game's controls (buttons, inputs, anything tappable) or the
 * pieces a game marks as key with `data-sunny-key` (a rule sign, a target). The kiosk uses it to keep the companion
 * portrait off controls; the game builder uses it to send a game back for repair when its own text hides them.
 */
export type LayoutBox = { x: number; y: number; w: number; h: number; label: string };
export type CoveredControl = { target: string; coveredBy: string };

function overlapArea(a: LayoutBox, b: LayoutBox): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * The portrait's spot (S41; 11/22 owner: it must not jump around). Her home is the bottom-right corner. Only her circle
 * counts, not the pill and hint under it. If the circle would cover a control she slides up the right edge just enough,
 * at most half the screen; she never moves to another corner. If no spot on the right edge is free she stays home.
 */
export function pickPortraitLift(
  viewport: { w: number; h: number },
  size: { w: number; h: number },
  margin: number,
  controls: readonly LayoutBox[],
  step = 24,
  /** How far her circle sits above the screen's bottom at home (the pill and hint sit under it). */
  bottomGap = margin,
): { lift: number; coveredLabels: string[] } {
  const at = (lift: number): LayoutBox => ({ x: viewport.w - margin - size.w, y: viewport.h - bottomGap - size.h - lift, w: size.w, h: size.h, label: "portrait" });
  const covered = (lift: number) => controls.filter(control => overlapArea(at(lift), control) > 0).map(control => control.label);
  for (let lift = 0; lift <= viewport.h / 2; lift += step) {
    if (covered(lift).length === 0) return { lift, coveredLabels: [] };
  }
  return { lift: 0, coveredLabels: covered(0) };
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
