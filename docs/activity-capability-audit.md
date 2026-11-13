# Activity Capability Audit

`src/engine/activityToolCatalog.ts` is the machine-readable source of truth for activity capability cards. This document is the human-readable snapshot. If this document and the code disagree, fix the code first and regenerate this summary from the catalog.

Sunny treats activities as instruments. Each activity must state what learner evidence it can create, how it is configured, which signals it emits, and what it cannot prove.

## Baseline And Learning Activities

| Activity | Config Source | What It Measures | Real Difficulty / Modes | Key Signals | What It Cannot Prove |
| --- | --- | --- | --- | --- | --- |
| Concept Check | `activity-config-file` | Concept understanding and misconceptions before teaching. | Warmup check, baseline probe, transfer check. | Question result, selected answer, response time, completion accuracy. | Reading fluency, spelling, or broad mastery when choices reveal the answer. |
| Visual Explainer | `generated-artifact` | Engagement with a concept model and whether direct teaching is needed. | Guided model, interactive pause, playthrough review. | Artifact opened, interaction answer, completion, validation result. | Independent transfer without a follow-up check. |
| Visual Learner Co-op Recall | `generated-artifact` | retrieval practice after a visual explainer; whether the child can recall the model without replaying it. | Child turn, companion turn, profile coin stakes, teach-back bonus. | `recall_result`, per-target attempt, `coinsEarned`, `coinsLost`, `netCurrencyDelta`, `activity_complete`. | delayed transfer, graded homework mastery, or whether the original visual should be reused without future evidence. |

## Reward And Currency Notes

Profile coins are owned by the child chart / companion-care economy. Iframe games must report deltas through `_contract.js` using `GameBridge.awardCurrency`; the server persists or suppresses the change depending on preview/live mode.
