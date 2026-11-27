# What the next-board Planner sees: introspection sample (contract 56)

Made from a made-up cycle shaped like Ila's list (`src/scripts/fixtures/ilaLikeIntrospectionCycle.ts`); no real child file was read.
Boards: 1 first check, 2 teaching (explainer + radar), 3 built by decision 1 (picture explainer + radar), 4 built by decision 2 (radar re-run).
These two sections sit in the next-board prompt after the menu description, before the built-ins list. The `decide` tool now also requires `self_review` (what_i_tried, what_happened, why, what_i_change_now).

```text
Her track record on each word (code counted every recorded answer on this list; on her own means no help was recorded):
- import: on her own 0 of 4 right, wrote "inport" x3, "impot" x1; with help 2 of 2 right; help not recorded 0 of 1 right, wrote "inport" x1; practiced in: word-radar on boards 1, 2, 3, 4 ("Word Check", "Radar Warm-up", "Radar Run", "Radar Rematch"), visual-explainer on boards 2, 3 ("Sound Detectives", "Picture Clues"); latest on her own: "inport" (missed, board 4)
- dormant: on her own 1 of 2 right, wrote "dorment" x1; practiced in: word-radar on boards 1, 3 ("Word Check", "Radar Run"), visual-explainer on boards 2, 3 ("Sound Detectives", "Picture Clues"); latest on her own: "dormant" (right, board 3)
- ornament: on her own 1 of 2 right, wrote "ornamint" x1; help not recorded 1 of 1 right; practiced in: word-radar on boards 1, 2, 4 ("Word Check", "Radar Warm-up", "Radar Rematch"), visual-explainer on board 2 ("Sound Detectives"); latest on her own: "ornament" (right, board 4)
- pardon: on her own 2 of 3 right, wrote "parden" x1; help not recorded 1 of 1 right; practiced in: word-radar on boards 1, 2, 3, 4 ("Word Check", "Radar Warm-up", "Radar Run", "Radar Rematch"); latest on her own: "pardon" (right, board 4)
- Right every time she answered on her own: charge (1 of 1), carnivore (1 of 1)
Your journal: what you tried on earlier boards and what happened (your words from each decision; her answers counted by code):
- Decision 1 (2026-11-03, after board 2; generate_support; theory revised)
  Your reason: "She writes n for m in import; a picture of the lips closing may anchor it."
  You said you would change: "Show the m before p in import with a picture explainer." | "Radar practice on import, dormant and pardon."
  You said you would test next: "import on her own"
  You built board 3: visual-explainer "Picture Clues" (import, dormant); word-radar "Radar Run" (import, pardon, dormant)
  Her answers on those words, on her own, before this decision -> after it (until your next decision):
    - import: before 0 of 1 right (wrote "inport" x1) -> after 0 of 1 right (wrote "inport" x1)
    - dormant: before 0 of 1 right (wrote "dorment" x1) -> after 1 of 1 right
    - pardon: before 0 of 1 right (wrote "parden" x1) -> after 1 of 1 right
- Decision 2 (2026-11-05, after board 3; generate_support; theory revised)
  Your reason: "Radar went well for dormant and pardon; import needs more reps."
  You said you would change: "Another Radar round on import, pardon and ornament."
  You said you would test next: "import on her own again"
  You built board 4: word-radar "Radar Rematch" (import, pardon, ornament)
  Her answers on those words, on her own, before this decision -> after it (until your next decision):
    - import: before 0 of 2 right (wrote "inport" x2) -> after 0 of 2 right (wrote "impot" x1, "inport" x1)
    - pardon: before 1 of 2 right (wrote "parden" x1) -> after 1 of 1 right
    - ornament: before 0 of 1 right (wrote "ornamint" x1) -> after 1 of 1 right
```
