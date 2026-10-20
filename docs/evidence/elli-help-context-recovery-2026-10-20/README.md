# Elli help across preparation and activity handoff

Scope approved by the human on October 20: repair context and response lifecycle, verify natural supported-practice help and its assistance records, then prepare a full-word human session. Latency optimization stays on the other branch. No publication or merge substitutes for human acceptance.

## Human evidence at parent revision 96d92f6

The isolated `elli-help-demo` journey used four assigned words: myself, tonight, dissatisfied, title. Humans operated the normal kiosk with live providers. Its synthetic chart is operational acceptance evidence, not a real child's learning record. Raw room conversation remains private.

| UTC time | Observation | Limit on inference |
| --- | --- | --- |
| 14:27:31 | Discovery complete; targeted generation queued. | Answers were saved; completion alone is not mastery. |
| 14:28:21 | After “Did I do good job?”, Elli said “We haven't actually started yet.” | Demonstrates incorrect awareness of completed work. |
| 14:30:38 | Turn 20 discarded its stale text; subsequent requests queued in PROCESSING. Its audio ended after 20,306 ms with zero chunks. | Stale turn did not release processing. The audio error alone does not prove a provider rejection. |
| 14:40:14 | `sessionStatus` reported `activeWord:null`, `activityMode:none`, `game:adventure-preparation`, `phase:ready` after practice-item events. | Trace current navigation when interpreting a single snapshot. The hidden producer defect is reproduced separately below. |
| 14:40:52 | After a slow sounding-out request, Elli said “I can't sound it out for you on this one.” | Refusal observed; context, role and conversation history all matter. Not every refusal has a proven single cause. |
| 14:45:01 | `setSpeechRate(0.7)` returned configured=true, playbackConfirmed=false. | Chosen speed is not audible-delivery proof. |
| 14:45:59 | `Session timeout reached (35 min wall)` ended the session. | Timer began at kiosk launch, including waiting before human conversation. Not a confirmed network outage. |
| 14:46:20 | New session 93600a started on the same code; prompt rebuilt and saved homework retained. | Reconnect changed several variables; not a controlled causal comparison. |
| 14:49:07 and 14:52:56 | Saori explicitly said Elli was helping. The new conversation demonstrated my/self, to/night and dis/sat/is/fied breakdowns. | Strong qualitative usefulness evidence for that conversation, not merge approval, pronunciation accuracy or learning gains. |

Source sessions: `05792b1e-d499-4b97-b47c-2bcd7a6586c4` and `93600ae2-ed36-42be-a9d8-566821ba3322`. Local source packets and `kiosk.log` are under `work/elli-unscripted-human-2026-10-20` in the task workspace. Curated observations are in its `live-test-observations.ndjson`; do not publish raw transcripts wholesale.

## Confirmed decision chain and earliest wrong layers

1. The preparation hook retains its machine after the child chooses Let's go. Its context-publishing effect checked machine activity, not screen visibility. Later clock/status changes therefore sent preparation state while the preparation screen was hidden. SessionManager faithfully accepted those inputs as current display state. The producer is the earliest wrong layer; adding a second pedagogical gate in the server is unnecessary.
2. `claimCompanionResponseTurn` correctly invalidates a response when its item/context identity changes. The runner correctly discards stale tokens/completion/errors, but previously returned without releasing PROCESSING, its abort controller, or its audio connection when no newer turn owned them. Later requests then queued. The earliest wrong decision here is treating output suppression as complete lifecycle retirement.
3. Frozen practice already supplies the canonical word, pronunciation reference and speech-rate tool, and permits sounds, syllables, blending, letters and demonstrations. Hidden written letters do not remove those capabilities. The fix preserves this contract rather than prescribing Elli's next words. Independent evaluation conditions remain independent; assistance remains recorded on its item.

## Implementation and design principles

- Publish preparation context only while that screen is actually visible. Keep real preparation progress and explicit board reveal unchanged.
- In the response runner's finalization, retire stale work only if it still owns the model turn and abort controller. Permanently revoke its generation, stop/cancel only its own audio, release its state, and pass a queued request through the existing handler. Preserve newer model turns and foreign audio owners.
- No new model call, retry loop, tutoring branch, canned response, hint ladder or educational planner. These are execution and ownership checks that let Elli's existing teaching judgment reach the child.
- Tradeoff: lifecycle cleanup adds mechanical code. This follows AI_DESIGN_PRINCIPLES.md's explicit allowance for interruption handling and truthful runtime execution; it is not a reduction in AI-owned conversation. No acoustic latency improvement is claimed.

## Regressions and measurable outcomes

- `web/src/tests/useAppAdventurePreparation.test.tsx`: after reveal, two background preparation updates escaped before the fix; zero escape afterward despite elapsed-time and status changes. Visible preparation context remains covered.
- `src/server/companionStaleTurnLifecycle.test.ts`: stale token/completion/error and foreign-audio cases reproduced four PROCESSING failures before the fix. They now retire to IDLE; queued help is forwarded once. Newer turns/audio are untouched. A further red/green regression prevents old callbacks reviving when the same item is shown again. A same-session follow-up reply completes without reconnecting. Provider/model outputs in these tests are fixtures, not proof of autonomous tutoring quality.
- `src/server/spellingDiscoverySupport.test.ts`: all four words expose their canonical target, natural practice-help capabilities and `setSpeechRate`; help remains assisted evidence. Existing independent-check and per-item support regressions remain intact. No real child chart is written.
- Focused checks: 120 backend tests across seven files and nine preparation web tests pass. Counts overlap broader suites and must not be added to them. The unmodified pre-commit hook requires build and full backend/web checks; report its actual result with the tested revision before handover.

## Next human acceptance

Run the canonical visible kiosk on the committed revision. Use the same complete four-word assignment and isolated test chart; retained prior exposure must remain explicit. Compare the first session's help with help after an optional reconnect, without changing code or help conditions. Exercise all four words, ask for slow replay and sounding out, give neutral feedback such as “I still don't get it,” and interrupt once. Record active item, assistance mode, tool requests/results, request ownership, browser playback receipts, response delay and Saori/Ila's usefulness judgment. Do not require particular praise or wording.

Pass conditions: the hidden preparation screen sends no new current-state messages; accepted requests do not remain queued behind a retired turn; the current word/help capabilities survive handoff; assistance stays attached to its item; the human finds the delivered explanations and pacing useful. Acoustic quality and meaningful adaptation remain human/provider evaluation tasks. Full human acceptance of this revision is pending. No merge is authorized.

## Open challenges for review

Can another invisible surface still publish current state? Could cleanup touch a newer turn or audio owner? Can queued replay attach help to the wrong item? Are assistance records complete for partially heard interrupted replies? Does accurate context suffice to prevent the refusal pattern, or does another assembled instruction conflict remain? Does the next human test reproduce Saori's positive result without a reset?

Other observed failures remain separate: missing WordBuilder attempt domain, first-session post-session `.some` failure, timer counting waiting time, emote success without a delivery listener, phonetic/letter feedback accuracy, and repeated explanations after uncertainty. These need their own diagnosis; this change does not claim to solve them.
