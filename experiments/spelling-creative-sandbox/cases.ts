/** Fictional children for the spelling sandbox. None is a real child; real charts are never read.
 * The same three cases as the Planner harness (`src/harness/harnessChildren.ts` on PR #49). */
export type SandboxChild = { id: string; words: string[]; missedWords: string[]; soul: string };

export const SANDBOX_CHILDREN: SandboxChild[] = [
  {
    id: "potter",
    words: ["night", "light", "right", "sight", "might", "fight", "write", "knife", "wrong", "climb"],
    missedWords: ["write", "knife", "wrong", "climb"],
    soul: "# Potter\n\n## Who She Is\nA fictional third grader who loves making things with her hands.\n\n## What Works\nShort rounds, a clear goal, making something by the end.\n\n## What Doesn't Work\nThe same game twice in a row. Long instructions.\n\n## Favorite Things\n- Pottery wheels and glazing mugs\n- Baking with her grandmother\n",
  },
  {
    id: "wrestler",
    words: ["catch", "match", "watch", "patch", "pitch", "stretch", "knock", "knee"],
    missedWords: ["stretch", "knock", "knee"],
    soul: "# Wrestler\n\n## Who She Is\nA fictional fourth grader who is fiercely competitive.\n\n## What Works\nBeating her own best score, a timer, being the champion.\n\n## Favorite Things\n- Wrestling practice and tournaments\n- Strategy board games\n",
  },
  {
    id: "no-soul-file",
    words: ["house", "mouse", "cloud", "proud", "shout", "found"],
    missedWords: ["cloud", "proud"],
    soul: "",
  },
];
