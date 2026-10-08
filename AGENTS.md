Organic first: Sunny is an adaptive learning system, so code must route truth, evidence, and safety while Elli handles human conversation from live context instead of canned scripted responses.
Every human-caught child-session bug must become a lab invariant: explain why the human caught it, why logs did or did not catch it, and why the AI lab missed it.
Diagnose before you fix: for a human-caught bug, post the decision chain that produced it (evidence → Planner → activity settings → component) and name the earliest wrong decision, with its evidence, before any code or test. Make no edits until the human confirms the diagnosis. The regression test states the intended behavior at that layer, not the symptom. If the component did the right thing with its inputs, the component is not the fix. When intent is unclear, ask why instead of choosing the easiest change.

Required learning authority: read [`LEARNING_FEEDBACK_LOOP.md`](./LEARNING_FEEDBACK_LOOP.md) before changing learning evidence, prediction, theory, or adaptation behavior. It is the sole normative learning-loop contract.

# Sunny: rules for AI agents

Sunny is a voice-first learning companion for two girls, Reina and Ila, running as a kiosk on the family Mac (Saori). Elli is their AI companion. Old law numbers are kept in brackets because other files refer to them.

## How to work

1. **Tests first [Law 1].** Write the test, run it red, then implement until green; outside an approved autonomous milestone, report the red tests and wait for "implement". For a bug, the test states the intended behavior at the layer named in the confirmed diagnosis, not the symptom. Never skip, weaken or delete a test to get green.
2. **Stay in scope [Laws 3, 6].** One problem per commit; log unrelated discoveries in `BUGS.md` instead of fixing them. Before changing architecture, or more than two files outside an approved plan, show the plan and wait for approval.
3. **No silent failures [Law 4].** Every promise is handled and every intentional ignore is logged.
4. **Prove it in the log [Law 5].** Significant state changes log as ` 🎮 [component] [action] [result]`.
5. **Prove it before handing over [Law 7].** `npm run build` and the relevant tests must pass. Say plainly what was and was not verified, including what only a real session on Saori can prove.

## Hard boundaries

- **Kiosk-only human sessions.** Start every child, parent, or Saori acceptance session through the canonical `npm run sunny:run -- ...` kiosk launcher, without `--no-browser`. Never substitute an ordinary Chrome tab or reconnect a human test through a tab. `--no-browser` is only for explicitly automated or headless verification and must never be handed to a human tester. Before saying a human session is ready, require the log invariant `🎮 [kiosk] [kiosk-visible] [confirmed]` and verify the dedicated kiosk is visible; if that invariant fails, stop and fix the kiosk launch instead of using a browser fallback.
- **Learning contract [Laws 13, 14].** `LEARNING_FEEDBACK_LOOP.md` is the only authority for the learning loop. Sunny is accountable to reality, not vibes; every activity is a measurement instrument first and a game second, and private game scores or synthetic learning claims are forbidden.
- **Child chart is the decision doorway [Law 12].** New Planner, generator, care-plan and adaptive decision code starts from `getChildChart(childId)`, never from raw profile, word-bank, homework, attempt or vitals files (low-level IO adapters for the chart excepted).
- **Math Prompt Chain Boundary:** Math has one production ingestion path: assignment and child chart → Planner → Experience Creator → Playwright runtime verification. The only AI roles are the Planner and Experience Creator. No new math production module, model call, fallback, renderer, or pipeline may be added without explicit human approval. New abstractions must replace an existing one in the same change, and math hot-path production line count must remain neutral or decrease. Code owns truth, provenance, lifecycle safety, and runtime behavior; AI owns activity count, item count, pedagogy, mechanics, themes, and response format.
- **Real children's data.** Never modify Reina's or Ila's data or charts from tests, labs or verification. No paid provider calls in verification unless the human approves them.
- **No unbounded loops [Law 2].** Recursion, listeners and polling need a proven exit and a guard, with a test that checks it.

## Autonomous milestones

When the human approves a defined milestone to run unattended (for example "finish this while I sleep"), that approval covers its files and its red-green steps without stopping at each one. It does not cover broader scope, destructive operations, publishing, or weakening child-safety or evidence rules. Use bounded attempts, preserve diagnostics, and stop with a precise blocker when credentials, providers or an unmade product decision block progress. Human-caught bugs still need a confirmed diagnosis first.

## More context

- Product and content rules (story personalization, content domain gate, quest and boss rewards, content catalog, preview wrappers, fix protocol, the child-chart care model): [`docs/PRODUCT_RULES.md`](./docs/PRODUCT_RULES.md).
- Known bugs and lab invariants: [`BUGS.md`](./BUGS.md).
