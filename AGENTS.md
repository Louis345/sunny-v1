Organic first: Sunny is an adaptive learning system, so code must route truth, evidence, and safety while Elli handles human conversation from live context instead of canned scripted responses.
Every human-caught child-session bug must become a lab invariant: explain why the human caught it, why logs did or did not catch it, and why the AI lab missed it.

Required learning authority: read [`LEARNING_FEEDBACK_LOOP.md`](./LEARNING_FEEDBACK_LOOP.md) before changing learning evidence, prediction, theory, or adaptation behavior. It is the sole normative learning-loop contract [Laws 13, 14]: Sunny is accountable to reality, every activity is a measurement instrument first and a game second, and private game scores or synthetic learning claims are forbidden. Design stance: [`AI_DESIGN_PRINCIPLES.md`](./AI_DESIGN_PRINCIPLES.md).

# Sunny: six rules for AI agents

Sunny is a voice-first learning companion for two girls, Reina and Ila, running as a kiosk on the family Mac (Saori). Elli is their AI companion. Sunny works like a hospital: the chart is the record, the Planner is the doctor, and everyone else is a nurse who carries out the orders. Old law numbers are kept in brackets because other files refer to them; the longer text these rules replaced is in [`docs/PLANNER_CANVAS_RULES.md`](./docs/PLANNER_CANVAS_RULES.md) and [`docs/PRODUCT_RULES.md`](./docs/PRODUCT_RULES.md).

## 1. The chart is the patient's record [Law 12]

There is one source of truth for each fact. New Planner, generator, care-plan and adaptive decision code starts from `getChildChart(childId)`, never from raw profile, word-bank, homework, attempt or vitals files (low-level IO adapters for the chart excepted). Never keep a second copy of a fact that can drift from the first.

## 2. The Planner is the doctor; the order form is the tool schema

- The Planner (and the map artist) decide; code writes down. Whatever arrives through a schema-valid tool call is accepted as the order.
- Code fills every code-owned field itself (IDs, configuration, measurement bookkeeping, the expanded journey) and never asks the Planner for them. Free to decide, fixed to write down.
- A tool that cannot accept an input says why in its tool result, inside the same conversation. No after-the-fact check may buy a correction or patch call, and nothing flows back up to veto a finished order.
- Tools are sent in strict mode. If the API cannot enforce a form, make the form smaller (split the tool, or let code fill the field); do not loosen the lock. Today only `add_explainer` is unlocked, for size, and its handler checks it.
- **Math Prompt Chain Boundary:** Math has one production ingestion path: assignment and child chart → Planner → Experience Creator → runtime verification. The only AI roles are the Planner and Experience Creator. No new math production module, model call, fallback, renderer, or pipeline may be added without explicit human approval.

## 3. Everyone else is a nurse

The canvas, the runtime and Elli carry out the order faithfully. They never veto, reorder, rewrite or second-guess it, and they never send it back. What physically cannot load is left off the child's screen and logged as ` 🎮 [board] [portal] [not-ready] reason=...`; the board always publishes (today such a portal still shows "Not ready": [issue 28](https://github.com/Louis345/sunny-v1/issues/28)). Elli talks from live screen state and context, never from canned scripts. Wrong orders belong to the Planner; unfaithful execution belongs to the nurse; a mismatch between tool and runtime belongs to the shared contract.

## 4. The children are real

- Never modify Reina's or Ila's data or charts from tests, labs or verification.
- No paid provider calls in verification unless the owner approves them first.
- Nothing merges until the owner has tested it with the child and comments `/ship` on the PR (`human-gate` plus CI). Green CI and AI approval are not acceptance. The AI never posts `/ship`.
- Human sessions start only through the kiosk launcher `npm run sunny:run -- ...`, without `--no-browser` (that flag is for automated runs only), and only after the log shows `🎮 [kiosk] [kiosk-visible] [confirmed]`.
- The automatic AI review is paused since 2026-10-22 for cost; do not wait for it or re-enable it unless the owner asks.

## 5. Treat the disease [Laws 3, 4, 5, 6, 15]

- Diagnose before you fix: post the decision chain that produced a human-caught bug (evidence → Planner → tool → component), name the earliest wrong decision with runtime evidence (a captured request, a robot run, logs, saved state), and wait for the owner to confirm it. Never diagnose from reading code alone.
- Cure it at one point, preferring deletion and one source of truth over a new layer. One disease per change; log unrelated discoveries in `BUGS.md`. A cure larger than two files needs an approved plan, and show the tradeoffs before asking for approval.
- No silent failures: every promise is handled, and every significant state change logs as ` 🎮 [component] [action] [result]`.
- A patch is allowed only when a child is waiting; it is labelled a patch, degrades safely, and links the root-cause ticket.

## 6. Every rule is a test [Laws 1, 2, 7]

- Red, then green: write the test, watch it fail, then implement. Never skip, weaken or delete a test to get green.
- Every human-caught bug becomes a lab invariant that fails if it returns, with a note on why the human caught it, why the logs did or did not, and why the lab missed it.
- Recursion, listeners and polling have a proven exit, a guard, and a test that checks it.
- Before handover, `npm run build` and the relevant tests pass, and before any child session the $0 next-board robot (`src/scripts/spellingNextBoardAcceptance.test.ts`) passes. Say plainly what was and was not verified, including what only a real session on Saori can prove.

## Autonomous milestones

When the owner approves a defined milestone to run unattended, that approval covers its files and its red-green steps without stopping at each one. It does not cover broader scope, destructive operations, publishing, paid calls, or weakening any rule above. Use bounded attempts, keep diagnostics, and stop with a precise blocker when credentials, providers or an unmade product decision block progress.
