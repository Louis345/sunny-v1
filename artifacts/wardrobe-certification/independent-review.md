# Independent readonly review

Reviewer: separate agent `wardrobe_readonly_review`, 2026-09-05. Scope: changes since preservation baseline a063c76 and current diff, AGENTS.md Laws 1–7. No reviewer edits.

| Finding | Disposition |
|---|---|
| Garment skeleton/bone-texture leak | Fixed. Removal now disposes the skeleton. Red test allocated a real skeleton texture and saw no disposal; green verifies exactly one disposal and null texture. |
| Vacuous slow-load selector | Fixed. Browser checks require the actual Matilda prepared pane to exist before asserting hidden. |
| Frame audit did not compare against requested selection | Fixed. Audit compares revealed companion, variant and accessory with current UI events, as well as ready state. |
| Reverse-order delivery was not proven to occur | Fixed. Browser waits for the initial Elli request to enter its held route, renders Matilda first, then releases Elli and awaits its completed HTTP 200 response. |
| Two tests asserted removed duplicate effects | Updated to the consolidated lifecycle; behavioral browser switching coverage is separate. Reviewer confirmed 30 relevant tests green. |
| Pair-specific certification missing | Resolved on reopening: exact garment/accessory pair gate, equip and restore regression tests. |
| Matilda fit-profile eligibility mismatch | Resolved: prepared activation uses exact certification; compatible body profile alone grants nothing. |
| Offline fitted garments / complete visual matrix / walking | Offline fits and Matilda captured proof resolved. Walking and exhaustive visual acceptance remain incomplete. |

Reviewer recheck: disposal and expected-selection tests addressed; no scope creep into learning/math; diff whitespace clean. Final review allowed preservation as an **incomplete, quarantined handoff**, not milestone completion. The last requested request-hit/response-completion assertions were added and the browser run passed again. No merge or deployment.

## Reopened milestone review

Independent readonly reviewer `matilda_repair_review` checked the reopened changes against Laws 1–7. Findings about fitted-output approval hashes, invalid geometry groups, non-unit accessory scale, and failed-attachment cleanup were resolved with regression tests. Exact pair gating was rechecked with 12 targeted tests passing. The final review of commit `7d69f61` found no concrete blockers: prepared activation requires exact current certification, legacy behavior is preserved, and adding the body profile cannot bypass approval; all 12 targeted activation/certification tests passed. No reviewer files were edited.

This review certifies no visuals or human approval. Final build and all 864 web tests pass; full root tests retain five failures in unchanged paths. Walking and complete visual/movement evidence remain mandatory before engineering readiness.
