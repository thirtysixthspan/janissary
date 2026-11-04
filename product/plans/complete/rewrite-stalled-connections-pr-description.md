# Rewrite the stalled connections pull request description

**Complexity: 2/10** — a documentation-and-metadata correction to one pull request plus the required plan and backlog bookkeeping; no production, test, spec, help, or user-documentation change.

## Goal

Resolve PR #1916's recorded finding: "Description fidelity: replace the plan-only pull request description with the delivered feature, its verification, and its limitations." The current title still says `docs(plans): decompose connections tabs feature`, and the body still describes the initial publication of seven Markdown drafts in one commit at `a462dd7`, stating that no implementation, tests, specs, API change, screenshots, or manual feature behavior exists. The branch now carries the delivered feature, its tests, specs, documentation, API v3 break, and completed plans. Replace the stale title and body with an accurate account of what shipped and what remains manually unverified.

## Approach and evidence

The head under review is `feature/connections-tabs`, 54 commits beyond `139aaf43` and 260 changed files. The delivered implementation includes the project-scoped ACP record manager and store, core-tab and agent record feeds, symmetric local and remote cancellation with the `acp-cancel` frame and protocol 37, the coalesced `connections` host topic with catalog rows and ten actions, the bundled `connections` plugin with its singleton list and per-record tabs, asynchronous shell replies with popup row opening, and the breaking plugin API v3 removal of the response panel, `useAcpResponse`, `TabView.acpResponse`, and `launchShellHere()`.

Behavior authorities already describe the delivered result: `product/specs/acp-records.md` for persistence, recovery, and retention; `product/specs/connections-tab.md` for the list and record views; `product/specs/connection.md` for command grammar, catalog, and popup semantics; `product/specs/acp.md` for asynchronous answers, cancellation, questions, and remote connections; and `product/specs/tab-plugins.md` for the connections topic, ten actions, and API v3. The source plan and all subplans are under `product/plans/complete/`.

Verification evidence comes from the completed 07 plan's ledger at `product/plans/complete/connections-tabs-07-specs-docs-integration.md`: a passing `check-diff`, 39 server test files / 1224 tests and 15 client test files / 234 tests in requirement-map batches, a focused 10-file / 251-test acceptance batch, a passing documentation build, a passing production build whose lazy graph was inspected, and 5/5 documentation tests. Later focused repair commits added regression coverage for owner-aware rows, control-only Enter, caller-incarnation matching, viewport preservation under streamed updates, and prompt cancellation boundaries.

The same ledger records manual acceptance honestly as partial: M1 asynchronous shell, M2 navigation/list/actions, and M6 persistence/recovery/deletion were partially exercised; M8 legacy output/help/completion passed for the items exercised but was not a full pass; M3 record content/history, M4 cancel/close/questions, M5 agents/snapshots/non-tracked consumers, and M7 real remote cancellation were not exercised. Missing resources are an assigned browser, authenticated provider/model access, a live record with more than 20 blocks, harmless headed/headless agent tasks with editor persona and monitor fixtures, restart control, and a reachable SSH host speaking remote protocol 37 with an authenticated remote provider. No screenshots were captured, and the API v3 implementation commit records that the assigned browser could not start.

## Implementation steps

1. Write the replacement body to `./temp/pr-body.md` after the bookkeeping push, using the final head SHA for links to the source plan and subplans under `product/plans/complete/`.
2. Give the body a delivered-feature summary, the shipped records/feeds/cancellation/topic/plugin/shell/API sections, the specs, documentation, and tests that landed, the automated evidence with its source, a screenshots-none statement, the honest manual status and blockers, and a scratch-project setup plus exercised manual scenarios for asynchronous shell delivery with an intervening command and cancellation, list navigation including duplicate-looking rows, history paging, close and delete confirmation, agent Terminate, restart recovery, and real remote cancellation.
3. Replace the plan-only title with `feat(connections): add persistent connection tabs`, a Conventional Commits subject describing the delivered behavior rather than the initial publication.
4. Remove only the resolved entry from `product/backlog/pull-request.md`, preserving the remaining plan-fidelity entry byte-for-byte.
5. Promote this plan to `product/plans/complete/`, run `$janissary/scripts/run.mjs check-diff` and `git diff --check`, commit the plan and backlog bookkeeping, and push to the same head branch. Then apply the title and body with `gh pr edit` and `gh pr edit --body-file`, leaving the pull request open.

## Tests and verification

- No new code tests: this changes no behavior. The existing automated suites remain the evidence rather than being re-claimed as a fresh full run.
- Run `$janissary/scripts/run.mjs check-diff`; a Markdown-and-backlog-only change selects no source lint, typecheck, or related test job.
- Run `git diff --check` before publication.
- After the push, re-read the edited description and title from GitHub, confirm the branch and open state, and confirm `headRefOid` equals the bookkeeping commit.
- Compare every claim in the body with `product/specs/acp-records.md`, `product/specs/connections-tab.md`, `product/specs/connection.md`, `product/specs/acp.md`, and `product/specs/tab-plugins.md`, and compare manual status with the completed 07 ledger.

## Out of scope

- Production source, tests, CSS, behavior specs, help pages, and user documentation.
- Rerunning, substituting, or claiming a pass for the blocked manual browser, provider, restart, history-size, or real-remote scenarios.
- Inventing screenshots, capture paths, test counts, or timings not recorded by the implementation evidence.
- Any other backlog entry, merging or closing the pull request, rewriting published history, or touching files outside the plan, backlog, and scratch body file.

## Completion

- Replaced the plan-only PR title with `feat(connections): add persistent connection tabs`.
- Replaced the initial-publication body with the delivered records, feeds, local and remote cancellation, coalesced topic and actions, plugin list and record tabs, asynchronous shell replies, popup opening, API v3, and the shipped specs, docs, and tests.
- Removed every initial-publication claim, including the seven-file/307-line/one-commit status, the pinned `a462dd7` SHA, the no-implementation statement, and the plan-only verification instructions.
- Linked the source plan and subplans under `product/plans/complete/` at the bookkeeping head.
- Stated that no screenshots were captured, preserved the 07 ledger's partial and unexercised manual status, and named the missing browser, provider, fixture, restart, and remote-host resources.
- Removed only the resolved description entry from `product/backlog/pull-request.md`, leaving the plan-fidelity entry intact.
- `$janissary/scripts/run.mjs check-diff` selected no source checks for the Markdown-only change, and `git diff --check` passed.
- Pushed the bookkeeping commit, applied the description with `gh pr edit --body-file`, kept PR #1916 open, and added no AI attribution.
