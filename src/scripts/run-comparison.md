# Branch comparison (pipecat vs legacy)

Use this checklist to capture comparable sessions on two branches (for example `feat/pipecat-pipeline` vs legacy Node / Deepgram). Minimum **three** completed sessions per branch before running the scorer.

## 1. Fixed five-utterance script

Speak these lines in order in each session (same room, similar mic distance). Wait for the assistant to finish responding before the next line where noted.

1. **Open**: “Hello — I am ready to start.”
2. **Reading**: “Can we do a short reading or karaoke practice?” *(Complete whatever reading or karaoke appears; let the story finish.)*
3. **Math**: “What is three plus four?”
4. **Barge / pause**: “Please stop — I need a second.” *(Then continue after the assistant acknowledges.)*
5. **Close**: “Thanks — that is all for this session.”

## 2. Capturing logs

1. Check out the first branch and start Sunny the way you normally run a diagnostic session (`npm run dev`, kiosk script, or `SUNNY_TEST_MODE` server — same mode for both branches).
2. Append or copy **server console output** (and any `logs/sessions/YYYY-MM-DD/server.log` lines if file logging is enabled) into one file per session, e.g. `logs/compare/pipecat-session-1.log`.
3. Repeat for **at least three** sessions on that branch.
4. Switch to the second branch (same hardware, same child profile settings) and capture **three** more session logs with the **same** five-utterance script.

Optional: at the end of each session (or from your metrics pipeline), append a single summary line so extraction is easy:

```text
stale_replay_count=0 turn_latency_p50_ms=0 karaoke_completion_pct=0 barge_in_latency_ms=0
```

Replace zeros with measured values. The parser uses the **last** occurrence of each key in the file.

## 3. Running the comparison tool

From the repository root:

```bash
npx tsx src/scripts/compare-branches.ts --help
```

Example with six log files:

```bash
npx tsx src/scripts/compare-branches.ts \
  --branch-a-label pipecat \
  --branch-a logs/compare/pipe-1.log logs/compare/pipe-2.log logs/compare/pipe-3.log \
  --branch-b-label legacy \
  --branch-b logs/compare/leg-1.log logs/compare/leg-2.log logs/compare/leg-3.log
```

Output looks like:

```text
Branch A: pipecat Sessions: 3 Score: 87.3 ± 4.2
Branch B: legacy Sessions: 3 Score: 71.8 ± 6.1
Winner: pipecat (p=0.03, Cohen d=1.4 — large effect)
```

Scores are **0–100** composites from log metrics (see `compositeScore` / `rawMetricsToCompositeScores` in `src/scripts/compare-branches.ts`). The printed **p-value** uses a **normal approximation** to Welch; for publication-grade stats, export scores and run a proper t-test externally.

## 4. Definition of “done” for your run

- Same five utterances per session.
- ≥3 sessions per branch.
- Same device and profile configuration across branches.
- Archive raw logs before merging so you can re-run `compare-branches.ts` later.
