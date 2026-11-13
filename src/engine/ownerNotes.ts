import { familyDay } from "../utils/familyCalendar";
import { LIBRARY_GAMES, type LibraryGameId } from "./libraryGames";

/**
 * Dated notes from the owner to the next-board Planner (owner, 2026-11-11: "we tell the planner instead of forcing
 * it... the note expires after this week... the planner stays the decision maker"). A note is a fact in the
 * Planner's question, never a gate or an auto-inserted step; an expired note vanishes from every new question.
 */
export type OwnerNote = {
  childIds: string[];
  /** First and last family days (YYYY-MM-DD) the note is offered, inclusive. */
  from: string;
  expiresAfter: string;
  /** The note as the Planner reads it; `{quest}` and `{boss}` become the child's game titles. */
  note: string;
  /** The hand-built library games this note offers, per child. */
  libraryGames: Record<string, LibraryGameId[]>;
};

/** The one place owner notes live. Add a dated row; it expires by itself. */
export const OWNER_NOTES: OwnerNote[] = [{
  childIds: ["ila", "reina"],
  from: "2026-11-11",
  expiresAfter: "2026-11-15",
  note: "Owner, 11/11, one time: reveal the Quest stop and the Boss stop this week with the new 3D games. Quest = {quest}, Boss = {boss}. Normal gating otherwise.",
  libraryGames: { ila: ["opus-ila", "fable-ila"], reina: ["opus-reina", "fable-reina"] },
}];

export type OfferedLibraryGame = { id: LibraryGameId; title: string; role: "quest" | "boss" };
export type ActiveOwnerNote = { note: string; games: OfferedLibraryGame[] };

/** The owner note offered to this child's Planner on this family day, with its games for this subject; undefined when none applies. */
export function activeOwnerNote(input: { childId: string; subject: string; at?: Date | string; notes?: OwnerNote[] }): ActiveOwnerNote | undefined {
  const day = familyDay(input.at ?? new Date());
  for (const row of input.notes ?? OWNER_NOTES) {
    if (!row.childIds.includes(input.childId)) continue;
    if (day < row.from) continue;
    if (day > row.expiresAfter) {
      console.log(` 🎮 [owner-note] [expired] child=${input.childId} day=${day} expiresAfter=${row.expiresAfter}`);
      continue;
    }
    const games = (row.libraryGames[input.childId] ?? []).map(id => LIBRARY_GAMES[id]).filter(game => game && game.subject === input.subject)
      .map(game => ({ id: game.id, title: game.title, role: game.role }));
    if (!games.length) continue;
    const title = (role: "quest" | "boss") => games.find(game => game.role === role)?.title ?? "none";
    const note = row.note.replace("{quest}", title("quest")).replace("{boss}", title("boss"));
    console.log(` 🎮 [owner-note] [offered] child=${input.childId} day=${day} expiresAfter=${row.expiresAfter} games=${games.map(game => game.id).join(",")}`);
    return { note, games };
  }
  return undefined;
}
