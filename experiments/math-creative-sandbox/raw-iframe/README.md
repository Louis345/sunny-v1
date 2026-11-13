# Frozen Design Artifact Model Showdown

This isolated experiment sends one frozen Caravan Rush design artifact and one
identical implementation prompt to:

- Claude Sonnet 5
- Claude Opus 5
- GPT-5.6 Sol
- Claude Fable 5

The four calls run concurrently. There is no quality harness, refactor,
Playwright, test suite, image generation, Sunny production path, child-state
write, automatic ranking, or publication.

Run:

```bash
DOTENV_CONFIG_PATH=/Users/jamaltaylor/Development/sunny/.env \
npx tsx experiments/math-creative-sandbox/raw-iframe/run.ts
```

The command prints the local `comparison.html` path. Open it and rank the four
raw interactive experiences directly.
