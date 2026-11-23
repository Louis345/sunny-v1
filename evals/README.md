# Companion/tutor evals

Runner only. **No child data in this folder or anywhere in the repo.** Golden cases, the parents' rubric text,
results and transcripts live in the private folder `~/SunnyEvals/` (override with `SUNNY_EVALS_DIR`).

- `rubric.ts` — rubric format: criteria keys per group, who scores each (`judge`, `code`, `parent`), strict judge schema.
- `checks.ts` — deterministic checks (no model): length, exact/near repeats, name spelling, spoken lists, spoken
  planning notes, promise phrases, and the prompt-leak scan.
- `judge.ts` — runner. Judge = `claude-fable-5-1`, a different model from the companions it grades.

```bash
npx tsx evals/judge.ts baseline --estimate   # prints the cost estimate, spends nothing
npx tsx evals/judge.ts baseline              # judge every real historical reply
npx tsx evals/judge.ts after                 # regenerate Conversation + Honesty replies with today's prompts, then judge
```

Every run first checks that no case text appears in `src/prompts`, `src/souls` or `src/companions` (golden cases are
never few-shot examples) and refuses to start if the estimate exceeds `EVAL_BUDGET_USD` (default $10); it also stops
mid-run if real spend passes it.

The AFTER replay sends the companion's current base soul, individual soul, personality, spoken-turn and expression
rules (homework, `SUNNY_VOICE_MODEL`, default `claude-sonnet-5`) or `buildShowroomTalkSystemPrompt` (FaceTime,
`SUNNY_COMPANION_TALK_MODEL`, default `claude-sonnet-4-5`). It does not include the care plan, live tools or the
board snapshot, so it tests the persona and rules, not the full live context.
