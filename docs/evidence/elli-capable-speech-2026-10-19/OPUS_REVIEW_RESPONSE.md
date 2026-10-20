# Response to independent Opus 5.5 review

The first complete review requested changes. No approval is implied by this response. Its original report and API receipt remain beside this file.

| Finding | Response and verification |
| --- | --- |
| P1-1: pace leaks into later independent measurement | Pace now resets at item/node/launch changes. Requested slower whole-word elicitation remains available, with no syllable or letter teaching. Contract 40 makes that meaning explicit. Each spelling playback acknowledgement creates a typed `stimulus.played` receipt citing its original presentation, with generated rates or unknown, playback identity and delivery outcome. It is neither engagement nor an academic response. The item-advance/context test and canonical chart playback integration cover this. |
| P1-2: concurrent rate and replay race | The selected rate is stored before any await. A replay that takes ownership reads it during initialization; a still-CONNECTING stream is not discarded. Both AI-tool orders exercise `createSpeechTools` + `createReplayWordTools` + the real `narrateGameStimulus` adapter + provider wire packets. The replay synthesizes at 0.7 in both orders. A cancelled old drain never revives the old playback. |
| P1-3: reconnect erases PCM proof | Counters and actual generated-rate sets reset on new playback ownership, not socket replacement. Regression: PCM delivered → rate change → no further PCM still leaves `hadAudioThisTurn()` true. New playback gets fresh counters. |
| P2: legacy visible practice | Missing role returns unknown, preserving legacy visible teaching; known evaluation/Quest/Boss roles remain private. Positive instruction/practice and negative roles/binding/token cases test the helper directly. The real node-role union is evaluation/baseline/mystery/quest/boss; baseline and mystery are explicit teaching candidates only with a practice/instruction item role. |
| P2: stale pace facts / fabricated receipt | Live context reads the bridge every turn, independently of toolkit lifetime. Receipt includes previous speed and configured speed; configuration is distinct from audio acknowledgement. Superseded drains report current configuration rather than their obsolete request. |
| P2: CONNECTING text loss | Pending connection uses the selected rate at initialization and retains buffered text. Regression verifies initialization rate and the actual submitted phrase. |
| P2: letter-rule contradiction | Shared instructions explicitly limit hidden pronunciation practice to spoken sounds and syllables; an explicit request alone does not permit letter answers. No keyword disclosure router was added. Fine-grained exposure kinds beyond existing item assistance remain a follow-up; this PR does not claim exhaustive detection of every spoken-letter violation. |
| P2: “slower” source gap | Added the preceding Discovery item/config excerpt to `session-excerpts.json`. It is a whole-word elicitation case; the later frozen practice requests establish the teaching-context defect separately. |
| P2: help before response entry | Current-item practice support also attaches during flash/presentation/feedback; flash/presentation tests cover pre-answer help. Already committed historical responses are not rewritten. |
| P3: muted capability / logging | Known-disabled TTS does not advertise the tool. Rate configuration and item reset log significant changes. |
| P3: outdated measurement hash | `final/audio-measurements.json` names the final bridge hash; old probes remain explicitly historical. |
| P3: prosody context / repeated chart reads | Remain limitations for latency/prosody follow-up. No latency improvement or speech quality claim is made. |
| P3: governance bundling | AGENTS and AI design principles will be a separate documentation commit on the same PR. |

The HTTP integration now proves current hidden-practice teaching context → companion help → real response submission → assisted in both typed SQLite and JSON cycle, with practice provenance. It never writes a real child's data. The additional strict schema's generic invalid-value fixture uses a string for the new boolean `delivered` field: `false` is a valid delivery failure, not an invalid boolean. No assertion or test was removed to pass.

The context/transport fixes use deterministic code for identity, provider protocol, cancellation and factual records. They add no pedagogical routes, dialogue templates, fixed hint ladder, model call or automatic learning conclusion. Opus should still challenge this position. Repeated explanations in the small live probe show that useful strategy adaptation is not yet established; tomorrow's human judgement is essential.

This is a fresh API review of a frozen patch, not a GitHub-account approval. The user explicitly authorized the diagnosis/implementation/overnight review milestone and bounded paid verification. Human kiosk acceptance and explicit merge authorization remain outstanding.

## Second review: final correction supersedes the first reset implementation

The second review correctly requested changes. Its report remains unchanged in `opus-rereview.md`.

- **P1-A:** Removed snapshot-driven `resetSpeechRate()` entirely. Pace now belongs to `{itemId, launchToken}` and stream initialization reads the current owner's effective setting. Another item gets normal pace without a reset action or a second teardown path. Companion playback ownership now carries launch identity too. A regression exposed that the existing retirement path could also stop an incoming item's already-owned narration; it now preserves an owner matching the incoming item and launch. Tests with normal and slowed preceding items cover connecting narration and node-only updates. There is no new pedagogical router.
- **P2-A:** Audio receipt failures log `[spelling-audio] [record] [failed]` and cannot prevent acknowledgement completion, playback counters or microphone release. A throwing SQLite-writer regression proves this.
- **P2-B:** Contract 40 and the README now qualify typed recording by chart/presentation availability. Unavailability is logged; session playback traces retain rate conditions. No universal typed-record claim remains.
- **P2-C:** Known independent node/item roles are denied before checking binding agreement. Direct mismatch/token tests cover this; unknown legacy visible practice remains supported. An older native-visible fixture incorrectly used an evaluation node; it now uses a baseline node, with the same teaching assertions and separate explicit evaluation denials.
- **P2-D/E:** Actual slim SessionManager toolkit → replayWord → handleGameEvent → speakGameNarration → production WsTtsBridge → PCM terminal → browser acknowledgement → typed `stimulus.played` is exercised in **both tool orders**, with fake provider transport. The record contains 0.7 from real bridge PCM tracking, not a stubbed getter. Incoming-item tests likewise store normal-rate receipts. Native practice narration also records a bound stimulus even without the assessment-replay flag.
- **Additional stale-action check:** A pace tool captures item/launch identity when built and rejects execution after identity changes; it cannot retarget a new item. The ignored action is logged.
- **Tradeoff and human decision:** Item-scoped pace limits durable session preference; it is an explicit capability scope, not a fixed tutoring strategy. The proposed slower-whole-word elicitation rule remains subject to explicit human contract acceptance before merge.

The final provider probe is under `latest/`; older metrics/probes remain historical. Its repeated-feedback conversation again chose 0.75 twice and reused similar syllables. That is a real limitation, not evidence of reliable introspection. The PR enables requested teaching and actual pace control; human usefulness remains unverified. Governance files are committed separately from the feature. The interrupted early hook is not claimed as passing.


## Follow-up to the full final report

P2-1 now has a distinct post-stream hidden-practice letter-run trace with item/node/mode identity. It is explicitly response-text evidence, not proof of hearing or a preventive speech guard. P2-2 now passes a non-spelling activity's launch token to narration ownership; its actual SessionManager/bridge regression passes at 0.7. P2-3 is closed by the complete production-consumer audit. Historical syllabified context and transient-provider recovery remain documented, not represented as fixed. The full suite also caught an obsolete test marker (39 versus the intended 40); only the marker changed, with all Probe-publication assertions retained. A targeted independent Opus addendum reviews this small delta.
