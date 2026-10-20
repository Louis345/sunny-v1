# Hidden-practice trace consumer audit

Opus addendum P2-b/P2-c requested inspection of the new diagnostic's data path. This is source inspection evidence, not a new runtime or acoustic test.

1. `SessionManager.recordCompanionTruthContradictions` calls `recordGameTrace`; the wrapper calls `SessionDebugRecorder.recordGameTrace`.
2. `session-debug-recorder.ts:335–352` sanitizes fields and appends **only** to `game-traces.ndjson`. It does not append a model message, a background instruction, a chart response, an activity reading, or an adventure-log entry.
3. The ordinary companion prompt is assembled from `conversationHistory`, pending game context, current board/context facts and toolkit results. Neither `companion-response-runner.ts` nor `urgentLearningSupport.ts` reads the game-trace file. The actual prior spoken teaching turn can remain in history; that separate known gap is still open. This new trace does not add another history path.
4. `postSessionTruthPacket.ts:332–339` admits only `companion_observation` and `child_signal` rows from game traces into companion observations. The new diagnostic is neither. Academic activity readings come from `activities/*.ndjson`, not this file.
5. The packet's contradiction aggregation at `postSessionTruthPacket.ts:451–455` reads **adventure-log** rows. `learningTheoryDecision.ts:26` can mark a legacy theory inconclusive for packet contradictions, but this writer does not put its game trace into that input. No new grade, contamination, assistance or learning-decision mutation is introduced by this trace path.
6. `auditSessionDirectory.ts:925–934` **does** report a high-severity engineering-audit issue for any `companion_truth_contradiction` row. This is an intended diagnostic effect and is not hidden. Its generic message contains no response letters; it does not rewrite the child response, inject a next-turn correction, or reclassify academic evidence.
7. The current psychologist packet's recent-session projection selects summary/activity/target/adaptation fields rather than raw game-trace response text. No new raw-letter projection was found there.

The whole-source search for `companion_truth_contradiction` and the old/new letter codes found the producer/detector and those two diagnostic consumers. This supports the claim **no new child-context injection or academic invalidation from the trace**, not a claim that an operator can never deliberately open raw logs for engineering review. An engineering audit may now flag the policy violation, as intended.

Remaining limits: explicit hidden visibility is required for the new practice kind; a game that hides letters without reporting it is not exhaustively covered. The detector is post-stream, does not censor, and does not prove the child heard letters. Interrupted partial-help accounting and historical syllabified dialogue remain separate concerns.
