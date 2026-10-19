# ELLI: Ground spelling pronunciation help in the current activity

Status: implemented; deterministic checks pass; Opus 5.5 review and live acceptance pending.
Parent branch: `claude/board-canvas-no-logic` at `0b41c115bd72cbc3ab7c87d8c1838d3f6613001f`.

## Problem and observed impact

In the October 18 family session, Elli repeatedly encouraged sounding out without useful help, coached room-conversation words rather than the activity target, and invented a separate "g sound" in "tonight". These are interaction and instructional failures even when the activity eventually completes.

Minimal evidence excerpts (UTC; subtract four hours for Eastern on this date):

| Source session suffix | Time | Observed evidence |
| --- | --- | --- |
| `f242e1` | 21:34–21:38 | Repeated help requests ended with an explicit complaint that Elli was not helping; responses repeatedly requested another attempt. |
| `2c3ab8` | 21:49:00.692 | Elli requested sounding out "Tuscaloosa"; the preceding game state at 21:48:56.014 still identified `title`. |
| `2c3ab8` | 21:52:51.743 | Elli requested saying "pronounce" slowly; game state at 21:52:48.969 identified `dissatisfied`. |
| `57e918` | 22:05:23.144 | Elli asked where the "g sound" occurs in `tonight`; the game target was `tonight`. The dictionary reference is `T AH0 N AY1 T`, with no G phoneme. |

Selected original game-state fields and assistant responses are retained in [session-evidence.json](session-evidence.json). Raw transcripts contain family conversation and remain local. [Source integrity receipts](source-receipts.json) identify the exact reviewed files. These observations precede this patch: they are not post-change human-session results. The final reviewed session metadata identifies commit `6f50362`; the test-first reproduction below demonstrates remaining failures at the newer PR base `0b41c11`.

## Confirmed diagnosis and decision chain

Assignment/current activity → native game state → `buildCurrentBoardSnapshot` → live companion context + companion-base prompt → model response → shared speech output.

1. **Earliest wrong decision: context projection.** Written answer visibility controlled whether the target survived projection. A spelling stimulus can be known internally while its written answer remains hidden. Wheel secrecy was tested, but spelling's distinct audio/written boundary was not.
2. **Conflicting conversation rules.** The prompt requested escalating hints while its game rule prohibited every target word and answer. The live activity-help objective also described help generically as answer-hidden. This patch adds an explicit, narrowly scoped spelling support exception, not a global permission to reveal answers.
3. **Ungrounded instructional explanation.** The model received no pronunciation reference for the current target. Existing CMU data can supply phonemes, vowel-nucleus count, and stress; it does not supply written syllable boundaries or learner audio scores.
4. **Incomplete native item identity.** The old response guard checked launch ID, node and item ID. Native games can advance using item index/target, and relaunch using a token, without changing those fields. Late model output could remain eligible for speech.

The human caught semantic mismatches by hearing the response while looking at the activity. Logs retained the mismatches but did not fail the session on them. Existing labs tested hidden Wheel answers, canonical item-ID transitions, and transport completion separately. They did not exercise these native-game handoffs or validate pronunciation reference context.

The projection and identity defects are reproduced by tests. The influence of conflicting rules and missing pronunciation references on individual model replies is a supported explanation, not a recovered model reasoning trace. The user confirmed this diagnosis and authorized implementation through PR before edits.

## Implementation

- Keep an internal `spellingTarget` for the explicitly supported spelling instruments. Keep `currentTarget`/written visibility restrictions intact. Hidden Wheel and math answers never enter this spelling channel.
- Explicit assessment mode wins over visible text. Hidden assessments receive whole-stimulus repetition/instruction clarification only; syllable instruction and written hints are withheld. Explicit captured practice can receive pronunciation modeling while written hidden letters stay protected.
- Feed the existing CMU US-English reference to permitted help turns: phonemes, vowel nuclei/syllable count, and stress. No provider call or new dependency. Unknown words have an explicit missing-reference path; the model is told to use authored narration rather than invent a breakdown.
- Let Elli converse organically: whole word → spoken syllables → blend when requested. Do not prescribe fixed dialogue, mistake written chunks for syllables, pronounce silent letters separately, or grade pronunciation from STT text.
- Expand reply validity to launch token, item index, authoritative target and activity closure. Score-only updates keep the reply valid. Existing stale-output rejection logs remain the execution boundary.
- Preserve Planner ownership, canonical assessment/support accounting, grading and learning-loop contracts. No chart, assignment, board, adaptation rule or real-session data is changed by this PR.

