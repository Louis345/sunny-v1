# pronunciation-game — prototype

Flow-state pronunciation game. Words ride a conveyor belt toward the child,
they say the word aloud, it pops, score climbs.

**Phase 1 shipped:** new `NodeResult` contract, `VariationDeck` class,
`pickStyle` (child-day persistence + parent override), audio prefs,
single-source-of-truth `constants.js`. 94 tests passing.

## What's here

```
pronunciation-game/
├── logic.js          # pure functions — no DOM, no audio, no globals
├── logic.test.js     # vitest suite for logic.js (Node env)
├── constants.js      # single source of truth for tunable values
├── prefs.js          # localStorage prefs — pickStyle, audio prefs
├── prefs.test.js     # vitest suite for prefs (happy-dom env)
├── game.js           # orchestration layer — DOM, Web Audio, camera, STT
├── index.html        # entry point
├── MIGRATION.md      # Sunny-side diff for the new NodeResult contract
├── package.json
└── README.md
```

## Run

```bash
npm install          # one-time
npm test             # 94 tests, ~3s
npm run serve        # http://localhost:8000
```

**You cannot open `index.html` directly from `file://`.** Chrome refuses
`getUserMedia` on non-secure origins.

## Tests-first discipline

Every exported function from `logic.js` and `prefs.js` has tests pinning
its contract. Phase 1 followed red → green:

- Tests for `VariationDeck`, `buildNodeResult`, `pickStyle`,
  `getAudioPrefs`, `setAudioPref` were written and run RED first.
- Implementation added only after tests failed for the expected reason
  (missing exports, not logic bugs).
- All 94 tests green before any `game.js` wiring changed.

## URL params

```
?words=blister,carpet,thirteen        # override word list
?childId=ila                          # propagated to NodeResult
?difficulty=1|2|3                     # default 2
?beltMode=depth|horizontal            # canonical; ?mode= is deprecated
?duration=60000                       # default 60s
?nodeId=abc123                        # echoed in NodeResult
```

## NodeResult (new contract — see MIGRATION.md)

```ts
{
  type: 'node_complete',
  nodeId: string,
  childId: string,
  completed: boolean,             // false when child hits "back to map"
  accuracy: number,               // 0–1, wordsHit / wordsAttempted
  timeSpent_ms: number,
  wordsHit: number,
  wordsAttempted: number,         // hits + resolved misses; excludes
                                  // in-flight-at-timeout
  flaggedWords: string[],         // missed 2+ times
  xpEarned: number,
}
```

Posted to `window.parent` on game end AND on "back to map" (with
`completed: false`). Single shape, one handler.

## Style picker

Not yet wired into `game.js` (that's Phase 3). Available for the UI layer:

```js
import { pickStyle } from './prefs.js';
const style = pickStyle('ila');   // 'stamp' | 'shock' | 'glow' | 'boom'
```

- Child-day persistence: same child + same date → same style.
- Parent override (`localStorage['sunny.styleOverride']`) wins when valid.
  Invalid overrides warn and fall through.
- Stale/garbage stored values self-repair.

## Audio prefs

```js
import { getAudioPrefs, setAudioPref } from './prefs.js';
import { SUNNY_STORAGE } from './constants.js';

getAudioPrefs();  // { sfx: true, music: true }  (defaults)
setAudioPref(SUNNY_STORAGE.SFX_KEY, false);   // chimes off, music unchanged
setAudioPref(SUNNY_STORAGE.MUSIC_KEY, false); // heartbeat off
```

`setAudioPref` throws on unknown keys — no silent typo writes.

## What's in `constants.js`

- `SUNNY_AUDIO` — heartbeat BPM, bus gain, duck gain + ramp/hold (600ms
  total window — see spec §5c resolution), chime pitch range, fade times.
- `SUNNY_FEEDBACK` — allowed styles, persistence key builder, parent
  override key, forbidden-variation thresholds.
- `SUNNY_STORAGE` — localStorage keys.

Parent-dashboard runtime overrides will land at this one file when Sunny
migration happens. Nothing inline in `game.js`.

## Phases remaining

- **Phase 2** — Heartbeat audio (match Audio Moodboard v2 track 01),
  chime-only ducking, SFX/music gating.
- **Phase 3** — Rename existing feedback as `stamp` style, wire
  VariationDeck for stamp's detail variations.
- **Phase 4** — `shock` style.
- **Phase 5** — `glow` style.
- **Phase 6** — `boom` style.
- **Phase 7** — Settings bottom sheet.
- **Phase 8** — Reduced-motion + SR live region.

Each phase leaves the game working; shippable at any phase boundary.

## Known wobbles

- **Web Speech API restarts.** Chrome kills `continuous: true` recognition
  every ~60s. `onend` auto-restarts while the game is running.
- **Pitch cap** on the hit pop is at streak 10. Tests enforce this.
- **Calibration word** matches `/ready|start|ok|okay|go/`. Fine for single-
  child kiosk use; could false-trigger in noisy rooms.
