# State startup-only ACP record retention

**Complexity: 2/10** — two prose corrections in an existing user guide and behavior spec, checked against the existing recorder implementation and its retention test; no runtime, test, or behavior change.

## Goal

Resolve PR #1916's recorded finding: "Describe ACP record retention as a startup prune rather than automatic removal 30 days after closure." The Connections guide and the connections-tab spec currently promise removal "automatically 30 days after they close", but retention runs only while the ACP records manager is constructed at startup. The wording must match the ACP user guide and the implementation: records closed more than 30 days before startup are removed at startup, not on a rolling timer.

## Approach and evidence

`src/acp-records/manager.ts:27` captures one startup time, and `:44` calls `isExpired` during the constructor's scan; there is no periodic expiry path. `src/acp-records/model.ts:7` fixes `ACP_RECORD_RETENTION_MS` at 30 days, and `:25`–`:27` expires only a record whose closure time is strictly more than that interval before the passed time. `src/acp-records/manager.test.ts:242`–`:254` pins the strictly-beyond-30-days closure boundary at startup, including retention of exactly 30 days, recent, and future-dated closures. The ACP guide already states the behavior correctly at `documentation/user-documentation/advanced-agents/acp-agent.md:55`: "Records closed more than 30 days before startup are removed then, not on a rolling timer."

Change the Connections guide sentence at `documentation/user-documentation/command-bar/connections.md:68` and the retention sentence at `product/specs/connections-tab.md:13` to the same startup-boundary wording. Keep the guide's surrounding statements about per-project storage, deletion, restart persistence, and open-record deletion unchanged. Add the spec's missing `[[acp-records]]` link so storage and retention details point at their owning spec, as subplan 07 requires. Do not touch `src/acp-records/manager.ts`, the retention constant, or the existing tests.

## Implementation steps

1. Rewrite the retention sentence in `documentation/user-documentation/command-bar/connections.md` to say closed records are kept per project and those closed more than 30 days before startup are removed at startup, not on a rolling timer.
2. Rewrite the retention sentence in `product/specs/connections-tab.md` with the same startup-boundary wording and link the retention detail to `[[acp-records]]`. Keep the open-record deletion rule.
3. Confirm no `help/` page or other user-documentation page repeats the rolling-removal claim; update only a page that already describes retention inaccurately.
4. Run `$janissary/scripts/run.mjs check-diff`; a Markdown-only change selects no source lint, typecheck, or related test job.
5. Promote this plan to `product/plans/complete/` and remove only the resolved entry from `product/backlog/pull-request.md`, preserving the remaining entries byte-for-byte.

## Tests and verification

- No new tests: this correction changes prose, not behavior. `src/acp-records/manager.test.ts`'s "prunes ... strictly beyond 30 days by closure, not start time" case remains the source of truth and must keep passing unchanged.
- Run `npm run test:server -- src/acp-records/manager.test.ts` to confirm the startup prune and its boundary remain green.
- Compare the corrected wording against `documentation/user-documentation/advanced-agents/acp-agent.md:55`, `src/acp-records/manager.ts:27`–`:45`, and `src/acp-records/model.ts:7` / `:25`–`:27`.
- Review the final diff for only the two prose files, this completed plan, and the backlog removal; run `git diff --check`.

## Out of scope

- Production source, retention constant, ACP record manager behavior, and test changes.
- New retention settings, periodic timers, or changes to startup recovery semantics.
- Other user-documentation or help pages that do not describe retention.
- The pull request's title and body, any other backlog entry, and merging, closing, or rewriting the pull request's history.

## Completion

- Corrected the retention wording in the Connections guide and the connections-tab spec to the startup boundary, and added the spec's `[[acp-records]]` link. No help page or other user-documentation page repeated the claim.
- `npm run test:server -- src/acp-records/manager.test.ts` passed all 34 tests, including the strictly-beyond-30-days closure case.
- `$janissary/scripts/run.mjs check-diff` selected no source checks for the Markdown-only change, and `git diff --check` passed.
- Removed only the resolved backlog entry, leaving two entries unchanged.
