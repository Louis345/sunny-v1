# Sunny roadmap

**Why:** the hospital model in [`adaptive-learning-north-star.md`](./adaptive-learning-north-star.md). Sunny measures the child with trustworthy instruments, plans, intervenes, and calibrates against reality. Eventually it recognizes when its own tools don't fit the child and commissions new ones (a "referral").

**Done means:** we can show with numbers that Sunny learns:
1. **Calibrated:** the Planner's predictions land in their stated range most of the time.
2. **Real improvement:** the child's *independent* accuracy on taught words rises in later checks and on real school tests.
3. **Clean instruments:** most recorded answers carry no confound (audio missing, answer visible, help unknown).

The owner sets the target for each number.

## Rules for every step

- **One step at a time.** Big refactors cause big surprises. A step starts only after the previous one is merged and tested with the child.
- **Each step has a one-sentence "done" before work starts.** Anything outside it is parked here, not bundled.
- **A rule without a test is a wish.** Every non-negotiable rule gets a CI test that fails if it's broken.
- **Nothing merges** without green CI, the Opus review, and the owner's `/ship` after a real session.
- **The canvas never rejects the Planner,** in spelling or math. Drawing problems are logged; the board publishes and stays playable.

## Steps

| # | Step | Done when | Status |
|---|---|---|---|
| 0 | **The board never rejects; the loop works** (PR #22) | A real session: the board appears, the next board follows completed work, help is recorded honestly; owner `/ship` | **In progress** |
| 0b | **Ila can talk over Elli** (PR #23, approved directly by the owner; tested in the same Ila session as #22) | Interruptions work, replies stay short, the newest request wins; owner `/ship` | **In progress** |
| 1 | **Check the instruments** | A $0, read-only lab-quality report per session (spelling and math) shows what % of answers are trustworthy and which activity produces bad data | Next |
| 2 | **Ground it in reality** | Real school test results are fed back (returned graded work) and compared with Sunny's predictions every week | Planned |
| 3 | **Best doctor** | The Planner moves to the strongest model; this needs a code change, because current Planner calls force a tool, which 5.5 models reject. Steps 1–2 measure the improvement | Planned |
| 4 | **Referral (the hospital)** | The Planner names a gap its tools can't measure or teach, and one new instrument is built, cataloged (Law 11), measured, and kept or retired. Requires explicit approval under the Math Prompt Chain Boundary | Planned |

## Parked (worth doing, not now)

- A replay demo mode, so a full session can be re-tested from saved AI responses at $0.
- Run the Opus review when a PR is ready or on `/review`, not on every push.
- The review gate posts the API's own error text when a review run fails.
- Elli labels each reply as clarification or real help.
