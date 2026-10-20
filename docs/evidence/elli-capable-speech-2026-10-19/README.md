# Elli: useful spoken help, chosen by the companion

**Proposed fix; no merge before human kiosk acceptance and explicit approval of the tested revision.** Stacked on PR #14, base `69f1d44`. No real child's chart was changed. The source session is the adult-run synthetic `elli-help-demo` session on October 19 New York time (October 20 UTC).

## Failure → cause → change

| Human said | Elli did | Earliest cause | Change |
| --- | --- | --- | --- |
| “Can I say slower?” at 02:59:26 UTC, during Discovery (STT wording) | Replayed the whole word at the existing pace | No speech-rate capability existed | AI-selected provider pace for upcoming audio, including whole-word replay |
| “Any clues, tips?” during later Hidden Word Practice | “I can't peek at the letters, but you can hear the word again if you want — want me to replay it?” | Frozen **practice** was projected as replay-only because letters were hidden | Bind teaching availability to the server-verified Planner item role |
| “Yeah. But can you sound it out for me?” | Another whole-word replay | Same projection error withheld the teaching target and sound reference | Supply canonical target, CMU sounds, syllable count and stress; Elli chooses how to explain |

[Exact line-numbered transcript, prior Discovery state, frozen practice settings and source hashes](session-excerpts.json). Replay executions and browser acknowledgements existed; they proved playback, not useful teaching. Successful replay takes audio ownership, so those turns need not contain assistant text.

Decision chain: assignment/chart → Planner freezes `act-radar-all-recall` with `measurementRole=practice` → Word Radar hides letters during response → context projection infers `stimulus_only` from visual visibility → Elli has replay but no teaching target/reference → repeated help produces more replay. **Context projection was the earliest wrong layer**, not the Planner's practice intent. Labs covered visible teaching and hidden checks but omitted hidden practice. Humans heard the mismatch; transport tests only established that audio played.

A second cause was contradictory instructions. Elli's identity still said “Do not repeat the target” and “Never reveal the active answer”; shared instructions imposed a fixed hint ladder and two-sentence cap. These are reconciled with requested teaching. Hidden pronunciation practice permits spoken sounds/syllables, not letter-by-letter answers. No canned tutor dialogue or keyword router is added.

## Capabilities and execution

- A server-bound frozen instruction/practice item can expose its canonical target and pronunciation facts with hidden lettering. A forged browser word cannot replace the canonical target. Known independent node/item roles remain private even when binding fails or the browser claims visibility. Legacy visible teaching with no frozen role remains supported.
- `setSpeechRate(0.7…1.2)` configures upcoming speech through the existing bridge. Elli chooses pace, syllables, blending and explanations. Current configured pace appears each turn; the receipt includes previous pace. Old model actions cannot retarget a new item.
- Pace is scoped to the item and launch where Elli chose it. Other items initialize at normal pace unless she chooses their pace. **Snapshot updates do not reset or stop audio.** Both production companion and narration ownership carry that scope. The existing retirement path preserves an incoming item's already-owned audio while retiring obsolete speech.
- The live provider rejected changed settings mid-socket. The bridge stores the desired setting before awaiting a drain, or updates a still-CONNECTING initialization. It preserves delivered-PCM proof across reconnects. Tests run rate/replay in both orders through the actual slim SessionManager toolkit, narration event route and bridge, with a fake provider.
- With a bound typed presentation and active typed chart, each playback acknowledgement appends `stimulus.played`: actual generated rates (or unknown), playback identity and delivery outcome, citing the original presentation. Session traces retain conditions when typed recording is unavailable; that condition is logged. A failed receipt write logs an error and cannot stall playback completion.
- Existing help accounting still attaches assistance to the item. The real HTTP submission test proves hidden-practice help becomes assisted practice in **both** the JSON cycle and typed SQLite response. No academic outcome is inferred from a tool call, PCM, delivery acknowledgement or game completion.

Remaining deterministic code handles identity, measurement-role truth, provider range, protocol, cancellation and records. It does not choose a teaching strategy. This follows [AI_DESIGN_PRINCIPLES.md](../../../AI_DESIGN_PRINCIPLES.md). **Tradeoff:** pace is item-scoped rather than a durable session preference; this limits carry-over while independent measurement conditions are being tested. Opus and the human should challenge that choice, including the proposed contract-40 treatment of slower whole-word elicitation. It is not permission to merge. No syllable or letter teaching is permitted during an independent check.

## Measurements: successes, failures and uncertainty

