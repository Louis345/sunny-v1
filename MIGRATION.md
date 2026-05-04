# Sunny Migration Plan

## Goal: Child Chart as the Hospital Chart

Sunny should behave like a hospital system:

- The child chart is the patient chart.
- The care plan is the current treatment plan.
- Each adventure-map node is an intervention room.
- Each subsystem is a specialist reading its section of the chart.
- When the system does something, the reason should be visible in the chart.

The long-term product rule is:

> New adaptive behavior starts from `getChildChart(childId)` and reads a named care-plan section from the child profile/chart view.

## Target Shape

The profile returned to server and web consumers should move toward this shape:

```json
{
  "childId": "ila",
  "care_plan": {
    "learning": {},
    "companion_care": {},
    "adventure_map": {},
    "attention": {},
    "speech": {}
  }
}
```

Specialists should not hunt through unrelated files or props. They should read their chart section:

```ts
const companionCare = childProfile.care_plan.companion_care;
const learningCare = childProfile.care_plan.learning;
const mapCare = childProfile.care_plan.adventure_map;
```

## Migration Rule

Do not do this as one large rewrite. Each new feature or bug fix should move one caller closer to the hospital-chart model.

Good migration steps:

- Add a `care_plan` section while keeping existing compatibility fields.
- Route new decision code through `getChildChart(childId)`.
- Prefer a single chart-derived view object over many unrelated props.
- Keep legacy fields such as `companionCare`, `tamagotchi`, and `companionCurrency` as mirrors until callers migrate.
- Add tests proving the new care-plan section and old mirrors agree.

Avoid:

- New direct reads from `children.config.json`, `learning_profile.json`, `word_bank.json`, or companion-care files outside low-level chart adapters.
- New adaptive rules hidden only in UI components.
- Moving many subsystems in one commit.

## Companion Care Direction

Current state:

- Companion care source of truth is persisted per child and companion at:

```text
src/context/{childId}/companion_care/{companionId}.json
```

- `/api/profile/:childId` exposes `companionCare`.
- Legacy `tamagotchi` and `companionCurrency` remain mirrors.

Migration target:

```ts
childProfile.care_plan.companion_care
```

Compatibility path:

- Populate `care_plan.companion_care` from the existing companion-care adapter.
- Keep `profile.companionCare` as an alias during migration.
- Wire new UI behavior to the care-plan section first, then mirror if needed.

## Adventure Map Direction

The adventure map should become a chart-rendered care plan:

- Nodes are interventions.
- Node order is the current plan.
- Node metadata explains evidence, target skill, algorithm owner, and expected measurement.
- Low companion readiness can adjust presentation and nudge behavior, but should not block required learning.

Target node explanation fields:

```json
{
  "id": "n-word-radar-erosion",
  "type": "word-radar",
  "careRole": "baseline-evaluator",
  "evidenceUsed": ["homework fingerprint", "missed concepts"],
  "algorithmTargets": ["retrieval-practice", "reading-comprehension"],
  "measures": ["concept_recognition_accuracy", "missed_concepts"]
}
```

## Current Branch Guidance

For `codex/wire-companion-welfare-2026-05-04`, move toward the target without refactoring the whole profile stack:

- Introduce a small compatibility accessor if needed:

```ts
getCompanionCareFromProfile(profile)
```

- It should prefer `profile.care_plan?.companion_care` once available.
- It may fall back to `profile.companionCare`.
- Wire visible companion mood from that accessor.
- Add tests for the accessor and the visible companion state.

This keeps today’s work aligned with the hospital-chart architecture without turning it into a large migration.
