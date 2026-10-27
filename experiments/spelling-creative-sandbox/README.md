# Spelling Creative Sandbox

Can an AI model build a spelling game that a child enjoys and learns from? And which model does it best, for the money?

Every model gets the same ask for the same pretend child: her profile and her 10 spelling words. Each model builds one playable spelling game, a self-contained HTML page.

Code checks each game in a real browser:
- it loads;
- it reaches nothing outside;
- the words stay hidden at the start;
- a robot's typed answer gets reported.

A game that fails the safety checks shows as "did not build" and is never playable.

One page then shows the games side by side, blind, as A, B and C:
1. Choose who is playing.
2. Play. Code records every answer per player.
3. Each player picks a favorite.
4. **Reveal** shows which model built each game, its cost and tokens, how each player did, and every check.

A model that wins here reaches Sunny only on the owner's green light.

```bash
# $0: a fake built-in game, no network
npx tsx experiments/spelling-creative-sandbox/sandbox.ts --dry

# Paid: one game per model per child; stops before the next child once the token cap is reached
npx tsx experiments/spelling-creative-sandbox/sandbox.ts \
  --models=claude-sonnet-5,claude-sonnet-5-5,claude-opus-5-5 \
  --cases=potter,wrestler,no-soul-file --pickers=Ila,Reina,Saori --max-tokens=250000
```

The output goes to `outputs/spelling-creative-sandbox/<run>/` (git-ignored):
- `index.html`, the play page;
- each game's own HTML file;
- `run.json`.

Other details:
- **Picks and answers** stay in that browser. **Download results** saves them as JSON.
- **Cases** are fictional (`cases.ts`). The script refuses a real child's id.
- **Same footing for every model:** each is asked at effort `high` through Sunny's `requestForModel` (`src/engine/plannerTransport.ts`).
- **Prices** come from the Claude API model table (cached 2026-10-06).
