# Give the 07 verification ledger a durable evidence scope

**Complexity: 2/10** — a bounded evidence-scope correction to one completed plan's verification ledger plus pull-request backlog housekeeping; no production, test, spec, help, user-documentation, or pull-request-description changes.

## Goal

Resolve PR #1916's recorded finding: "record the commits after `7e42ec0b` in the 07 verification ledger." The completed 07 plan names later commits only through `7e42ec0b`, while `2f8782d4`, `5f226510`, and `1a6ee959` changed the web history hook and its test, the Connections guide, the connections-tab spec, the connections topic action, and its test. The current head therefore carries later client and server production changes that the ledger's finite list never names.

Naming another finite list would only move the staleness to the next repair. Replace the exhaustive later-commit claim with a durable scope statement: each recorded result is historical at the SHA its row names, and every commit after that SHA is outside those results. The commit graph, not a ledger list, is the authoritative accounting.

## Approach and evidence

`git log --oneline 5fa9845..HEAD` is the authoritative list of commits since the 07 implementation. The ledger currently ends its later-commit accounting at `7e42ec0b`, but the branch has advanced:

- `2f8782d4` — `web/src/plugins/connections/useConnectionHistoryScroll.ts` and its test, the Connections user guide, and `product/specs/connections-tab.md`.
- `5f226510` — the Connections user guide and `product/specs/connections-tab.md`.
- `1a6ee959` — `src/plugins/connections-topic-actions.ts` and `src/plugins/connections-topic.test.ts`.
- `0b8ecc2c` — the backlog record only.

This correction does not extend the list. It states that the documentation-seam, docs-build, and production-lazy-graph results are historical at `dc491bd5`, the browser acceptance is historical at `37324fd4`, and any commit after the SHA a row names is outside that row's evidence. It records that no later build, docs-build, documentation-suite, or browser run exists, and that each later repair's focused tests live in its own fix plan. The authoritative commit list is `git log --oneline 5fa9845..HEAD`.

Every per-scenario manual result stays unchanged, including M7 blocked and every partial status. No full rerun and no full manual pass are claimed.

## Implementation steps

1. In `product/plans/complete/connections-tabs-07-specs-docs-integration.md`, replace the verification-ledger paragraph's finite later-commit list and its "This correction changes only…" sentence with the durable scope statement: results are historical at the SHA named in their rows (`dc491bd5` for the documentation seam, docs build, and production lazy graph; `37324fd4` for the browser acceptance), every commit after a row's SHA is outside that evidence, each repair's focused tests are recorded in its own fix plan, and `git log --oneline 5fa9845..HEAD` is the authoritative commit list.
2. Revise the "Implementation SHA and help/keys repair" row to end its `dc491bd5`-bounded history with the same durable scope instead of enumerating post-`dc491bd5` commits.
3. Mark the "Documentation seam", "Docs build", and "Production lazy graph" rows historical at `dc491bd5` and outside all later commits, without naming individual later SHAs.
4. Change the two "this ledger correction did not rerun" phrasings to a durable "no ledger correction reran" form.
5. Preserve every manual-scenario row, M7 blocked, the source-report caveats for the older suite counts, and the statement that documentation/build completion is not a full manual pass.
6. Promote this plan to `product/plans/complete/`, remove only the resolved entry from `product/backlog/pull-request.md`, preserve the other entries, run `$janissary/scripts/run.mjs check-diff`, commit, and push to `feature/connections-tabs`. Leave PR #1916 open and its description unchanged.

## Tests

- No new or changed tests; this is an evidence-record correction.
- Do not rerun the production build, docs build, documentation suite, or browser acceptance; keep their `dc491bd5` and `37324fd4` results historical.
- Run `$janissary/scripts/run.mjs check-diff`; a Markdown-only change selects no source lint, typecheck, or related test job.

## Out of scope

- Production source, tests, CSS, behavior specs, help pages, and user documentation.
- Re-running or reinterpreting the full manual acceptance suite, installing a substitute browser, or claiming M7 or any partial scenario passed.
- Changing the completed 07 plan outside its verification ledger, reopening completed subplans, or altering the canonical source plan or its rating.
- Other backlog entries, the pull-request title and body, merging, closing, or rewriting the pull request's history.

## Completion

- Replaced the finite post-`dc491bd5` commit list with a durable scope statement naming `git log --oneline 5fa9845..HEAD` as the authoritative commit list.
- Scoped the documentation seam, docs build, and production lazy graph to `dc491bd5` as historical, and the browser acceptance to `37324fd4`.
- Every per-scenario manual row is unchanged; M7 remains blocked and no full pass is claimed.
- Removed only the resolved backlog entry, leaving four entries in `product/backlog/pull-request.md`.
- `$janissary/scripts/run.mjs check-diff` selected no source checks for the Markdown-only change.
