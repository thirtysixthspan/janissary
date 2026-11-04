# Correct the 07 verification ledger's later-commit scope

**Complexity: 2/10** — a bounded evidence correction to one completed plan's verification ledger plus pull-request backlog housekeeping; no production, test, spec, help, or user-documentation changes.

## Goal

Resolve PR #1916's recorded finding: "correct the 07 verification ledger's claim that no later change followed its re-verified head." The completed 07 plan says the production build, documentation build, and documentation suite were re-run at `dc491bd5` and that "only this correction's plan, ledger edit, and backlog removal follow that SHA". Documentation, spec, production, and test changes followed `dc491bd5`, so that evidence is scoped to an older tree and the ledger's claim no longer matches the branch.

## Approach and evidence

`git log --oneline 5fa9845..HEAD` and `git log --name-only dc491bd5..HEAD` show these commits after `dc491bd5`:

- `bc2aaecd` — the earlier ledger correction; plan, ledger, and backlog only.
- `52cbde7e` — `documentation/user-documentation/command-bar/connections.md` and `product/specs/connections-tab.md`; no code or test change.
- `f2e9e26c` — `src/plugins/connections/tabs.ts` list-row projection, `src/plugins/connections/activate.test.ts`, and the same spec.
- `f4125fa1` — backlog only.
- `7e42ec0b` — the `loadOlder` guard in `src/plugins/connections-topic-actions.ts`, `src/plugins/connections-topic.test.ts`, and the same spec.

The correction keeps the `dc491bd5` results as the last recorded production-build, docs-build, and documentation-suite evidence and labels them historical. It does not rerun them. It states that the later server production changes are covered only by their focused activation and topic tests, and that the later guide and spec wording has no fresh automated evidence. Every per-scenario manual result stays unchanged, including M7 blocked, and no full manual pass is claimed.

## Implementation steps

1. In `product/plans/complete/connections-tabs-07-specs-docs-integration.md`, revise the verification-ledger paragraph that scopes the reruns to `dc491bd5` and claims only the correction's plan, ledger edit, and backlog removal follow, naming `bc2aaecd`, `52cbde7e`, `f2e9e26c`, `f4125fa1`, and `7e42ec0b` and stating that the evidence is historical.
2. Revise the "Implementation SHA and help/keys repair" row to record the later documentation, spec, production, and test commits.
3. Mark the "Documentation seam", "Docs build", and "Production lazy graph" rows as historical at `dc491bd5`, not rerun after the later commits, and state the later server changes' focused-test-only coverage.
4. Preserve every manual-scenario row, the source-report caveats for the older suite counts, M7 blocked, and the statement that documentation/build completion is not a full manual pass.
5. Promote this plan to `product/plans/complete/`, remove only the resolved entry from `product/backlog/pull-request.md`, preserve the other entries, run `$janissary/scripts/run.mjs check-diff`, commit, and push to `feature/connections-tabs`. Leave PR #1916 open and its description unchanged.

## Tests

- No new or changed tests; this is an evidence-record correction.
- Do not rerun the production build, docs build, or documentation suite; record their `dc491bd5` results as historical.
- Run `$janissary/scripts/run.mjs check-diff`; a Markdown-only change selects no source lint, typecheck, or related test job.

## Out of scope

- Production source, tests, CSS, behavior specs, help pages, and user documentation.
- Re-running or reinterpreting the full manual acceptance suite, installing a substitute browser, or claiming M7 or any partial scenario passed.
- Changing the completed 07 plan outside its verification ledger, reopening completed subplans, or altering the canonical source plan or its rating.
- Other backlog entries, the pull request title and body, merging, closing, or rewriting the pull request's history.

## Completion

- Revised the 07 verification ledger's claim and the implementation-SHA, documentation-seam, docs-build, and production-build rows to name the later commits and scope the recorded build, docs, and suite evidence to `dc491bd5` as historical.
- Stated that the later server production changes are covered only by their focused activation and topic tests, and that the later guide and spec wording has no fresh automated evidence.
- Every per-scenario manual row is unchanged; M7 remains blocked and no full pass is claimed.
- Removed only the resolved backlog entry, leaving three entries in `product/backlog/pull-request.md`.
- `$janissary/scripts/run.mjs check-diff` selected no source checks for the Markdown-only change.
