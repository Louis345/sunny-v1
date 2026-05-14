# Patient Chart Branch Audit

Date: 2026-05-13

## Safety

- Safety branch created: `codex/visual-explainer-goldens-safety-2026-05-13`
- Implementation branch created: `codex/patient-chart-source-of-truth`
- Local dirty diff backup written under `.sunny-local/branch-backups/`

## Kept In Scope

- Patient chart doorway: `getChildChart(childId)`
- Chart-attached `activeSessionPlan`
- Homework ingestion writing the next session plan
- Adventure map rendering from the active chart plan before falling back to legacy map composition
- Tests proving active plan persistence, organic 10-word rotation, mystery options, and locked failed quest artifacts

## Parked Out Of Scope

- Live child/session data generated during local runs
- Visual explainer goldens and studio work unless a later PR intentionally targets that system
- Existing onboarding preview mismatch
- Companion-care treat acknowledgement regression
- Pronunciation completed-screen timing regression

## Rule

New adaptive decision code should read `getChildChart(childId)` or `buildLearningDecisionContext(chart)` first. Raw JSON/file reads belong in chart adapters and writer helpers, not in planners, map composition, generated content, or companion policy decisions.
