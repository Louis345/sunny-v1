# Spark Orb Learning Contract

Spark Orb is a reward wrapper, not the academic instrument. The planner may choose it when an earned launch/capture loop helps the child stay with valid learning work, but it must also be free to ignore it.

## Planner Rule

- Use `src/engine/activityToolCatalog.ts` as the machine-readable source of truth.
- Treat `spark-orb-charge` as `plannerVisibility: "wrapper"`.
- Do not place Spark Orb directly in `activeSessionPlan.nodePlan` as a map node.
- If it fits organically, attach it to a domain-valid node as `rewardWrapper`.
- Valid wrapper modes are `charge_bridge` and `domain_payload_wrapper`.
- `domain_payload_wrapper` belongs on an unlocked evidence-generating activity node, not Mystery, Quest, Boss, or another locked destination.

## Evidence Boundary

- Orb charge, launch, miss, capture, collectible reveal, and retry are engagement, persistence, attention, and reward signals.
- Spark Orb does not write standalone mastery evidence.
- `domain_payload_wrapper` requires the embedded activity to own target-level academic evidence.
- Spelling correctness, reading fluency, math reasoning, or science comprehension must come from the embedded payload and chart evidence path.

## Good Fit

- After evidence-generating work when the child needs an energetic bridge.
- While a Quest or Boss artifact is preparing or validating.
- Around a spelling, reading, math, or science payload that already emits per-target results.
- When the child profile suggests visual reward, movement, anticipation, or collectible motivation will help persistence.

## Bad Fit

- First clean cold baseline when reward timing would contaminate the signal.
- Any plan that would treat launch/capture as academic mastery.
- Any plan where the wrapper replaces the domain payload instead of supporting it.
- Fatigue, overwhelm, or parent context says to keep the session calm and direct.

## Acceptance Checklist

- The planner packet includes the Spark Orb catalog card.
- The planner output remains valid when Spark Orb is not selected.
- If selected, Spark Orb appears only as `rewardWrapper` on a domain-valid node.
- Any review language explains what evidence the wrapped activity captures and what Spark Orb contributes emotionally.
