/**
 * The retro of the session so far, then the Planner's decision (2026-11-10: the Planner judged each board before the
 * retro of the session she played it in existed). A retro that fails is logged and never blocks the decision.
 */
export async function retroThenDecide<T>(input: { sessionDir: string | undefined; writeRetro: (sessionDir: string) => Promise<string | undefined>; decide: () => Promise<T> }): Promise<T> {
  if (input.sessionDir) {
    try {
      const file = await input.writeRetro(input.sessionDir);
      console.log(` 🎮 [handoff] [before-decision] [${file ? "written" : "skipped"}] dir=${input.sessionDir}`);
    } catch (error) {
      console.error(` 🎮 [handoff] [before-decision] [failed] reason=${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return input.decide();
}
