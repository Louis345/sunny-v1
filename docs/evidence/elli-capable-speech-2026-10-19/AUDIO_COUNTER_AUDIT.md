# Audio proof call-site audit

Final Opus review P2-3 asked whether moving PCM-counter reset to ownership could affect unowned production consumers. This audit is inspection evidence, not a new test result.

Search scope: `src` and `scripts`, including all `hadAudioThisTurn`, `new WsTtsBridge`, `narrateGameStimulus`, and server bridge-connect call sites. Legacy test files are distinguished from production. No additional production consumer of `hadAudioThisTurn()` was found.

| Production location | Ownership / proof |
| --- | --- |
| `src/server/game-event-handler.ts:97` | Sole production read of `hadAudioThisTurn()`, after `narrateGameStimulus` has connected, submitted and finished its stimulus |
| `src/server/session-manager.ts:1111` | Sole production caller of that adapter begins a new request/item/launch owner immediately before narration |
| `src/server/companion-response-runner.ts:82` | Recovery begins its own request before connecting |
| `src/server/companion-response-runner.ts:146` | Ordinary model response begins its request before connecting/streaming |
| `src/server/companion-response-runner.ts:769` | Direct companion turn begins its request before connecting |
| `src/server/session-manager.ts:1938` | Early connection is priming only; it does not read PCM proof. The later speaking path claims ownership |
| `src/server/session-bootstrap.ts:1629` | Sole production bridge constructor; later speech uses the session paths above |
| `scripts/measureCompanionSpeech.ts:28` | Explicit synthetic probe uses a fresh bridge per sample and counts actual PCM bytes; it does not use `hadAudioThisTurn()` |

The current production adapter therefore gets a fresh per-request counter and rate set. Mid-turn socket replacement retains evidence; a new owner resets it. New SessionManager/fake-provider regressions exercise both and verify the actual rate receipt through browser acknowledgement. Worksheet, karaoke and story code contain no other call to this proof method.

Future producers must claim new playback ownership before interpreting this proof. This audit does not establish human hearing, exhaustive dynamic access from future code, or recovery from every provider failure.
