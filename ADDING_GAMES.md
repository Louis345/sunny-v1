# Adding games to Sunny

## Key rules (one line each)

- **Drop HTML → auto-registered:** Put a `.html` file in `web/public/games/` and run `npm run build` so the registry artifact updates; no manual tool list required.
- **GAME_META → only for rewards or special config:** Edit `src/server/games/registryDiscover.ts` → `GAME_META` when the game is a **reward** (not a teaching tool), needs non-empty `defaultConfig`, a different **public id** than the filename (`key`), or you want to override `voiceEnabled`.
- **postMessage contract → ready → start → game_complete:** The iframe may send `{ type: "ready" }` when loaded; the parent sends `{ type: "start", childName, config }`; when finished, send `{ type: "game_complete", ...payload }` (see existing games for score/accuracy fields).
- **Child-agnostic → use childName from config:** Read `childName` from the inbound `start` message (and any merged `config`); do not hardcode a child id in the game.
- **Dark purple theme → matches the system:** Use the same space/purple palette as `space-invaders.html` / `bd-reversal-game.html` (e.g. `#12002e`, `#1e0848`, `#534AB7`, `#7F77DD`, `#FFD93D`, `#9FE1CB`) so the iframe feels consistent with the rest of Sunny.

## Reference paths

| What | Where |
|------|--------|
| Game files | `web/public/games/*.html` |
| Discovery + `GAME_META` | `src/server/games/registryDiscover.ts` |
| Generated static registry (after build) | `src/shared/gameRegistry.generated.ts` |
| Server bridge | `src/server/game-bridge.ts` |

## Build reminder

Root **`npm run build`** runs the game-registry generator, then `tsc`. After adding or renaming HTML games, commit the updated `src/shared/gameRegistry.generated.ts` if your workflow keeps it in git.
