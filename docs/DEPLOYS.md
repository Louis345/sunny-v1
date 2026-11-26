# Deploy list: what is on Saori, and what goes next

Owner, 2026-11-25: every deploy has a list of what it carries. `scripts/deploy-saori.sh` prints the same list
(`[deploy] [list] [going-out]`) before it touches Saori. Move a row to "On Saori" only after the deploy's
`[done]` line, and note what to check in the logs afterwards.

## Next deploy (approved by owner 2026-11-25; deploy when Saori is reachable and no child is playing)

| Commit | What it does | Check after deploy |
|---|---|---|
| e01d3a3f | A replayed game with its old problem ids is rebuilt, so her answers count | No `[library] [replay] [bound]` for a game carrying old ids |
| 92960660 | Startup names any game on her board that carries another board's problem ids | Read `[startup-check] [stale-game]` for Ila's board 17 and Reina's board 5 |
| 698f6202 | A new math game that writes problem ids into its code goes back for repair | Builder repair lines on the next math board |
| 7de67ac2 | A failed game repairs itself once, with no one asking | `[board] [auto-repair]` lines after a Not ready stop |
| d890818a | Her outfit follows her companion everywhere (closet, board, FaceTime, 3D Quest/Boss) | `[wardrobe] [wearing] [migrated]` once per companion; `[library-game] [dress] [wearing]` in a Quest. Games already on a board keep starter clothes until that stop is rebuilt. |
| 68313e5d | The deploy script prints this list before it touches Saori | `[deploy] [list] [going-out]` lines |
| dfe6046a | The 3D Quest and Boss games are always on the tutor's menu (no parent note needed) | `[library-game] [offered] ... games=` on every board question |
| 70e3d1b8 | A problem whose wording holds its answer is flagged to the Planner and never counts as a clean check (Reina's 9 x 4 Boss) | `[planner-tools] [problem-written] ... answer_in_wording=` |
| 241c60fe | The pace her companion picks for its own talking sticks across games and sessions (Reina: Matilda too fast) | `[companion-speech] [pace] [saved]` |

## On Saori

| Date | Commit | What it carried |
|---|---|---|
| 2026-11-25 (morning) | 8d810d6e | Experiment ledger commits (b2757cf7, 8d810d6e) |
