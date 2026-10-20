# October 19 session improvement: proposal for review

Status: diagnosis and implementation proposal, not a completed runtime fix. Based on the isolated adult demo of revision e85b4af72a79f31a0a9ee840ee3fb1ed64668537. No real child learning outcomes are claimed.

Remote reconciliation: this proposal incorporates the newer base through b985d33. That base already records help on every hidden-check help turn, adds board-refusal diagnostics/recovery, and includes build and timeout fixes. These are existing upstream implementations, not new fixes in this proposal. Review them before proposing replacements; verify their effect with a fresh human session. The historical failures below explain the investigation, not the current code's proven behavior. Remaining work centers on speech capabilities, feedback, context consistency, and human verification of evidence integrity.

## Evidence and current status

The human session captured all four responses. The first board design returned a provider refusal; a subsequent run successfully published the teaching board. The refusal is historical, not a current board-building blocker. Its underlying provider cause is unknown.

The demo's board references `/generated/adventure-board-demo/silent-letter-world.jpeg`. That asset is absent from the isolated demo and present in both normal Sunny checkouts. The worker reported `generated=0 reused=6 attempted=0 skipped=reuse_only` and later `generated=0 reused=6 attempted=0 skipped=none`; no image-provider attempt was recorded. Publication reported `artwork=missing`. This is a sandbox asset omission plus a readiness-reporting concern, not evidence of missing image credentials. Do not introduce cosmetic rejection or regenerate the board to correct a missing static asset.

The human requested slower speech and reported that it sounded faster. Elli then emitted word chunks during protected recall. The saved `dissatisfied` response was `disadifid`, labeled unassisted despite the preceding help. After generation paused, Elli promised another round without confirmed availability.

Source artifacts remain on the originating Mac under `work/elli-human-demo-2026-10-19`: session `2026-10-19T18-03-37_elli-help-demo_homework_21b4cc/transcript.md`, `game-traces.ndjson`, the homework cycle `hw-spelling-49f60d21.json`, and its `adaptive-generation-worker.log` and `provider-diagnostics/design-response-1.json`. These are synthetic adult demo observations. PR #14 contains the human report and background diagnosis; local paths are not remotely accessible evidence. A remote reviewer must flag that limitation rather than imply independent verification.

## Earliest layers and remaining uncertainty

1. Audio capability: `src/server/ws-tts-bridge.ts` initializes fixed stability/similarity settings without an explicit speed control. The inspected `SessionManager.buildAgentToolkit` exposes no direct speech-speed tool. This establishes a capability gap in that path, not a provider-specific implementation prescription. Verify supported controls before choosing one.
2. Assessment behavior: context and companion prompt specify whole-stimulus-only help, yet the live reply gave chunks. Inspect the actual context delivered on that turn, competing instructions, and activity transition timing before attributing the violation entirely to model choice.
3. Assistance provenance: help was spoken but the attempt remained unassisted. Trace request, item binding, delivered support, and canonical observation to locate the earliest lost event. Do not mark every conversational exchange as instructional assistance.
4. Recovery awareness: inspect which generation facts and available actions reached Elli. Prefer accurate state and actionable tools over canned failure dialogue.

## Proposed implementation, after review

- Give Elli a small, coherent speech-delivery capability on the existing audio path: supported pacing, meaningful pronunciation references, and execution feedback. Preserve her choice of explanation; avoid fixed hint ladders and keyword-driven dialogue branches.
- Supply recent help attempts and learner feedback in the existing conversation context. Separate audio completion from evidence that the learner heard or benefited from it.
- Attach factual instructional-support events to the current attempt automatically, including interruption and item-transition cases. Preserve the normative learning contract; any change to its semantics requires its own explicit contract update.
- Expose actual generation state and available recovery actions through existing context/tools. Do not promise completion from an intention or an elapsed timer.
- Restore required static assets in the isolated demo setup and make missing-asset diagnostics truthful without adding a competing board-design authority.
- Consolidate duplicated behavior instructions only after tracing the active context. Remove conflicting or obsolete copies; keep facts, goals, execution guarantees, and learning evidence distinct.

## Planned tests and measurable acceptance

These tests are not yet written or run. Each runtime fix gets a failing regression at the confirmed responsible layer, then a passing result. Do not test exact conversational wording.

| Scenario | Evidence required |
| --- | --- |
| Learner asks for slower speech | A real delivery parameter/action changes; comparable slower audio has greater duration without pronunciation distortion; human finds it easier to follow |
| Learner says prior help failed | Recent attempt and feedback reach Elli; human evaluates whether her chosen next approach is useful and contextually appropriate |
| Protected recall versus teaching practice | Actual delivered context is correct; no instructional chunks in protected recall; useful pronunciation assistance is available in practice |
| Help then answer, interruption, or item change | Delivered instructional support is linked once to the correct attempt; unrelated conversation and stale replies are not misattributed |
| Generation failure then recovery | Context/tool results match runtime state; no fabricated success; recovery preserves captured responses |
| Demo board artwork | Referenced static asset resolves and appears in kiosk screenshots; missing asset is reported accurately without cosmetic layout vetoes |

Use controlled transport/integration tests for execution and bookkeeping. Use isolated conversational evaluation and a canonical visible kiosk for judgment, pronunciation, and usefulness. Report denominators, failures, measured audio duration, and human verdicts; do not infer pronunciation accuracy from STT or learning gain from completion. No paid evaluation calls without human authorization.

## Principle audit and reviewer challenge

This plan follows AI_DESIGN_PRINCIPLES.md by adding perception, action, and feedback rather than scripting a tutor. Deterministic item identity, event recording, cancellation, and truthful execution results remain because they make AI actions reliable and observable. A speech control should empower a choice, not prescribe when every explanation must occur.

Opus 5.5 should challenge the evidence, identify counterexamples or missing context, decide whether each proposed branch is necessary execution logic or competing behavioral policy, and propose simpler alternatives. Disagreement is useful. No approval is claimed. Implementation follows the reviewed, human-agreed scope; human testing and explicit human and manager approval are required before merge.
