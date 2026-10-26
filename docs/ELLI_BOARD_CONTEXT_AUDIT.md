# Elli board conversation cleanup

Base: PR #25, `5c42d5fe`. The owner approved Claude's five-item deletion plan and independent review before the next demo test.

## Diagnosis and limits of the evidence

The human heard an unrelated personal question, recap and agenda after the earlier phase passed fragment tests. Those tests omitted initialized SessionContext and did not explicitly set canonical ADVENTURE_MAP. The full synthetic request exposes the earliest wrong layer: prompt assembly still supplied an independent tutor agenda and legacy checkout memory. These inputs can encourage that behavior; they do not prove which input caused each sentence in the earlier live session. That live request was not captured in full.

The canonical launcher already omitted the full canvas manual. The noncanonical robot capture overstated that part of the diagnosis. This change shares the existing slim predicate across prompt, context and tools, passing actual worksheet mode from bootstrap. It adds no conversation mode or runtime length enforcement.

## Removed from the board conversation path

- Checkout `companion_context.md` loading. Existing files remain untouched; confirmed relationship memory still arrives through the live memory builder. Soul/creator reads now use the configured context root; the tripwire detects SRC_DIR aliases.
- Warmup phase, Wilson/reading profile, scheduled focus-word commands and game menus. Display readiness, pause state, current activity and answer visibility remain. Status tools cannot reintroduce legacy phase/owner/streak/round fields.
- Voice-model canvasShow, canvasClear, launchGame and sessionLog. Native activity launch, evidence, completion, replayWord, speech rate, screenshots, Wheel and signal reporting remain. Independent source audit traced native routes and completion handlers, with no dependency on those four model tools.
- Scripted path-choice dialogue and false child-speech attribution. Internal events carry explicit source through history, board context and help evidence. Anthropic transport uses a labelled runtime-context envelope because separated system messages are unsupported; a real provider-conversion test intercepts fetch before network.
- Forced food reminders, redundant persona performance wording and screenshot thinking performance. Inline facial tags are optional; body/camera actions remain available. The shared brevity guidance applies to every turn. Existing silent/STT-only policies and successful quiet remain distinct from provider failure.

## Persona text

Before: “Elli is the active child's trusted friend. Warm, funny, a little chaotic, and completely in the child's corner.”

After: “Elli is the active child's trusted friend. Funny and completely in the child's corner.”

Both retain: “She remembers confirmed things the child tells her. Their shared history matters to her.” The companion identity still says “Warm, curious, gentle and playful.”

## Request evidence

`evidence/elli-board-context/{before,after}-synthetic-arrival.json` contains only synthetic data, built through the real initialized session, persona, context and toolkit. These are initial assembled requests, not provider wire traces, SDK tool-followup traces, reconstructions of private child speech, or proof of conversational quality.

Baseline → revised: system text 9,811 → 9,009 characters; turn context 1,152 → 444; serialized tool definitions 9,626 → 6,806 (11 → 9 tools). Counts include schemas, measured with Python JSON serialization. The optional production capture now records schemas with private file permissions and labels its scope.

## Regression and acceptance

Tests were run red first for assembled context, stale-file isolation, internal-event provenance, schema capture, retained status and requested help during narration. Independent review caught provider-system-message incompatibility and help lost during narration; both received regression coverage and were corrected before human testing.

The board robot now uses canonical server/runtime environment and recorded successful quiet at the voice provider boundary, preserving real request assembly/capture and asserting tool exclusion. It continues to play Discovery, Teaching and a reused successor and check evidence/Planner handoffs. It does not judge speech quality, explainer/Spell Check/Wheel play, or audibility. An intermediate CTA may disappear after fast recorded generation; it waits for that CTA or the actual board while retaining subsequent board assertions.

Full suites run in a disposable copy with synthetic protected-child fixtures, blank credentials and external network blocked. No real child folder is used as a test destination. Results and live acceptance are recorded after execution; neither source review nor a green robot authorizes a merge.

Live demo acceptance: first open, brief hello or quiet without personal-question/recap/agenda; short useful requested help; a fuller requested explanation; board completion and successor publication; human judgment that Elli is not annoying. Capture the exact initial request privately. Stop on a failed opening, retain evidence, and do not retry a paid response to seek a better sample.

Remaining backlog is unchanged: silence/presence policy, automatic thinking animations, existing activity narration and non-board tutor behavior require separate evidence and approval. This change does not promise those paths are free of scripted policy.

## Execution result — 2026-10-22

Application commit: `74ca3aba` on `test/elli-and-feedback-loop` (PR #25).

- Build passed in implementation worktree and demo checkout. Handwritten production delta: 76 added / 81 removed, net **−5 lines**. Test/evidence additions are separate.
- 65 focused tests passed, including real provider conversion with intercepted fetch, context-root isolation, quiet/failure behavior, internal-event provenance and requested help during narration.
- Full web suite passed: **1,039 / 1,039**.
- Full root suite was attempted in the isolated synthetic copy and interrupted after the clean robot timeout under the owner's stop-on-surprise rule; **no full-root pass is claimed**. The copied harness also emitted missing-Git-metadata warnings. It needs a proper isolated repository fixture for a complete rerun.
- Independent source review found provider-role and narration-help defects before acceptance; both were corrected and regression tested. Final source review reported no remaining concrete blocker, while explicitly reserving robot and human acceptance.
- The first canonical baseline robot timed out waiting for its last word. A later run waited for an intermediate CTA although the board was already visible; the lab now accepts that CTA or the actual board and keeps subsequent lifecycle/play/evidence assertions. Voice requests use a recorded quiet provider result, with actual assembled toolkit exclusion assertions.
- Another run published a reused successor, then lost Letter Rush because a concurrent build rewrote the watched game registry. Vite logged that reload immediately before disconnection. That was test orchestration interference, not evidence of a Letter Rush defect. Its partial results do not establish full loop success.
- **Clean rerun timed out** after Discovery and initial Teaching activities: the first hidden checkpoint word was generated locally, but the robot acknowledgement counter remained 10 while its poll expected 11. The later diagnostic contains the browser’s playback-confirmed event for that same request; its events lack timestamps, so we cannot establish whether confirmation preceded the poll deadline or whether the acknowledgement reached the server. This does not establish provider or playback failure. No fatal modal, server error or page error was captured. Cause remains unproven. Its diagnostic screenshot timed out; any earlier screenshot is not current evidence. No assertions were relaxed and no production activity code was changed to hide this result.
- **Live launch held.** The old demo kiosk was closed and the demo checkout was staged/built at the application commit, preserving local configuration/data. A fresh kiosk was not launched and no human acceptance is claimed. No re-ingestion, recovery, real-chart replay, paid retry, provider purchase, merge or ship command occurred.
- Protected real child folder fingerprints remained identical (475 and 144 files respectively).

Next required evidence: correlate one request ID across timestamped browser playback completion, WebSocket send/readiness, server receipt, counter increment and poll deadline. Establish the acknowledgement timeout’s responsible layer before another fix or claiming the full loop is ready. Once the lab passes, capture the exact first demo arrival request privately and let the owner judge the opening. Do not use repeated paid openings to select a favorable sample.