The first live speed probe failed despite mocked per-message tests passing. The provider returned [protocol_violation](provider-error.json): voice settings must not change after initialization. The [official guide](https://elevenlabs.io/docs/eleven-api/guides/how-to/websockets/realtime-tts) describes per-message overrides, but the live endpoint rejected changing speed. The implementation now reconnects with the selected setting. The [provider's documented range](https://help.elevenlabs.io/hc/en-us/articles/13416271012497-Can-I-slow-down-the-pace-of-the-voice) is 0.7–1.2.

Same phrase, voice, Flash 2.5 bridge and output format; rate is the only deliberate variation. Successful small probes were:

| Probe | Normal PCM duration | 0.7 PCM duration | Longer |
| --- | ---: | ---: | ---: |
| Earlier transport revision | 4,922.625 ms | 6,594.458 ms | 33.96% |
| Intermediate revision | 5,805 ms | 7,337.5 ms | 26.40% |
| **Final scoped bridge** | **4,644 ms** | **8,637.833 ms** | **86.00%** |

Final first received audio: 571.21 versus 712.36 ms. [Final measurements and exact bridge hash](latest/audio-measurements.json), [normal WAV](latest/speech-1.wav), [slower WAV](latest/speech-0.7.wav), [trace](latest/provider.log). No waveform stretching or pitch manipulation was applied. Durations derive from PCM bytes at 24 kHz, mono, signed 16-bit. All three pairs were longer at 0.7, but the large variation precludes a linear speed, latency or intelligibility claim. Historical probes remain in the root and `final/` directories, labelled by their source hashes; **`latest/` is the scoped bridge**.

[Latest isolated production-runner conversation probe](latest/conversation-probe.json): historical fragment-only base/Elli prompts, synthetic context and instrumented tools; no live microphone, full SessionManager or audible dialogue. First practice request produced “My... self” and a 0.75 setting, rather than another private-word replay. On repeated feedback the latest probe selected **0.75 again** and repeated similar chunks. Earlier probes selected 0.75→0.7. **These tiny uncontrolled cases do not prove reliable reflection or strategy adaptation.** Response times were approximately 3.7–7.2 seconds in the latest four turns, not end-to-end audible latency. Independent-check context omitted the target and responses used whole-word replay, not syllables. Real replay ownership interrupts its requesting model turn; this isolated probe does not simulate that, so its spoken prefaces are not kiosk evidence.

The capability gap is repaired; useful, natural teaching and improvement after failed help remain human acceptance questions. No learning gain, pronunciation-scoring capability or latency improvement is claimed.

## Regression and independent review

Final focused run: **166 tests pass across eight files** ([log](focused-final.log)); **61 voice regressions pass** ([log](voice.log)); TypeScript clean. The unmodified full repository hook is pending at this report revision. One early hook run was stopped before a further fix. The next run caught a test still asserting contract version 39 after the explicit bump to 40; that expected-version marker is updated with every substantive assertion retained. Both stopped runs remain local diagnostics, not passing results. Runtime source is frozen for the final hook.

Tests were written red for the original permission/speed gaps, speech tool, conflicting prompts, canonical target, provider protocol, rate feedback, cancellation, scoped pace, incoming audio ownership, chart-write failure, practice receipts and stale pace actions. Raw captures remain locally; committed log copies only normalize trailing whitespace. The original cancellation regression expected rejection; after the concurrency correction its invariant is that cancellation cannot revive retired audio, while a configuration receipt can still resolve. No test or assertion was removed to obtain green. The strict schema's invalid-value fixture now uses a string for `delivered`: boolean `false` is a valid failed-delivery fact, not an invalid value.

- [First complete Opus 5.5 review: changes requested](opus-review.md), [API receipt](opus-review.json).
- [Second complete review: changes requested](opus-rereview.md), [API receipt](opus-rereview.json). It caught unsafe snapshot-driven audio teardown, evidence failure handling and missing production-route proof.
- [Final full Opus review: no P0/P1 implementation blockers, conditional and not approval](opus-final-review.md), [receipt](opus-final-review.json).
- [Responses, fixes and scope decisions](OPUS_REVIEW_RESPONSE.md). The full final re-review found no P0/P1 implementation blockers, conditional on full checks and explicitly not approval; a narrow addendum reviews the follow-up below. These are independent API reviews, not GitHub-account approvals.
- The initial attempt exhausted its budget without a report ([receipt](opus-review-empty-budget.json)); a disabled-thinking retry was rejected. Neither counts as a completed review or approval.

Reproduce the paid synthetic probe explicitly; fixed case set, bounded stream/model deadlines, no chart access:

```sh
DOTENV_CONFIG_PATH=/path/to/.env npx tsx -r dotenv/config scripts/measureCompanionSpeech.ts --live /output/dir
```

`--conversation-only` skips synthesis but still makes paid model calls. No re-ingestion or generation was needed. Human authorization: “Approve diagnosis and implement through PR,” followed by the explicit overnight fixes/push/measurement/Opus milestone and no merge before human verification; the human also specifically supported paid testing of additional slow/syllable help. Later transport fixes are inside that approved independent-review loop.

## Tomorrow's human acceptance

Use a registered isolated synthetic profile and the canonical visible `npm run sunny:run` kiosk launcher from the PR's tested commit. Verify its build ID before starting; an older kiosk must not stand in for this revision. Listen to normal audio, ask for slower speech, syllables/sounding out, and give explicit feedback when help is insufficient. Try myself, tonight, dissatisfied and title. Check spoken syllables, silent letters, natural blending, return to normal pace, activity replay versus companion explanations, item advance during speech, and exit/resume records. Test practice and independent checks separately.

Record requested/effective rate, received duration, request-to-first-audible latency, 1–5 adult usefulness, whether the explanation changes after feedback, target/sound errors, overlaps or dropped speech, and canonical assistance/exposure/playback facts. Unit/wire tests do not establish human audibility. Accepting slower whole-word elicitation as an independent-instrument condition requires explicit human agreement to contract 40. Record the tested commit, human findings, reviewer verdicts and any required manager approval; **nothing merges tonight**.

Full lifecycle acceptance is still blocked by separate concerns in [BUGS.md](../../../BUGS.md): WordBuilder response payloads, external-context post-session finalization and suppressed explainer narration. PR #14's short-word redaction concern also remains outside this focused repair. The earlier “Invalid child name” was an unregistered synthetic-profile setup error, corrected locally before the recorded session; no registration change is proposed here.


## Follow-up after the full review

The narration owner now uses its activity metadata/snapshot launch token rather than only a spelling launch, so pace also applies to non-spelling narration. A failing real-bridge SessionManager regression now passes. The existing post-stream detector also records `hidden_practice_letters_in_response_text`, with item/node/mode provenance, when a hidden-practice response contains target-letter runs. This observes response text; it does not censor speech or prove that letters were heard. Whole-word/sound modeling is a negative control. These follow-ups do not add tutoring scripts.

The audio-proof call-site audit closes the review's unverified-consumer question; see [audit](AUDIO_COUNTER_AUDIT.md). Structured history projection, fine-grained audible exposure and transient provider failure recovery remain explicit concerns. Interrupted partial-help accounting also needs a focused reproduction; completed-turn help coverage is not proof of exhaustive interruption accounting. The human test must include interruptions and strategy-neutral feedback.

## Whole-prompt audit and neutral feedback

The actual prompt assembler also loaded a secondary personality cap, free-chat cap, worksheet cap and screenshot-tool cap. These contradicted the shared freedom principle. They are removed; whole assembled homework/free-chat regressions caught the last screenshot cap red before its removal. The worksheet supplement retains answer/tool protocol with natural response length. Prompt template v25 invalidates the old template version. Latest focused prompt rerun: 27 tests in two files pass; the prior three-file compatibility run passed 41. Synthetic prompt construction reads files but writes no prompt cache; neither synthetic profile directory exists afterward. The standalone probe's ADVENTURE_MAP environment ends with its process.

[Opus prompt audit](opus-prompt-review.md) found the screenshot cap and additional pre-existing worksheet/tangent contradictions. The cap is fixed; remaining concerns are explicit in BUGS.md. Worksheet supplement is tested in isolation, not a fully assembled worksheet session. No comprehensive prompt-consistency claim is made.

[Actual assembled-prompt neutral-feedback probe](neutral-assembled/neutral-feedback.json): four cases (two words, two runs), two turns each. All four selected 0.75 and offered syllable help. On neutral “I still don't get it,” both myself runs selected 0.7, both dissatisfied runs kept 0.75. Some wording changed, but chunks repeated, and one dissatisfied phonetic rendering needs human checking. No audio was synthesized in this probe. Eight text turns ranged about 3.9–7.3 seconds; not audible latency. Earlier fragment-only probes remain historical evidence and missed the extra personality cap. The subsequent screenshot-description wording change was covered by regression, not another paid model sample.

[Follow-up Opus review](opus-addendum.md) accepted the trace/narration corrections without new P0/P1 findings; conditional, not approval. [Trace-consumer audit](TRACE_CONSUMER_AUDIT.md) confirms diagnostic truth traces do not enter model history or academic contradiction calculation; they do raise engineering audit issues.

## Full-suite test maintenance

A completed unmodified-hook attempt passed build and 4,489 backend tests, with three failures; web tests were not reached. Two assertions required intentionally removed blanket answer/length rules. They now assert private independent answers, permitted practice teaching, assisted evidence and natural response length with sessionLog protocol. The third fixture mocked getChildChart as undefined; it now starts each case with a chart without a learning cycle, preserving every routing assertion. The three repaired files pass all 123 tests. [Original failures](full-hook-test-maintenance-red.log), [focused rerun](test-maintenance-green.log). No production source changed in this maintenance step. The full hook is rerun rather than treating the failed suite as green.
