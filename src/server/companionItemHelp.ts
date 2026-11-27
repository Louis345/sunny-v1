/**
 * Which open problem her companion helped with, per child and game (2026-11-10: Reina's math answers were all saved
 * "on her own" because built games never report companion help). Noted when her companion answers her while a
 * problem is open; taken once when that game's answers are saved. In memory: a restart loses only unsaved notes.
 */
const helped = new Map<string, Set<string>>();
const MAX_GAMES = 50;
// Children who have their companion's voice muted: a reply she cannot hear is not help (Saori 11/22–11/25).
const muted = new Set<string>();

export function setCompanionSpeechMuted(childId: string, isMuted: boolean, reason = "mute_button"): void {
  if (isMuted) muted.add(childId); else muted.delete(childId);
  console.log(` 🎮 [companion-help] [speech-${isMuted ? "muted" : "heard"}] child=${childId} reason=${reason}`);
}

export function isCompanionSpeechMuted(childId: string): boolean {
  return muted.has(childId);
}

export function noteCompanionHelpOnItem(childId: string, nodeId: string, itemId: string): void {
  if (muted.has(childId)) {
    console.log(` 🎮 [companion-help] [not-heard] child=${childId} node=${nodeId} item=${itemId} reason=muted`);
    return;
  }
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
