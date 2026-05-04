# Project Sunny — AI Agent Context

## Your Project: Sunny

**Sunny** is a voice-based AI study assistant for the developer's daughters. It uses:

- Anthropic Claude for conversation
- ElevenLabs for real-time text-to-speech
- Profile-based sessions (Elli, Matilda, Reina) with custom system prompts

Primary code: `src/index.ts`, `src/sunny.ts`, `src/stream-speak.ts`, `src/profiles.ts`.

---

## Reference Project: agents-v2

A copy of the [Frontend Masters AI Agents v2](https://github.com/Hendrixer/agents-v2) course repo lives at `_reference/agents-v2/`. Use it when the user gets stuck on agent concepts or wants to apply patterns from the course.

### When to use the reference

- **Agent patterns**: tools, tool execution, context management, message filtering
- **Architecture**: `src/agent/run.ts`, `src/agent/executeTool.ts`, `src/agent/tools/`
- **Token/context handling**: `src/agent/context/` (compaction, model limits, token estimation)

### Reference layout

```
_reference/agents-v2/
├── src/
│   ├── agent/
│   │   ├── tools/      # webSearch, shell, file, codeExecution
│   │   ├── context/    # compaction, model limits, token estimator
│   │   ├── system/     # prompt, filterMessages
│   │   ├── run.ts
│   │   └── executeTool.ts
│   ├── cli.ts
│   └── index.ts
└── evals/              # evaluation patterns
```

### How to use it

1. **Primary focus**: Work in the Sunny codebase (`src/`). Do not modify `_reference/agents-v2/`.
2. **When stuck**: If the user asks about agent tools, tool loops, context windows, or course concepts, read from `_reference/agents-v2/src/agent/` for patterns and apply them to Sunny.
3. **Learning by building**: Suggest adapting course patterns into Sunny rather than copying code as-is.

Give Cursor this to add to AGENTS.md:

## Development Laws

### Law 1: Tests First — No Exceptions

Before writing any implementation:

1. Write the test file
2. Run the tests — they must FAIL (red)
3. Report failing tests to the human
4. Wait for human to say "implement"
5. Then write implementation
6. Tests must pass green before PR

Never skip this. Not for bug fixes.
Not for "small" changes. Not for hotfixes.
A failing test is proof the bug exists.
A passing test is proof the fix works.

### Law 2: No Infinite Loops

Before any recursive call or event listener:

- Prove the exit condition
- Add a counter guard: if (count > 10) throw
- Test must verify call count

### Law 3: One Change At A Time

Never fix multiple bugs in one commit.
One bug → one test → one fix → one commit.
If you find other bugs while fixing —
log them to BUGS.md and stop.

### Law 4: No Silent Failures

Every promise chain must have .catch()
Every void must be intentional and logged
No swallowed errors ever

### Law 5: Prove It In The Log

Every significant state change must log.
If it doesn't appear in the terminal
it didn't happen.
Format: " 🎮 [component] [action] [result]"

### Law 6: Ask Before Architecting

If a fix requires changing more than 2 files
STOP and ask the human first.
Show the plan. Get approval. Then build.

### Law 7: Run The Tests

After every change:
npm run build — must pass
npm run test:[relevant] — must pass
Never submit a failing build.

### Law 8: Agent-Assisted PR Review (Solo Maintainer Safeguard)

**Mechanical gate:** GitHub Actions workflow `.github/workflows/ci.yml` runs on PRs and pushes to `main`/`master`: root `npm run build` (server `tsc` plus `web`’s `tsc -b` and Vite production build), then `npm run test` (root Vitest and `web` tests). That enforces **Law 7** (and any behavior covered by tests). It does not interpret Laws 1–6 by itself.

**Narrative flags:** `.github/workflows/claude-review.yml` posts a PR comment from Claude using a checklist aligned with these laws (requires `ANTHROPIC_API_KEY` secret).

When the human cannot review every line closely, treat a **second agent pass** as part of the merge gate:

1. After the implementing agent finishes, run a **readonly review** (another chat or Agent) with the **diff** and: *“Check this against AGENTS.md Laws 1–7: scope creep, missing tests, silent failures, unrelated files.”*
2. **Block merge** if new behavior has **no test**, or the diff **exceeds the stated goal** (fix one bug, don’t refactor three modules).
3. Prefer **revert** over **stacking** patches when a merge introduced regressions.

This does not replace Law 6 — it catches what fatigue misses.

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

### Law 13: Accountable To Reality

Sunny must be accountable to reality, not vibes and not "AI says this is smart."

The system should form theories, test them, learn from outcomes, and explain its reasoning. A care plan is only a hypothesis until attempts, attention vitals, activity outcomes, or graded homework calibration support it. In-app success is useful evidence, but it is not proof of transfer until real-world graded work or delayed reassessment confirms it.

Every adaptive claim should answer:

- What evidence created this theory?
- What activity or intervention is testing it?
- What outcome would support, revise, or falsify it?
- Where will that result be recorded in the child chart?

---

## Maintainability (Guidelines, Not Laws)

- **Broad rules beat narrow branches:** Prefer one clear **product rule** (e.g. in prompts or a single invariant) over many special cases scattered in code — easier to reason about when you’re one person.
- **Every guard in code should have a test** that would fail if the guard were removed.
- **Preview modes are wrappers:** When adding a new mode that needs preview/read-only/stateless behavior, keep the public npm mode stable but route preview prompting, stateless runtime flags, board launch, companion voice toggles, and image reuse/generation options through a shared preview wrapper utility. Mode-specific code should supply only its plan/content; it should not duplicate preview prompts or launch ceremonies.

---

## Fix Protocol

Every fix should state **what lines change** (fix) vs **what lines go away** (delete). Net line count on hot paths (for example `session-manager.ts`) should trend **down** over time. **Pure additions** need a short justification (new invariant, new test-only file, or user-requested doc). Prefer one product rule in one place over scattered special cases.
