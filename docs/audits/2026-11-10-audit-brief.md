# Sunny audit brief (2026-11-10)

Two auditors get this same brief, each in a fresh session: Claude Opus 5.5 and Claude Fable 5.2. Their reports are scored blind and compared. Write for a parent who is not an engineer and decides like an investor: what does each fix give my child, and what does Sunny gain?

## What Sunny is

Sunny is a voice tutor on a kiosk Mac for two sisters:
- **Ila**, grade 3. Spelling, with her companion Elli. She has ADHD, dyslexia and a language disorder. She is delicate: when she hits a wall she gets frustrated and checks out. In one session she was stuck for about 15 minutes before her first answer in a new game, then loved the game once she understood it.
- **Reina**. Math, with her companion Matilda. She loves a challenge, embraces being pushed, and learns fast.

An AI Planner reads each child's chart and evidence, then builds her next board of activities. A game builder writes new games for her. Her companion talks with her during play. After each session, a retro (the handoff), a timeline, a scorecard and the Planner's journal record what happened.

**The owner's rule, non-negotiable:** no hard-coded rules or scripts. The AIs get facts and tools and calibrate from observation, so Sunny improves the more it learns about each child. Sunny should repair itself and grow, with the parent pulling away over time.

## The goal you are auditing against

Does Sunny help each child learn **at her own rate**?
- For Reina: find her limits and push her just past them.
- For Ila: notice when she is stuck, frustrated or checking out, and adapt before she gives up.

Both should want to come back. And Sunny should catch and fix its own problems before a child or parent has to.

## What to read

**Code:** `/Users/jamaltaylor/Development/sunny-weekend`, branch `weekend/economy-and-faster-planner`. Read these first:
- `AGENTS.md`, `LEARNING_FEEDBACK_LOOP.md`, `BUGS.md`, and `docs/session-checklists/2026-11-09.md` and earlier.
- Do not read `docs/session-checklists/2026-11-10.md`, other files in `docs/audits/`, or any other auditor's report. They hold another audit's conclusions, and your findings must be your own.

Then:
- the Planner: `src/engine/learningCycleRuntime.ts`, `src/engine/spellingSuccessorTools.ts`;
- the game builder: `src/engine/spellingGameBuilder.ts`;
- retro, timeline, scorecard and journal: `src/engine/sessionHandoff.ts`, `src/engine/sessionTimeline.ts`, `src/engine/sessionScorecard.ts`, `src/engine/plannerIntrospection.ts`;
- what the companion sees: `src/server/urgentLearningSupport.ts`, `src/server/currentBoardSnapshot.ts`;
- session end: `src/server/session-debug-recorder.ts`;
- the game contract: `web/public/games/_contract.js`.

**Real sessions:** on the kiosk Mac, **read-only**, over `ssh jtaylor@Saori.local`, in `~/Development/sunny`:
- `logs/sessions/2026/11/*`: metadata.json, transcript.md, game-traces.ndjson, events.ndjson, summary.md;
- `src/context/{ila,reina}/homework/`: planner-journal, handoffs, scorecards, games (the built game HTML);
- `~/kiosk-run.log`: the live server log.

Compare what actually happened (traces and transcripts) with what each part of Sunny believed, said and wrote.

## Look at the whole system, at least these areas

1. **Self-repair.** Where can something go wrong that no part of Sunny notices, or notices but cannot act on? Where do two parts hold facts that contradict each other, with nothing comparing them? Where does a note get written that nobody reads?
2. **Introspection.** Does Sunny really learn from each session? Does the next board change because of what happened? Can it explain why it changed?
3. **Each child's pace and personality.** Does Sunny notice Ila getting frustrated or checking out (her words, long silences, time stuck on a step, leaving games, repeated help requests)? Does it adapt for her? Does it find Reina's limits and push her past them? Is there any sentiment or engagement detection, and does anything act on it?
4. **Generated games.** Do they teach? Are they clear on first play? Does she want to replay them? Is a game she loved reused with new content (`build_from`)? Is a game that failed her retired?
5. **Other homework subjects.** How hard is it to run reading, science or new math homework through the same loop? Where does the code still assume one subject?
6. **Anything else** that limits how well Sunny teaches, that the owner and the agent who built it are too close to see.

## Rules

- Change nothing: no code, data or settings. Never write to the kiosk Mac.
- No deploys. Do not run Sunny code that calls Anthropic, ElevenLabs or any other paid service.
- Every claim needs proof someone else can check: a file and line, or a log file and line. Claims without proof count against the report.

## The report

Write it to `docs/audits/2026-11-10-<your-model>-audit.md` in the code folder, and leave it uncommitted.

### Part 1: one row per finding, in plain words

| Column | What it answers |
|---|---|
| What's broken | One sentence, no jargon |
| What my child lives through today | Her experience, naming which child |
| After the fix, Sunny can… | The new ability |
| What the parent will see | Something visible: a screen, a card, a change in her behaviour |
| How it helps her learn | The link to learning at her own rate |
| Introspection | Does Sunny catch this by itself next time and learn from it? What does it learn, and where is that recorded? |
| The number, before → target | One measure, with today's value from the logs |
| The fix, as one small job | Sized so a cheaper model (Sonnet) can do it in one change with one test, as a tool or fact given to the AIs, never a hard-coded rule |
| Proof | File:line or log:line |

### Part 2: the pitch, one page

A before/after table: **"After these fixes, Sunny can do what it could not."** Each row has Sunny today, Sunny after, and the number with its current value from the logs and a target. Then the top 5 fixes ranked by return on the children's learning, and a summary the parent can read in two minutes.

Record the tokens you used at the end of the report if you can see them.
