# Sunny product and content rules

Moved word for word from `AGENTS.md` on 2026-10-05 so the agent rules stay short. Law numbers are unchanged.

### Law 9: Story Mode Personalization

Story/karaoke homework content must be child-centered. Do not generate generic passages when a child profile exists.

For Reina:

- Reina may be the protagonist when that is the strongest hook, but do not force every passage to be about Reina.
- Use profile-derived motivators and rotate formats: challenge, competition, wrestling/strategy, personal bests, mysteries, missions, debates, experiments, and other profile-backed hooks.
- Homework concepts remain academically accurate.
- Image prompts must match the chosen adaptive hook and include the child/avatar when the story frames them as present.

Never hardcode only the academic topic and forget the child.

### Law 10: Dynamic Content Domain Gate

Dynamic AI content must start from captured homework evidence, not from whichever game prototype exists nearby.

Before routing a baseline activity or generating a story/game/video brief:

- Capture the assignment text, questions, concepts, words, source documents, and content profile.
- Classify the homework domain and skill target first.
- Route only activities that make sense for that domain. Reading Mode and Countdown can support reading/science comprehension, but they must not be attached to unrelated math assignments unless a math-specific variant exists.
- Use the child profile for the flow-state wrapper: competition, challenge, calm practice, humor, strategy, visual reward, or another measured motivator.
- Use measured struggle signals underneath the wrapper: missed questions, pronunciation hesitation, retries, spelling misses, or SM2 due words.

The product model is: captured evidence -> domain gate -> child engagement hooks -> gap plan -> generated content. Do not reverse that order.

Quest and boss rewards must not be plain fixed-position nodes. Treat the baseline plan as the initial hypothesis, then use performance evidence to decide the next reward:

- Story/image finales can reward completed reading.
- Mystery nodes are variable dopamine rewards, not guaranteed every time.
- Generated quests unlock from domain-valid captured content plus baseline evidence: accuracy, recovery after a miss, streak, or enough completed baseline work.
- Weak performance routes to targeted support before quest generation.
- Boss remains a mastery-gated finale after generated quest evidence, not an always-playable activity.

### Law 11: AI Content Must Be Cataloged

Every generated, reused, or prototype learning content artifact must declare what learning algorithm it serves before it can enter the active path.

Required catalog fields:

- Content identity: child, homework/cycle when applicable, source, type, title.
- Algorithm targets: spaced repetition, error-pattern remediation, retrieval practice, reading comprehension, pronunciation, desirable difficulty, mastery gating, activity affinity, or variable reward.
- Evidence used: captured homework fingerprint, error patterns, activity evidence, calibration ids, or human source.
- Reuse decision: candidate, reuse, revise, or retire, with a reason.

Never ship AI content as just "fun content." It must answer:

- What learner evidence created this?
- Which algorithm owns this?
- How will we measure whether it worked?
- Should we reuse it, revise it, or retire it after performance or graded calibration?

### Law 12: Child Chart Is The Decision Doorway

Sunny uses the hospital/care-plan model:

- Child chart = patient chart entry point.
- Learning profile = adaptive evidence.
- Care plan = current treatment plan.
- Activities = interventions.
- Attempts = labs.
- Attention vitals = vitals at each visit.

New planner, generator, care-plan, and adaptive decision code must start from `getChildChart(childId)`.

Do not directly read `children.config.json`, `learning_profile.json`, `word_bank.json`, homework folders, attempts, or vitals from new decision code unless you are writing a low-level IO adapter used by the chart. Existing legacy callers can migrate gradually, but new adaptive code should make decisions from the chart or from `LearningDecisionContext` built from the chart.

## Maintainability (Guidelines, Not Laws)

- **Broad rules beat narrow branches:** Prefer one clear **product rule** (e.g. in prompts or a single invariant) over many special cases scattered in code — easier to reason about when you’re one person.
- **Every guard in code should have a test** that would fail if the guard were removed.
- **Preview modes are wrappers:** When adding a new mode that needs preview/read-only/stateless behavior, keep the public npm mode stable but route preview prompting, stateless runtime flags, board launch, companion voice toggles, and image reuse/generation options through a shared preview wrapper utility. Mode-specific code should supply only its plan/content; it should not duplicate preview prompts or launch ceremonies.

---

## Fix Protocol

Every fix should state **what lines change** (fix) vs **what lines go away** (delete). Net line count on hot paths (for example `session-manager.ts`) should trend **down** over time. **Pure additions** need a short justification (new invariant, new test-only file, or user-requested doc). Prefer one product rule in one place over scattered special cases.
