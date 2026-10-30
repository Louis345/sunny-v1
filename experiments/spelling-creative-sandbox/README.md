# Spelling Creative Sandbox

Can an AI model build a spelling game that a child enjoys and learns from? And which model does it best, for the money?

Every model gets the same ask for the same pretend child: her profile and her 10 spelling words. Each model builds one playable spelling game, a self-contained HTML page.

Code checks each game in a real browser:
- it loads;
- it reaches nothing outside;
- the words stay hidden at the start;
- a robot's typed answer gets reported.

A game that fails the safety checks shows as "did not build" and is never playable.

The kids' page keeps it simple:
1. Tap your name.
2. Play one game at a time, full screen, in an order of your own. Tap Next when you've had enough.
3. See the games as big pictures and tap the one you want to play again.

Code records every answer, the time played, and whether she finished or stopped early. **Grown-ups** (bottom corner on the names screen, answer 7 × 8) opens picks, scores, **Reveal** (model, cost, tokens, every check), **Download results** and **Clear**.

A model that wins here reaches Sunny only on the owner's green light.

```bash
# $0: a fake built-in game, no network
npx tsx experiments/spelling-creative-sandbox/sandbox.ts --dry

# Test sets: --set=plain (default), goal (an exciting goal), painted (the goal plus a Grok painting per game)
npx tsx experiments/spelling-creative-sandbox/sandbox.ts --dry --set=painted --cases=wrestler

# Re-run the checks on saved games and rebuild the page, no model call
npx tsx experiments/spelling-creative-sandbox/sandbox.ts --recheck=outputs/spelling-creative-sandbox/<run>

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
- **Picks and answers** stay in that browser, so play and review in the same one. **Download results** saves them as JSON.
- **Cases** are fictional (`cases.ts`). The script refuses a real child's id.
- **Same footing for every model:** each is asked at effort `high` through Sunny's `requestForModel` (`src/engine/plannerTransport.ts`).
- **Prices** come from the Claude API model table (cached 2026-10-06).
