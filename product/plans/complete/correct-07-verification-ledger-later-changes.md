# Correct the 07 verification ledger's later production and test changes

**Complexity: 2/10** — a bounded evidence correction to one completed plan's verification ledger plus the pull-request backlog housekeeping; no production, test, spec, help, or user-documentation changes.

## Goal

Resolve PR #1916's recorded finding: "correct the 07 verification ledger's claim that no production or test change followed its implementation." The completed 07 plan says every commit after `5fa9845` through the prepared head is documentation, plan, or backlog only, and its evidence table says "No production or test change followed it." The branch does carry production and test repairs after that SHA. A reviewer can therefore read the 07 build and test evidence as covering the current tree, when later source and test fixes were never included in the recorded build, documentation, and suite checks.

## Approach and evidence

The commits after `5fa9845` that touch `src/` or `web/src/` are:

- `80a9b527` — bind connection row actions to their owning tab (production and tests).
- `0739efc0` — give list rows an owner-aware identity (production and tests).
- `cadc9a2c` — keep row controls from opening their row on Enter (production and tests).
- `40387192` — match caller popup agent rows by incarnation (production and tests).
- `5b4cdde8` — preserve the history viewport across streamed updates (production and tests).
- `8a1a9752` — release record windows when their tabs close (production and tests).
- `d9d32e3f` — handle refused row actions and stale deletes (production and tests).
- `1611b81f` — route connection answer links through the application (production and tests).
- `160a2cd7` — key history blocks by absolute position (production and tests).
- `a6e878a6` — pin record-tab open order and window refresh (tests only).
- `5048a03d` — drop the unused harness open-connection intent (production and tests).
- `1b33cd66` — require confirmed delete for closed records (production and tests).
- `8ba3e563` — keep the history viewport when blocks arrive during paging (production and tests).
- `e1f9e804` — remove stale connection and ACP references (source comments only in `src/browser/command.ts` and `src/connection/close.ts`).

The remaining commits in the range are documentation, plan, or backlog changes. The correction names the production and test repairs, then records fresh evidence at `dc491bd5`, the head the correction started from, rather than carrying forward the `5fa9845`/`37324fd4` tree assumption.

Fresh results at `dc491bd5`:

- `npm run test:server -- src/plugins/documentation.test.ts`: 1 file, 5/5 tests passing.
- `npm run docs:build`: VitePress 2.0.0-alpha.20 built the client and server bundles and rendered pages successfully.
- `npm run build:web -- --manifest --sourcemap`: passed. Eager entry `assets/index-C7DBLQu3.js` with `assets/index-CN9YdR4k.css`; Connections dynamic entry `assets/connections-CfKGkjS8.js` with `assets/connections-DtTmeg9C.css` and `assets/shared-dn7ImBvZ.css`; Shell dynamic entry `assets/shell-BrkzWmA5.js` with `assets/shell-Dvv_bZYX.css` and shared CSS. The entry's static closure is only `_jsx-runtime-BA9wYCQY.js`. The `connections-row`, `connections-record`, `connections-history`, `connections-list`, and `connections-activity` markers are absent from the eager JS and CSS, and no fixture or removed-panel identifier was found.

The ledger keeps every per-scenario manual result unchanged: M1, M2, M3, M4, and M5 remain partial, M6 and M8 passed for exercised items, and M7 remains blocked. No full manual pass is claimed.

## Implementation steps

1. In `product/plans/complete/connections-tabs-07-specs-docs-integration.md`, replace only the blanket sentence claiming all later commits are documentation, plan, and backlog only with the actual commit sequence and the reason the checks were rerun.
2. Replace the implementation-SHA table row's "No production or test change followed it" with the production and test commits above.
3. Scope the documentation-suite, docs-build, and production-build rows to the fresh `dc491bd5` reruns and record their exact results, chunk names, and static-closure inspection.
4. Preserve every other section and every manual-scenario row, including all partial statuses and M7 blocked.
5. Promote this plan to `product/plans/complete/`, remove only the resolved entry from `product/backlog/pull-request.md`, and preserve the remaining entries.
6. Run `$janissary/scripts/run.mjs check-diff`, commit, and push to `feature/connections-tabs`. Leave PR #1916 open and leave its description unchanged.

## Tests

- No new tests; this is an evidence-record correction, not a behavior change.
- Re-ran `src/plugins/documentation.test.ts` at `dc491bd5`: 5/5 passing.
- Re-ran `npm run docs:build` and `npm run build:web -- --manifest --sourcemap` at `dc491bd5`, including manifest and eager-closure inspection.
- Run `$janissary/scripts/run.mjs check-diff`; a Markdown-only change selects no source lint, typecheck, or related test job.

## Out of scope

- Production source, tests, CSS, behavior specs, help pages, and user documentation.
- Re-running or reinterpreting the full manual acceptance suite, installing a substitute browser, or claiming M7 or any partial scenario passed.
- Changing the completed 07 plan outside its verification ledger, reopening completed subplans, or altering the canonical source plan or its rating.
- Other backlog entries, the pull request title and body, merging, closing, or rewriting the pull request's history.

## Completion

- Replaced the blanket "documentation, plan, and backlog only" sentence and the "No production or test change followed it" row with the actual production and test commits from `80a9b527` through `8ba3e563`, the test-only and comment-only commits, and the `dc491bd5` reruns.
- `npm run test:server -- src/plugins/documentation.test.ts` passed 5/5 at `dc491bd5`.
- `npm run docs:build` passed at `dc491bd5`.
- `npm run build:web -- --manifest --sourcemap` passed at `dc491bd5`; Connections and Shell remain dynamic entries and the eager closure is only `_jsx-runtime-BA9wYCQY.js`.
- Every per-scenario manual row is unchanged; M7 remains blocked and no full pass is claimed.
- Removed only the resolved backlog entry, leaving two entries in `product/backlog/pull-request.md`.
- `$janissary/scripts/run.mjs check-diff` selected no source checks for the Markdown-only change.