## Acceptance criteria and measured outcomes

| Criterion | Before | After / evidence |
| --- | --- | --- |
| Reproduced contract failures | 9 failures / 23 tests | 0 failures; [red.log](red.log), [green.log](green.log) |
| Hidden spelling stimulus remains internally authoritative | Missing | Test passes; written answer still hidden |
| Three reference examples have correct phonemes and syllable counts | Absent | `myself`: 2; `tonight`: 2; `dissatisfied`: 4 |
| Explicit assessment with visible text does not enable teaching | No explicit support policy | Test passes; no phoneme reference supplied |
| Unknown pronunciation does not get a fabricated reference | No explicit missing-reference policy | Test passes |
| Hidden Wheel/math answer protection | Existing Wheel check | Existing check and new negative cases pass |
| Native index/target/relaunch invalidates reply | 3 failures | All 3 pass; score-only control also passes |
| Context reaches real SessionManager turn construction | Not covered | New mocked-chart integration test passes |
| Relevant suite | — | 53/53 tests across 5 files pass |
| Full build | — | Pass; existing bundle-size warning remains |

Machine summary: [outcomes.json](outcomes.json). Full build output: [build.log](build.log).

Reproduce from the PR branch with Node 20.20.2 (ABI 115), matching the installed native `better-sqlite3` binary. An initial full-hook attempt inherited the system runtime (ABI 141), produced native-module mismatch errors, and was stopped; that run is not evidence of application regressions or passing full-suite checks. The corrected-runtime hook is reported separately in the PR.

Commands:

```sh
npx vitest run src/server/currentBoardSnapshot.test.ts src/server/companion-response-runner.test.ts src/server/spellingDiscoverySupport.test.ts src/server/session-manager-companion-presence.test.ts src/tests/test-companion-base-rules.ts
npm run build
```

## Review questions for Opus 5.5

- Is the spelling-specific spoken-stimulus exception sufficiently narrow? Explicit assessments must never get syllable teaching merely because the UI exposes text.
- Does native reply identity fail closed when fields are omitted, without excessive cancellation during legitimate partial updates?
- Is the reference presented honestly as phonemes/vowel nuclei rather than verified written syllabification? The LLM still realizes syllable speech; TTS quality is not proved by these tests.
- Are target truth, support provenance, grading and Planner ownership preserved? These tests do not establish that every game supplies correct target state.
- Do prompt-level improvements need additional model/audio acceptance evidence before approval? The contract is tested; compliance of generated dialogue is not.

## Remaining work and live acceptance

Not fixed here: cumulative/duplicate STT turns, speaker attribution or ambient speech after summon, post-session aggregation dropping raw attempts, actual pronunciation scoring, and persistent per-item hint escalation. The new prompt guides help escalation, but adds no deterministic hint-state machine. These require separate diagnoses and PRs.

No paid provider calls, child session, audible TTS validation, learner pronunciation scoring, or learning-gain experiment were run. No Opus approval is claimed.

Before claiming improved child interaction, run the canonical kiosk with a consenting tester and retain target IDs, assistance and audio timing. Verify: (1) syllable coaching for `myself`; (2) no invented G sound in `tonight`; (3) room words cannot displace `title`; (4) advancing mid-response retires old speech; (5) a hidden assessment only repeats its whole stimulus; (6) an unsuccessful hint leads to changed help rather than repeated encouragement. Report target-alignment rate, factual sound errors, repeated-help count, and speech-end-to-first-audible-reply latency. Establish a baseline and report actual sample sizes; passing deterministic checks is not proof of positive learning outcomes.
