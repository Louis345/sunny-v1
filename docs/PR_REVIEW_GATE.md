# PR Review Gate

Automated merge gate for AGENTS.md Law 8. Three required status checks on `main`:

| Check | Source | Green when |
| --- | --- | --- |
| `verify` (shown as `CI / verify`) | `.github/workflows/ci.yml` | `npm run build` and `npm run test` pass |
| `ai-review/opus` | `.github/workflows/claude-review.yml` | Opus 5.5 approves: no blocking finding, every changed file reviewed, run succeeded |
| `human-gate` | `.github/workflows/human-gate.yml` | No risky paths, **or** the repo owner commented `/ship` on the current head, and the PR is not draft or `hold` |

Decision logic lives in `.github/pr-gate/` and is unit-tested in `.github/pr-gate/prGate.test.ts` and `fixList.test.ts` (they run as part of root `npm run test`).

## `ai-review/opus`

On `pull_request` (opened, synchronize, reopened, ready_for_review; drafts are skipped), the workflow checks out the PR head, installs dependencies, and runs Claude Code (`anthropics/claude-code-action@v1`, model `claude-opus-5-5`). The reviewer reads `AGENTS.md`, then runs focused tests and writes throwaway probe tests (`.github/pr-gate/vitest.probe.config.mts`). It returns a JSON verdict validated against `VERDICT_SCHEMA` in `verdict.cjs`. The workflow posts **one** GitHub review (event `COMMENT`) with a summary and inline comments, then sets the status.

The check **fails closed**:

- `failure` on a `request_changes` verdict or any blocking finding.
- `failure` on a Claude run error or API error, including a missing `ANTHROPIC_API_KEY`.
- `failure` on missing, unparseable, or schema-invalid output.
- `failure` on a truncated review: the diff exceeds 150 files or 8000 changed lines (lockfiles excluded), or the reviewer didn't list every changed file in `files_reviewed`. Split the PR.
- `pending` stays in place if the job crashes or is cancelled. A pending required check still blocks the merge.

Re-run a failed review from the Actions tab, or push a new commit.

### `@codex` fix list

After each review, the workflow posts a PR comment that starts with `@codex`, so the authoring AI can act without a human relaying anything (`fixList.cjs`):

- **Required:** blocking findings, numbered as `F<n>`. Each one links to its inline review thread (or to the review when it isn't anchored to a diff line), names `file:line`, gives the fix, and gives the red test to write first.
- **Can defer to BUGS.md with a reason:** non-blocking findings.
- **Resolved since last review:** prior Required items the reviewer verified as fixed.
- **Done** = build and focused tests pass, CI `verify` is green, the author replies in each thread, then pushes. Every push re-runs the review.

A hidden `ai-review/opus:state` marker in that comment records the open Required items. Only comments from `github-actions[bot]` are read. On the next push, the reviewer gets each open item with the author's thread replies. It must report each one as `resolved` (fix in code plus a passing test; a reply alone doesn't count) or `unresolved`. Any unresolved or unchecked item keeps `ai-review/opus` red and carries forward with its original ID and thread. If the state marker is ever corrupt, the gate stays red and doesn't overwrite it, until the owner deletes that comment.

The `@codex` mention is posted only when there is something to act on. Approvals with no open items, and failed reviewer runs (API errors), get a mention-free record. A diff-budget failure asks `@codex` to split the PR.

## `human-gate`

Risky paths are defined in `.github/pr-gate/riskPaths.cjs`:

- `src/souls/**` and `src/companions/**`
- Profiles: `src/profiles*`, `src/profile/**`, `src/shared/childProfile.ts`, `children.config.json`, per-child `child_profile.json` / `learning_profile.json`
- `src/server/session-manager.ts`
- Learning-loop and evidence code (`*evidence*`, `*learningCycle*`, `*theory*`, `*calibration*`, `*prediction*`, …)
- `LEARNING_FEEDBACK_LOOP.md`, `AGENTS.md`, and `.github/**`, which includes the gate itself

Matching is case-insensitive, and rename sources count.

- **Non-risky PR:** green automatically.
- **Risky PR:** pending until the owner (`Louis345`) comments `/ship` as the first line of a comment. `/ship <sha>` (7–40 hex characters) pins the approval to that exact head. Use it if a push might race your comment. `/ship` from anyone else is ignored and gets a 😕 reaction.
- **New push:** a new head SHA starts pending again, so ship it again after reviewing the drift.
- **Kill switch:** a `hold` label or draft status keeps the gate pending, even after `/ship`. Removing the hold on the same head restores a `/ship` you gave before the hold. A `/ship` sent while held doesn't count; send it again after releasing.

The workflow uses `pull_request_target` and `issue_comment`, so it always runs the classifier from the **default branch** and never checks out PR code. A PR therefore can't loosen the rules that gate it. Changes to the gate take effect after they merge.

## Manual GitHub settings (owner must do these)

The workflows can't change repository settings. Do these once, after this PR merges, because `human-gate` only runs from the default branch:

1. **Secrets.** Settings → Secrets and variables → Actions → make sure `ANTHROPIC_API_KEY` is set (the old reviewer already uses it). `GITHUB_TOKEN` is automatic. No other secret is needed.
2. **Workflow permissions.** Settings → Actions → General → Workflow permissions: "Read repository contents" is enough. Each workflow requests its own `statuses` and `pull-requests` write scopes. Leave "Allow GitHub Actions to create and approve pull requests" **off**, since reviews are posted as `COMMENT`.
3. **Allow auto-merge.** Settings → General → Pull Requests → check **Allow auto-merge**. Optionally check "Automatically delete head branches".
4. **Branch protection on `main`.** Settings → Branches (or Rules → Rulesets) → add a rule for `main`:
   - Require a pull request before merging. Set required approvals to **0**: GitHub won't let the owner approve their own PR, so the gate is status checks plus `/ship`.
   - Require status checks to pass: `verify`, `ai-review/opus`, `human-gate`. A check only appears in the picker after it has reported once, so open a test PR first.
   - Optional: require branches to be up to date before merging.
   - Do not allow bypassing the above settings. If you need an emergency override, leave admin bypass on and use it deliberately.
5. **Auto-merge per PR.** Enable it per PR (`gh pr merge --auto --squash <n>`, or the PR page) once you're happy for it to land when all three checks turn green. Nothing in these workflows enables it.
6. **Labels.** Create a `hold` label (Issues → Labels).
7. **Bot-authored PRs.** If Codex opens or pushes PRs as a GitHub App bot instead of your user, add that bot to `allowed_bots` on the Claude Code step in `claude-review.yml`. Until then the action refuses to run and `ai-review/opus` fails closed.

## Known limits

- **Spoofed statuses.** Any workflow running with `statuses: write` can post these statuses, including a workflow that a PR adds under `.github/workflows/`. Such a PR is always risky, so its `human-gate` goes pending and `/ship` is the backstop: read workflow diffs before shipping them. To harden this, post `human-gate` from a GitHub App whose key is stored in an environment restricted to `main`, and set that App as the required check's expected source.
- **PR code sees the API key.** The reviewer runs PR code, so tests in the PR can read `ANTHROPIC_API_KEY`, just as CI tests can read CI secrets. Fork PRs get no secrets, so their review fails closed.
- **One review per push.** Each run posts one new review. Older reviews stay in the timeline, and the newest review matches the current status.
