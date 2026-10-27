# Spelling Creative Sandbox

A lab outside Sunny's running code for comparing AI models on spelling content.

Every model gets the same ask for the same pretend child: her soul file, her words, the words she missed, and Sunny's real spelling menu (read from the catalog, not copied). Each model answers with 3 activities through one tool.

The result is one page:
- the answers appear blind as A, B and C;
- the children pick the one they would play;
- **Reveal** then shows which model made each card, with its tokens, its time and the code checks.

A model that wins here reaches Sunny only on the owner's green light.

```bash
# $0: fake answers, no network
npx tsx experiments/spelling-creative-sandbox/sandbox.ts --dry

# Paid: one call per model per child, stops at the token cap
npx tsx experiments/spelling-creative-sandbox/sandbox.ts \
  --models=claude-sonnet-5,claude-sonnet-5-5,claude-opus-5-5 \
  --cases=potter,wrestler,no-soul-file --pickers=Ila,Reina,Saori --max-tokens=60000
```

The page and `run.json` are written to `outputs/spelling-creative-sandbox/<run>/` (git-ignored).

- **Picks** stay in that browser. **Download picks** saves them as JSON.
- **Code checks** are facts, not a verdict: 3 activities, only her words, real games and modes, different games, missed words practiced, and her interests (a rough keyword check).
- **Cases** are fictional (`cases.ts`). The script refuses a real child's id.
- Every model is asked through Sunny's `requestForModel` (`src/engine/plannerTransport.ts`), so the 5.5 models get the request they accept.

```bash
npx vitest run --config experiments/spelling-creative-sandbox/vitest.config.ts
```
