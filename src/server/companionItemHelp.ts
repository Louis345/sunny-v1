/**
 * Which open problem her companion helped with, per child and game (2026-11-10: Reina's math answers were all saved
 * "on her own" because built games never report companion help). Noted when her companion answers her while a
 * problem is open; taken once when that game's answers are saved. In memory: a restart loses only unsaved notes.
 */
const helped = new Map<string, Set<string>>();
const MAX_GAMES = 50;

export function noteCompanionHelpOnItem(childId: string, nodeId: string, itemId: string): void {
  const key = `${childId}\u0000${nodeId}`;
  if (!helped.has(key) && helped.size >= MAX_GAMES) helped.delete(helped.keys().next().value!);
  const items = helped.get(key) ?? new Set<string>();
  if (!items.has(itemId)) console.log(` 🎮 [companion-help] [noted] child=${childId} node=${nodeId} item=${itemId}`);
  helped.set(key, items.add(itemId));
}

export function takeCompanionHelpItemIds(childId: string, nodeId: string): string[] {
  const key = `${childId}\u0000${nodeId}`;
  const items = [...(helped.get(key) ?? [])];
  helped.delete(key);
  return items;
}
