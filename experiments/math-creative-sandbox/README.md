# Math Creative Sandbox

This disposable experiment compares five scenarios without publishing a Sunny
board or writing child state:

0. current Sunny control;
1. multiplication concept only;
2. concept plus factual child profile;
3. profile plus factual spelling activity outcomes;
4. one evaluator-guided refactor of the strongest generated candidate.

Run from this worktree:

```bash
npx tsx experiments/math-creative-sandbox/run.ts \
  --child=reina \
  --pdf=/Users/jamaltaylor/Downloads/pashley-math-2-multiplication.pdf
```

The script loads `.env`, writes only to `outputs/math-creative-sandbox/`, and
prints the final `comparison.html` path. Chromium is used for evaluator-directed
exploration and screenshots, not as a production acceptance gate.

Optional environment variables:

- `SUNNY_SANDBOX_MODEL`
- `SUNNY_SANDBOX_EVALUATOR_MODEL`
- `SUNNY_SANDBOX_MAX_TOKENS`
- `SUNNY_SANDBOX_CREATOR_EFFORT` (`low`, `medium`, or `high`)
- `SUNNY_AI_TIMEOUT_MS`
- `SUNNY_SANDBOX_INPUT_COST_PER_MTOK`
- `SUNNY_SANDBOX_OUTPUT_COST_PER_MTOK`

The human scorecard is stored only in the comparison browser's local storage.

## Preserved blinded quality harness

`evaluation-design-gate.ts` freezes an academic evaluation contract before any
experience design or implementation call. `evaluation-persona-comparison.ts`
then creates a blinded, playable comparison whose candidates share that frozen
contract and neutral builder instruction. Model provenance, token usage, cost,
and prompt hashes remain hidden until the reviewer explicitly reveals them.

The committed tests preserve the important experimental invariants without
committing generated child artifacts or provider responses:

```bash
npx vitest run \
  --config experiments/math-creative-sandbox/vitest.config.ts \
  experiments/math-creative-sandbox/evaluation-design-gate.test.ts \
  experiments/math-creative-sandbox/evaluation-persona-comparison.test.ts
```

The accompanying decision records preserve the observed quality floor and its
limitations. Generated reports remain local under `outputs/`; they may contain
child identifiers, absolute paths, or provider payloads and must not be added to
source control.
