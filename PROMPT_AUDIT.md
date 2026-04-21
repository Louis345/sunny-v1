# Prompt audit (AGENTS.md alignment)

Scope: primary session / psychologist / companion prompt sources under `src/agents/prompts.ts` and related builders. Date: 2026-04-21.

## Summary

| Area                         | Verdict | Notes |
|-----------------------------|---------|-------|
| Child safety / boundaries   | OK      | Tutoring framing; no medical claims as diagnosis. |
| Answer leakage (spelling)   | OK      | `buildCanvasContext` + spelling rules avoid echoing target word in system text where noted. |
| Tool / capability honesty   | OK      | DEBUG and diag blocks require accurate capability reporting. |
| “Law 4” silent failures     | Risk    | Prompts cannot enforce `.catch()` in code; server must keep logging on tool failures. |
| Token / size discipline     | Risk    | Homework truncation (e.g. 14k) documented in code paths — prompts should keep reminding models not to paste huge blobs. |
| Multi-child name confusion  | OK      | Psychologist section explicitly tells model to ignore other children’s names in notes. |

## Violations / fixes

None blocking. Recommendations:

1. **Logging**: Keep “prove it in the log” on the server side; prompts already ask for concise visible behavior but do not replace structured logs.
2. **Preview / go-live**: Parent-prefix and demo strings live in `session-bootstrap.ts` (moved from `session-manager.ts`); keep a single source of truth when editing parent-facing copy.
3. **VRR / rewards**: `triggerReason` on `VRREvent` is analytics-only — engine and UI tests assert it is not required on client payloads; do not add child-visible strings that encode internal trigger names.

## Files reviewed

| Location | Type | Audit note |
|----------|------|------------|
| `src/companions/elli.md` | Companion system | Spot-check: tone, no hardcoded other-child names in static copy. |
| `src/companions/matilda.md` | Companion system | Same as Elli. |
| `src/agents/prompts.ts` | Central hub | Session builders, psychologist strings, truncation rules. |
| `src/agents/prompts/worksheetSessionPrompt.ts` | Worksheet tools | Tool-only framing; keep aligned with canvas owner rules. |
| `src/agents/prompts/buildCarePlanSection.ts` | Care plan | Injects clinical context; must not override child identity rules from hub. |
| `src/agents/psychologist/psychologist.ts` | Extraction | Model instructions; watch token limits and PII. |
| `src/agents/psychologist/today-plan.ts` | Today plan | Short operational prompts preferred. |
| `src/agents/classifier/classifier.ts` | Routing | Classification only; no tutoring voice mixed in. |
| `src/agents/curriculum-planner/planner.ts` | Planner | Curriculum structure; avoid child-specific assumptions in shared strings. |
| `src/agents/slp-recorder/recorder.ts` | SLP | Clinical-adjacent; keep within documentation scope. |
| `src/agents/elli/run.ts` | Voice agent | System wrapper for tools/streaming. |
| `src/agents/translator/translator.ts` | Translator | If enabled: no chain-of-thought leakage to child channel. |
| `src/agents/designer/designer.ts` | Image gen | Safety and copyright wording per product policy. |
| `src/scripts/generateGame.ts` | Game gen | HTML/JS generation instructions; sandbox assumptions. |
| `src/scripts/ingestHomework.ts` | Homework ingest | Extraction + algorithm summary prompts; watch cross-child notes. |
| `src/server/session-bootstrap.ts` | Runtime assembly | Parent go-live prefix, demo/diag/homework prompt wiring. |
| `src/server/map-coordinator.ts` | Map / thumbs | Short model calls for thumbnails; no long system prompts on hot path. |

Deep read (this pass): `src/agents/prompts.ts`, `src/server/session-bootstrap.ts`. Others: structural scan / consistency with hub rules above.

## Next pass

Re-run this audit when:

- Adding a new **system** or **developer** prompt block longer than ~400 chars.
- Changing homework or reading **suppression** rules (karaoke / reading_progress).
