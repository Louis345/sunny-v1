# Independent OpenAI-model review of the progression plan

Reviewed PR: [#20](https://github.com/Louis345/sunny-v1/pull/20). Reviewed commit: `9706f4d1c6407524ea98e0cd9bf6a5eb3b828b85`. Reviewer: a fresh, read-only OpenAI-model sub-agent (`review_progression_plan`), requested by Jamal. This is a plan assessment, not a GitHub-account review, human approval, or implementation authorization.

## Completed reviewer report

I agree with the product direction. It fits Sunny’s contract: the Planner interprets evidence and chooses the next experience; runtime preserves facts and executes that choice; Creator owns visual composition. No mandatory reassessment, rotation quota, scripted lesson, or broad refactor is needed.

I would **resolve the following implementation questions before authorizing code**. These are plan clarifications, not objections to the vision.

1. **Blocker: specify recovery for the already blocked incident.** The plan promises a working next session (plan line 25), but the current blocked state deliberately prevents rebuying an invalid or uncertain response (learning contract lines 96–98). `successorResumeAction` follows that rule (`learningBoardInstances.ts:258`). Distinguish ordinary resumption of saved valid work from an explicitly authorized new attempt after truncation. Preserve the old receipt, evidence batch and predecessor; guarantee at most one committed decision and successor. If automatic recovery is intended, identify and approve the contract change explicitly.

2. **Blocker: a larger token budget alone cannot recover the saved failure.** The incident’s reported receipts confirm two 6,000-token `max_tokens` responses; the known `claude-sonnet-5` launch uses the caller budget. However, the receipt key uses a snapshot that omits the actual prompt and token budget (`learningCycleRuntime.ts:618`, `697`). The provider layer reuses a received response or rejects a changed request for that stage (`adaptiveMathDiscovery.ts:868`). Specify both the focused prevention change and the audited recovery mechanism. Other configured models receive different effective budgets; avoid a general “all Planner calls have 6,000 tokens” diagnosis.

3. **Question: what remembered context reaches this decision?** Calling `getChildChart` is insufficient by itself: this request extracts identity, demographics and engagement context, while omitting the chart’s longitudinal academic history (`learningCycleRuntime.ts:548`). It supplies current theory, predictions and observations, but not prior decision rationale or the full preceding instructional plan (`learningCycleRuntime.ts:652`). Identify the minimum existing context required to assess this handoff. Keep broader cross-subject memory work outside this first slice unless the evidence shows it is necessary.

4. **Clarify evidence and acceptance without expanding scope.** The investigation correctly treats missing evaluations as unresolved (investigation notes line 17). Zero evaluations may follow eligibility rules; the evaluator excludes time, source, assistance and confound mismatches (`longitudinalLearning.ts:96`). Do not widen windows or rewrite predictions to make comparisons appear. The next Planner should see missing evidence honestly.

After authorization, the regression should reproduce truncation through the real receipt boundary using synthetic data, then cover restart before/after response receipt and decision commit, repeated completion/startup, partial successor preparation, and uncertain outcomes. Assert provider-call counts, unchanged evidence and old receipts, one decision, one successor, and reused completed artifacts. Existing happy-path restart tests already cover part of this; extend them around the actual failure.

Human acceptance should inspect the saved expectation/evidence/decision chain and rendered successor, then close and return through the canonical visible kiosk at the tested commit. Record preservation, absence of duplicate purchases, coherent next work, and usefulness separately. Clarify that “dynamic board” means successive immutable boards—not mutation of a published board (learning contract lines 88–94).

Scope: fresh read-only review of commit `9706f4d`, the plan, investigation, repository rules, normative contract, relevant runtime and existing tests. I did not inspect live family records, run tests or sessions, call providers, edit files, or post remotely. The incident receipt details were supplied evidence, not independently re-inspected. This is an independent AI assessment, not human approval, a GitHub account review, or an official company endorsement.

## Author response for human discussion

I agree with the product verdict and the recovery concerns. Keeping a previously failed response is useful audit history, but the current plan still needs a precise, bounded way to authorize a new attempt. The reviewer is right that changing the budget does not solve receipt reuse. I am not proposing automatic retries on every restart or deleting the failed attempt.

I challenged the budget point during review: this incident really did use `claude-sonnet-5` and produced 6,000-token cutoffs. The shared transport's larger budget for other models does not explain away these saved failures. The reviewer accepted that distinction in its final report. The exact prevention remedy still needs to be chosen from the failed request and response, rather than assuming that one higher number is the whole fix.

For context, I agree that calling the chart does not prove that all useful remembered information reaches the Planner. The first implementation should trace what is already passed and add only the relevant missing account of the previous experience, if necessary. Sunny's vision is shared across subjects; this does not authorize rebuilding every subject's memory or prompt pipeline in one PR.

I agree that missing prediction evaluations must stay honest. Eligibility exclusions do not prove learner failure or planner failure. Their interpretation can inform what the Planner does next without changing historical predictions or prescribing a fixed reassessment routine.

The dynamic-board clarification concerns preserving the completed experience as history while preparing what comes next. It does not prescribe the next activities, arrangement, pedagogy, or dialogue.

**Current decision:** the goal is supported. The operational recovery and minimum context are not yet an approved implementation design. These findings go back to Jamal before implementation. No runtime change, new regression test, paid Planner retry, or merge has occurred.
