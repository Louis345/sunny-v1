/** Fictional children for the Planner harness. None is a real child; real charts are never read by a run. */
export const HARNESS_CHILDREN: Array<{ id: string; words: string[]; missedWords: string[]; soul: string }> = [
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
