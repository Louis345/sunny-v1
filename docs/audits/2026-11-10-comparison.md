# Opus 5.5 vs Fable 5.2: Sunny blind-spot audit, compared

Both models got the same brief, fresh, read-only. A Sonnet judge scored the two reports blind (labelled A and B) and opened each report's proofs on the code and on Saori. The labels were revealed afterwards: **A = Fable 5.2, B = Opus 5.5.**

## Scores

| | Opus 5.5 | Fable 5.2 |
|---|---|---|
| Hidden known problems found (of 5) | **5** | 3 |
| Findings, weighted by impact on the girls (proofs confirmed) | **43** (19 findings) | 39 (17 findings) |
| Proofs that turned out false | 0 | 0 |
| Fixes a cheaper model could do in one go | **~15 of 19** | ~13 of 17 |
| Pitch rows with a real number from the logs | 10 of 10 | 12 of 12 |
| Context used | ~310K tokens | ~400K tokens |
| Time | ~12 min | longer |
| Cost to you | plan usage only | 4% of weekly Fable allowance, $0 extra |

**Verdict:** Opus wins narrowly, on catching Sunny's own failures. Fable is stronger on Ila's adaptation, and found the single most important problem in either report. Neither model alone is enough; together they cover more.

## Found by both (13): strong signals

1. Reina's lost session; nothing noticed.
2. Built games never report their step, so Ila's 15-minute wall went unseen.
3. Nobody acts when a child goes quiet.
4. The Planner plans before that session's retro is written.
5. Math games show "0 right" because answers are scored only at completion.
6. The Planner can't write new math problems, so Quest/Boss vanish.
7. Matilda's math help is saved as "on her own" (47 of 47).
8. Reina's thinking aloud is dropped before the retro.
9. The engagement record is empty (games report "0 ms").
10. The reward FaceTime call gets a lesson retro.
11. Anything not spelling is treated as math.
12. The Planner's question is 431K characters, so the important facts drown.
13. Played-game history is broken (each model found a different defect).

## Only Opus found

- Matilda promised Reina "your answers will count this time" while saves were failing: the companion is blind to Sunny's own state.
- The root cause: the hand edit changed the fingerprints on all three of Reina's boards.
- Monster Stampede saves single wrong taps as whole misspelled words ("ornm"), which pollutes Ila's error picture.
- Ila's test date disagrees: 11/12 in her chart, "Friday 11/13" in the Planner's question.
- One sentence from Reina became 10 bug tickets.
- The server log is wiped on every restart.

## Only Fable found

- **The AIs are told Ila is grade 2 with no diagnoses (no ADHD, no dyslexia).** Every plan and every game starts from that. A builder told "no diagnoses" has no reason to avoid small print or long steps for a dyslexic child.
- The frustration detector is a phrase list that works in only 5 games. During her stuck stretch it caught your words, not Ila's.
- The played-games list shows 0 answers for every spelling game (a matching bug), so `build_from` sees no evidence of what she liked.
- No game is ever retired or promoted.
- The Planner stopped making checkable predictions after day one, so it can't grade itself.

## What this says about value per token

On this audit, Opus gave slightly more verified value for fewer tokens. Fable's unique finds are deeper on the brief's heart (Ila's pace and frustration). A sensible pattern: a cheap broad audit first, then one stronger pass aimed at the questions the first missed.

Full reports: [Opus 5.5](2026-11-10-opus-5-5-audit.md) · [Fable 5.2](2026-11-10-fable-5-2-audit.md)
