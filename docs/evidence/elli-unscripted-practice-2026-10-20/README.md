# Elli: unscripted supported practice — first human test candidate

Status: local candidate; human acceptance pending. No new PR, reviewer approval or merge is claimed. Base is PR #17 head `001312f92263fb14959f12640e264c7258e1a068`. The human authorized local fixes and testing before publication, followed by Opus challenge and a second test before explicit merge approval.

## Observed failure and earliest decisions

The Oct 20 synthetic adult session `2731cc99-0dd5-4cb1-87e9-805d30e85b2a` ran the base revision. At 12:35:58 UTC Elli said, “I just can't say the letters on this one, that's the rule of the game.” The human reported that repeated praise and refusals were annoying rather than useful. This is user feedback, not a measured child learning outcome.

The decision chain was: frozen practice items → browser/native item updates → server item projection → assembled companion instructions → model/tool choice → generated audio. Earliest defects were missing native item-opening identity and the server treating periodic partial state as complete replacement. Word Radar first sent its canonical response item at 12:29:28–29 UTC, then updates with the same item index but no itemId/phase. Projection lost teaching context and item-scoped speech controls. Monster Stampede sent phase=playing without its canonical item-opening marker.

Separately, the assembled shared instructions banned letters in hidden practice, supplied praise examples, restricted tangents, and imposed wording. Runtime injected an exact turn-count transition. These were application prescriptions; pretrained tutoring ability could not override them reliably. Runtime also interpreted assistant farewell words as an instruction to end, encouraging compensating prompt bans. The greeting path spoke a constructed template directly rather than asking the model to choose its words.

At approximately 12:38 UTC Anthropic began rejecting calls with HTTP 400, credit balance too low. Recovery requested repetition despite a non-retryable billing problem. This explains the final outage, not the earlier assistance failures. The human reports replenishing credits; availability will be established by the next normal lifecycle call.

## Change and principle review

- Remove prescribed praise, dialogue examples, turn-count transition code/configuration, practice letter bans and mandatory speech alongside emotes.
- Let the model form its opening from current context, including independent evaluation orientation facts; bypass speech-recipient routing for this internal event. Normal wake/addressing behavior is retained.
- Let supported practice include sounds, syllables, blending, letter names and worked spelling demonstrations. Dictionary absence is uncertainty rather than a teaching veto. Authoritative targets remain server-bound.
- Preserve canonical identity across partial updates only when launch, node and item index match. A changed index or closed activity cannot inherit the old item.
- Emit Monster Stampede's canonical opening through the existing bridge and record practice help during playing, not just response entry.
- End sessions through existing explicit lifecycle actions, not assistant farewell wording. Existing deferred end-tool tests remain.
- Increase the first output budget from 500 to 1500, with a bounded empty-output retry at 3000. Log nonempty length exhaustion; this reduces the known low ceiling but does not prove truncation eliminated.

The shared companion base plus Elli identity shrank from 10,298 to 3,904 bytes (62.1%). This measures those two source texts, not the complete assembled model request or actual billed tokens.

Affected production paths: 70 added lines, 196 removed lines, net -126. Execution code alone (TypeScript and HTML, excluding the two companion Markdown sources) is +50/-75, net -25. Tests, governance and this report are excluded. This is reduction of behavioral prescription, not deletion of truth, interruption handling or evidence records. Remaining deterministic code binds identity, executes tools and records facts. Independent evaluation/checkpoint/Quest/Boss conditions remain a deliberate boundary; broadening those is not part of this practice experiment. Wheel answer conditions remain intact.

## Why the human caught it and the lab missed it

The human evaluated usefulness across repeated real interactions; the lab mainly tested complete item snapshots and tool configuration. Logs retained exact state updates and replies but did not flag item context loss as a failure or prove that requested pacing reached the same word. Fragment-level prompt checks missed contradictory personality/runtime supplements. Tests asserting a canned greeting and a transition threshold protected implementation choices rather than tutoring usefulness; those component tests now exercise generative openings, unchanged persona input and explicit lifecycle behavior. Independent answer protection, assistance, replay and stale-action tests remain.

## Verification and acceptance

Red evidence was captured locally before implementation: four initial regression failures (assembled instructions, model system prompt, periodic context, native opening), six opening/lifecycle failures, two budget/forced-speech failures and two internal-opening routing failures. These groups overlap and must not be summed as independent bugs.

Automated checks verify execution and accounting, not tutoring quality. The first human run must begin with fresh synthetic profile/chart data, live intake/evaluation, generated board, and supported teaching. Do not reuse the completed demo board or claim a simulated answer is a real child outcome.

Record for the exact tested commit:

| Observation | Measurement | First run |
| --- | --- | --- |
| Evaluation → generation → playable board | Captured launch/publication/visible-kiosk events, errors and elapsed time | Pending |
| Slower speech | Requested rate, same-item generated audio rate, browser delivery receipt, human audibility/usefulness | Pending |
| Syllables and sounding out | Exact request/reply and human judgment of accuracy/usefulness | Pending |
| Repeated help | Requests until useful help; changed explanation after feedback | Pending |
| Conversational burden | Unsolicited/repeated praise, interruptions, requests to mute | Pending |
| Evidence integrity | Assistance attached to the actual item; no assisted success promoted to independent mastery | Pending |
| Response latency | Capture end-of-turn, model first token, first PCM and playback timing where available | Pending |

Opus should challenge whether this actually expands useful judgment, whether any retained instructions contradict the principle, whether partial-state carry can leak stale targets, whether opening generation bypasses only internal routing, and whether our evidence supports improvement. The reviewer should also challenge the larger output budget's cost/latency tradeoff. No agreement is assumed.

Unresolved concerns to retain: billing-specific recovery, background speech being treated as addressed conversation, forecast-recall planning failure, and real perceptual pronunciation accuracy. Local raw logs contain private room conversation; publish only reviewed, relevant excerpts. No private transcript dump belongs in the PR.

Focused verification before commit: 182 tests passed across 12 files. Build initially caught a remaining legacy CLI transition-option caller; removed its obsolete threshold path too. Full unmodified commit-hook build and test results will be recorded after completion.

The first full hook run passed 4,491 backend tests and failed four assertions: contract version 40, fixed persona wording, a string ban on Monster Stampede currentWord, and SessionManager reaching its existing 2,500-line ceiling. The changed contract/behavior assertions now verify the intended conditions; the size limit is unchanged and state retention moved into the existing snapshot module (SessionManager is 2,492 lines). A new regression also revealed that successful tool-only turns entered empty-text recovery: the runner now completes those without canned speech and only cancels its own audio owner. Empty no-tool responses and real provider errors retain recovery. Two tool-only regressions and an active-binding regression were run red before implementation. Follow-up focused checks passed 1,150 tests across 14 files, plus the two contract/prompt assertions selected from their broader suites. Full checks must pass on the final candidate before handover.
