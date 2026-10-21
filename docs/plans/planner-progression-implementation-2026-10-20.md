# Completed-board handoff: implementation

Jamal authorized implementation after the independent review of [plan PR #20](https://github.com/Louis345/sunny-v1/pull/20). Nothing is authorized to merge.

The earliest failure was delivery: the next-plan response was cut off at 6,000 tokens. The board and saved child results were not the cause. The lab previously exercised short, successful decisions, so it missed a full next-board answer hitting the response limit. Saved provider receipts exposed the cause after the human found the stalled experience.

This change gives that existing request a 32,000-token allowance and the relevant remembered context: the prior instruments, previous decisions, and the chart's academic history. These are facts and earlier author choices, not new instructions about which lesson to choose.

New requests are frozen before purchase, including their prompt, tools, model and transport policy. A restart reuses those exact bytes and any received response. Existing receipt identities remain readable. Changing a budget cannot erase or replace a failed response.

For the incident already blocked, an operator may explicitly authorize one new attempt by naming its blocking decision and giving a reason. Only a saved, received primary next-plan `max_tokens` response is eligible. Authorization is a durable lifecycle event linked to that failure; the new attempt has its own receipt. The old receipt, predictions, observations and completed board remain intact. Refusals, uncertain outcomes and other failures remain blocked. Ordinary startup never authorizes recovery. Repeating an old authorization cannot purchase another attempt.

Regression tests use isolated synthetic data and fake providers through the real receipt boundary. They cover response space and remembered context, truncation, explicit authorization, restart before and after receipt/commit, legacy receipt reuse, refusal/uncertain outcomes, and one decision/successor. Existing successor tests cover partially prepared artifacts and returning-session consumption. No paid call or real child record is used in verification.

Human acceptance remains: return after the completed board, inspect whether the next plan makes sense for Ila, enter its activities, close and return again. Provider delivery and record integrity can be automated; teaching quality and the child's experience still need the human test.

Educational decisions, activities, reassessment and presentation remain with the Planner and Creator. The runtime changes only delivery, memory and explicit recovery. This follows “more freedom, less constraint, more introspection.” Reviewers should challenge whether the added context is useful, recovery is truly bounded, and any remaining restriction competes with AI judgment.

The operator command is `npm run sunny:planner:authorize-recovery -- --child CHILD --homework HOMEWORK --blocked-decision ID --reason "Human approval reason" --approve-retry`. It records authorization only; it makes no provider call. Use the intended runtime context and chart when preparing the subsequent canonical kiosk session. Do not run it on family data as part of automated verification.
