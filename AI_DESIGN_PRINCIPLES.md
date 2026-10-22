# More freedom, less constraint, more introspection

Sunny should give its AI enough context, useful actions, and feedback to exercise judgment in real time. Elli owns natural conversation; the Planner owns educational intent; the Experience Creator owns composition. Runtime faithfully carries their decisions into the product and reports what actually happened.

## Capability before prescription

When an interaction fails, first inspect what the AI could perceive, which actions it could take, and which results it received. A request to speak slower cannot reliably succeed if the AI can only change text. Supply the missing capability and its observable result before adding another behavioral instruction, rejection, fallback, or special case.

Prefer one coherent flow of context → AI decision → execution → observed result → reflection and adaptation. This describes information flow, not a new waterfall development process or an additional orchestration layer. Reuse the existing production path.

## Introspection means grounded reflection

Give the AI access to its recent attempts, the learner's feedback, current activity facts, available actions, and execution outcomes. Let it recognize that an approach failed and choose another. Do not equate a fluent explanation with verified self-knowledge, access to hidden reasoning, consciousness, or evidence that the learner improved.

## Less scripting and competing logic

Avoid canned tutoring dialogue, fixed hint ladders, duplicated behavior rules, and application branches that compete with AI-owned decisions. Describe capabilities, goals, and facts clearly. Consolidate contradictory instructions rather than layering another exception over them. Remove obsolete behavior code when replacing it; report what remains and why.

Deterministic code remains appropriate for executing tools, recording events, binding actions to the correct activity, handling interruptions, and representing actual availability. It should make the AI's choices possible and their outcomes visible. It must not fabricate success or silently rewrite educational intent.

Freedom of explanation does not change the meaning of the learning evidence. Record assistance automatically and distinguish supported practice from independent measurement. Give Elli clear knowledge of that distinction and useful ways to transition or request support; avoid making her improvise around unavailable capabilities. Preserve the existing learning contract, data protections, bounded execution, and human acceptance before merge.

## Evidence and review

For a proposed behavioral change, the PR must explain:

- The observed failure, earliest responsible layer, and remaining uncertainty.
- What the AI previously knew, could do, and could observe; what the change adds.
- Which scripts, duplicated instructions, or unnecessary branches are removed, and why remaining deterministic checks belong in runtime.
- Whether the change violates this principle, including any explicit tradeoff.
- Regression evidence for execution and record integrity, plus realistic conversational evaluation for adaptive judgment.
- Measurable human acceptance results, including usefulness, rather than only compliance with prescribed wording.

Verify the assembled prompt and live toolkit, including personality files and mode supplements; testing fragments alone can miss contradictory instructions.

Give Opus 5.5 a concise rationale, source evidence, alternatives, and results sufficient to challenge the assessment. The objective is justified agreement or a useful correction, not agreement at any cost. Never claim reviewer approval, effective introspection, or improved learning without evidence.

Work on a named task branch in a dedicated Git worktree. The working sequence is: evidence and local plan → human discussion and plan approval → a plan-review PR when requested → independent AI challenge and resolution → human authorization to implement → failing regression tests → implementation and focused checks → a separate implementation PR → AI review and canonical human acceptance → explicit human approval before merge. Human-requested review fixes require acceptance at the revised behavior commit. Record tested revisions, learning-record checks, reviewer verdicts, and approval decisions in the PR. Record any required manager approval explicitly; an AI review does not substitute for human acceptance. See AGENTS.md for the approval boundaries and worktree requirements.

These principles complement AGENTS.md and ARCHITECTURE.md. LEARNING_FEEDBACK_LOOP.md remains the sole normative learning-loop contract. If an instruction conflicts with this direction, identify the exact conflict and reconcile it within the authorized scope; do not silently delete operational guarantees.
