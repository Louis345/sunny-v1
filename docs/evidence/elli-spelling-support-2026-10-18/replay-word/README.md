# Replay the private stimulus through the activity

Base: 97df83ba2642b94ffd8001c18d9630930c86475b. Focused implementation on PR #14; no new PR or other proposal items.

## Diagnosis and design

Human help requests during hidden recall produced syllable chunks. The runtime projected the target into the live board text and again into canonical `spokenStimulus` facts. A prompt prohibition could not remove knowledge already given to the model. The approved fix moves whole-word delivery to an activity-owned replay capability instead of adding a scripted hint ladder.

Runtime retains canonical words for narration validation, item identity, grading, and contradiction detection. In stimulus_only mode, model-facing board/context/tool state omits the stimulus, and matching target text in remembered text/context/profile/status is redacted. The worksheet image is not pinned during that mode. Binary image messages are preserved by the text-history projection; this is not general image redaction. Teaching mode retains its target and CMU reference.

The zero-argument replayWord tool resolves the current runtime stimulus, rejects an obsolete item/launch/phase and busy playback, and requests the existing narration_request path. That path takes sole audio ownership, retiring the requesting conversational turn before synthesizing the stimulus. The result claims a request, not audibility. Existing browser playback acknowledgement increments audioReplays; failed or missing acknowledgement does not count as delivered replay. No new provider, speech-rate controls, tutoring script, learning schema, or scoring rule is added.

## Regression evidence

Initial context/action red: 9 failed, 49 passed in two files. This includes revised expectations that previously asserted the now-forbidden target leak; those old leak assertions were replaced with target absence and replay availability, not removed for a green result. An additional remembered-text regression failed before its implementation: 1 failed, 8 passed.

Final focused: 130 passed in seven files. Voice regression: 61 passed in eight files. Build: passed with existing eval/bundle-size warnings. See logs beside this report. Full local suite was not rerun; CI is responsible for that separate result. The full build/test pre-commit hook is skipped explicitly for this commit after the focused, build, and voice checks; no test or hook definition is modified.

Key tests:

- does not leak protected spelling through context aliases (hidden/unknown/missing/visible assessment)
- keeps the current private stimulus out of Elli context while the activity owns grading
- exposes replayWord without stimulus text and counts only browser-acknowledged replays
- commits the original presentation before any answer and counts acknowledged audio replays (now exercises replayWord and canonical chart engagement)
- does not replay a retired item or provide replayWord during visible teaching
- removes a protected stimulus from prior text context without corrupting images or teaching

The human caught this because they heard the actual help. Earlier logs retained it but the lab asserted private-target availability as intended behavior and did not test the activity-owned replay action. These regressions change that invariant at the context/tool boundary.

## Remaining verification

No live model compliance, useful pronunciation, audible response, learning gain, Round 0 result, or human approval is claimed. The human must test the updated canonical kiosk at the committed revision: open a hidden spelling check, summon Elli, ask to hear the word again, hear the activity's whole-word audio without chunks, then inspect the actual attempt and replay evidence. Repeat on a second item while Elli stays summoned. Teaching remains available with its existing pronunciation context. Review must assess any residual target source outside the inspected text/context/status channels; this is not a guarantee against inference from arbitrary prior images or tool data.

Merge remains blocked until review and relevant human acceptance plus explicit authorization. Real child data was not modified; automated checks use fixtures and a temporary chart.
