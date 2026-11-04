# Distinguish live-only monitor and persona rows from retained ACP records

**Complexity: 2/10** — a wording correction in one functional spec and one user-documentation page, verified against existing source and tests; no production, test, or help change.

## Goal

Resolve PR #1916's recorded finding that `product/specs/connections-tab.md` claims every ACP session stays listed after it closes and reads `Running`, `Idle`, or `Closed`, while `documentation/user-documentation/command-bar/connections.md` repeats the blanket retention claim. In fact only tracked core ACP sessions and agent runs are retained as durable records. Monitor and editor-persona ACP rows are live-only rows that leave the list when their connection closes and read `Open`.

## Approach and evidence

`src/plugins/connections-topic-rows.ts` composes three groups of rows:

- `liveTabRows` walks each open tab's connection catalog and skips only tracked core ACP connections, whose live row is replaced by a durable record. Every other tab-scoped ACP connection, including monitor and editor-persona connections, becomes a `type: 'live'` row with status `Open` and disappears when the connection leaves the catalog.
- `databaseRows` produces the live SQLite rows.
- `durableRows` maps `managers.acpRecords.rows()` to `type: 'record'` rows carrying the record's own status. Those records cover tracked core ACP sessions and agent runs.

`src/plugins/connections-topic-rows.test.ts` confirms the split: the monitor fixture (`scope: 'monitor'`) and editor-persona fixture (`scope: 'editor'`) both appear only in the live-row expectations (for example `['live', 'monitor-1', 100]` and `['live', 'reviewer', 300]`), and the core ACP and agent fixtures appear only as durable record rows. The spec and documentation should describe that existing behavior, not change it.

## Implementation steps

1. In `product/specs/connections-tab.md` under "The connections tab", qualify the retention sentence so only tracked core ACP sessions and agent runs stay listed after closing, state that monitor and editor-persona ACP rows are live-only and leave the list when their connection closes, state that such a live-only row reads `Open`, and scope the `Running`/`Idle`/`Closed` status sentence to tracked core ACP records.
2. In `documentation/user-documentation/command-bar/connections.md`, make the same distinction where the introduction describes live versus retained rows, including the `Open` status for monitor and editor-persona rows and the `Running`/`Idle`/`Closed` statuses for tracked core ACP records.
3. Remove only the resolved entry from `product/backlog/pull-request.md`, preserving the remaining technical-debt entry byte-for-byte.
4. Promote this plan from `product/plans/ready/` to `product/plans/complete/`, run `$janissary/scripts/run.mjs check-diff`, commit, and push to the same head branch.

## Tests and verification

- No new code tests: this changes no behavior and no test expectation. The existing `src/plugins/connections-topic-rows.test.ts` monitor and persona fixtures are the evidence that the corrected wording matches the implementation.
- Run `$janissary/scripts/run.mjs check-diff`; a Markdown-and-backlog-only change selects no source lint, typecheck, or related test job.
- Run `git diff --check` before publication.
- After the push, confirm PR #1916 is still `OPEN`, its head branch is `feature/connections-tabs`, and `headRefOid` equals the new commit.

## Out of scope

- Production source, tests, CSS, help pages, and any other spec or documentation page.
- Changing row behavior, statuses, retention, ordering, or row composition.
- Any other backlog entry, updating the pull request description, merging or closing the pull request, rewriting published history, or touching files outside the two documentation files, the plan, and the backlog.

## Completion

- Qualified the connections-tab spec so only tracked core ACP sessions and agent runs are retained after closing.
- Documented monitor and editor-persona ACP rows as live-only rows that leave with their connection and read `Open`, distinct from tracked core ACP records reading `Running`, `Idle`, or `Closed`.
- Made the same distinction in the connections user documentation's live-versus-retained introduction.
- Verified both statements against `src/plugins/connections-topic-rows.ts` and the monitor and persona fixtures in `src/plugins/connections-topic-rows.test.ts`; no behavior or test change.
- Removed only the resolved entry from `product/backlog/pull-request.md`, leaving the technical-debt entry intact.
- `$janissary/scripts/run.mjs check-diff` selected no source checks for the Markdown-only change, and `git diff --check` passed.
- Pushed the bookkeeping commit to the open PR branch without AI attribution.
