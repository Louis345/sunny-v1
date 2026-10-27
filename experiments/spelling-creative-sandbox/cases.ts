/** Fictional children for the spelling sandbox, 10 words each. None is a real child; real charts are never
 * read. Profiles match the Planner harness cases (`src/harness/harnessChildren.ts` on PR #49). */
export type SandboxChild = { id: string; grade: number; words: string[]; missedWords: string[]; soul: string };

export const SANDBOX_CHILDREN: SandboxChild[] = [
  {
    id: "potter",
    grade: 3,
    words: ["night", "light", "right", "sight", "might", "fight", "write", "knife", "wrong", "climb"],
    missedWords: ["write", "knife", "wrong", "climb"],
    soul: "# Potter\n\n## Who She Is\nA fictional third grader who loves making things with her hands.\n\n## What Works\nShort rounds, a clear goal, making something by the end.\n\n## What Doesn't Work\nThe same game twice in a row. Long instructions.\n\n## Favorite Things\n- Pottery wheels and glazing mugs\n- Baking with her grandmother\n",
  },
  {
    id: "wrestler",
    grade: 4,
    words: ["catch", "match", "watch", "patch", "pitch", "stretch", "knock", "knee", "kitchen", "itchy"],
    missedWords: ["stretch", "knock", "knee"],
    soul: "# Wrestler\n\n## Who She Is\nA fictional fourth grader who is fiercely competitive.\n\n## What Works\nBeating her own best score, a timer, being the champion.\n\n## Favorite Things\n- Wrestling practice and tournaments\n- Strategy board games\n",
  },
  {
    id: "no-soul-file",
    grade: 3,
    words: ["house", "mouse", "cloud", "proud", "shout", "found", "round", "sound", "mouth", "south"],
    missedWords: ["cloud", "proud", "mouth"],
    soul: "",
  },
];
