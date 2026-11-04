# Record the 07 verification ledger results

**Complexity: 2/10** — a bounded evidence correction to one completed plan's verification ledger plus the pull-request backlog housekeeping; no production, test, spec, help, or user-documentation changes.

## Goal

Resolve PR #1916's recorded finding: "record 07's actual verification results and partial manual status instead of completing the plan with its planning-pass ledger." The completed 07 plan still carries the planning-pass table that says the documentation, help, and requirement-map suites were "not rerun by this planning pass" and that the docs and production builds were "not performed by this planning pass." The 07 implementation at `5fa9845` did run those checks, but its actual results, implementation SHA, emitted chunk names, and per-scenario manual status never reached the plan. Replace only the plan's verification ledger with the implementation evidence and honest partial manual outcomes.

## Approach and evidence

The 07 implementation landed as `5fa9845` (`docs(connections): reconcile feature docs and acceptance`). Its commit changed the behavior specs, contributor and user documentation, help pages, `src/plugins/documentation.test.ts`, and promoted the plan. The help/keys repair is part of that commit: `help/keys.md` replaces the removed Ctrl+T response-panel instruction with the retained per-tab transcript tool-step collapse, and the other help pages carry the connections lookup, record, and asynchronous-answer wording.

`5fa9845`'s implementation report records a passing `$janissary/scripts/run.mjs check-diff`, requirement-map batches of 39 server test files / 1224 tests and 15 client test files / 234 tests, and a focused 10-file / 251-test batch covering the 06b acceptance, command-table, and help-page suites. It also reports a passing `npm run docs:build`, a passing `npm run build:web -- --manifest --sourcemap` with the lazy chunk graph inspected, and 5/5 passing `src/plugins/documentation.test.ts` tests. Those counts and the manual observations exist only in the implementation report, so the ledger names that source rather than presenting them as a fresh run by this correction.

The build output remains current because every commit after `5fa9845` through the prepared head is documentation or plan/backlog-only. Re-running the production build at the ledger publication SHA emits the same graph: eager entry `assets/index-D5srcYR2.js`; Connections dynamic entry `assets/connections-Hvi_P1cQ.js` with `assets/connections-D-FwGdwy.css`; Shell dynamic entry `assets/shell-DQS0qdfn.js` with `assets/shell-Dvv_bZYX.css`. `web/dist/.vite/manifest.json` lists Connections and Shell under the entry's `dynamicImports`, while the entry's static `imports` contain only `_jsx-runtime-BA9wYCQY.js`. Connection list/record class markers and fixture or removed-panel identifiers are absent from the eager JS and CSS. A fresh `npm run docs:build` and `npm run test:server -- src/plugins/documentation.test.ts` (5/5) confirm the documentation seam and generated help site still pass unchanged.

Manual acceptance was partial, not complete. M1, M2, and M6 were each partially exercised; M8 passed for its tested items. M3, M4, M5, and M7 were not exercised. The ledger records the missing resources rather than converting partial observation into a pass: an assigned browser, authenticated provider/model access, a scratch project and harmless task fixture, restart control, and a reachable SSH host speaking remote protocol 37 with an authenticated remote provider.

## Implementation steps

1. Rewrite only the "Verification resources and evidence ledger" section of `product/plans/complete/connections-tabs-07-specs-docs-integration.md` so it records the `5fa9845` implementation SHA, automated suite counts with their report source, docs and production build outcomes, actual entry/connections/shell chunk names and static-closure result, documentation-test result, help/keys repair, and per-scenario manual status.
2. Preserve every other section of the completed 07 plan byte-for-byte, including its complexity rating, goal, decisions, requirement map, manual scenario definitions, and out-of-scope list.
3. Run `$janissary/scripts/run.mjs check-diff` and the unchanged `src/plugins/documentation.test.ts` suite. Do not edit production code, tests, specs, help pages, or user documentation.
4. Promote this plan to `product/plans/complete/` and remove only the resolved entry from `product/backlog/pull-request.md`. Since it is the only remaining entry, restore the file to the exact master comment-and-heading skeleton.
5. Publish the plan, ledger correction, and backlog removal to the same `feature/connections-tabs` branch. Leave PR #1916 open.

## Tests

- No new tests. This is an evidence-record correction, not a behavior change.
- Re-run `npm run test:server -- src/plugins/documentation.test.ts`; the migrated assertions must remain 5/5 passing and unedited.
- Re-run `npm run docs:build` and `npm run build:web -- --manifest --sourcemap` only as confirmation that the recorded build evidence still matches the unchanged production tree.
- Run `$janissary/scripts/run.mjs check-diff`; a Markdown-only change selects no source lint, typecheck, or related test job.

## Out of scope

- Production source, tests, CSS, behavior specs, help pages, and user documentation.
- Re-running or reinterpreting the full manual acceptance suite, installing a substitute browser, or claiming M3, M4, M5, or M7 passed.
- Changing the completed 07 plan outside its verification ledger, reopening completed subplans, or altering the canonical source plan or its rating.
- The pull request's title and body, any other backlog entry, merging, closing, or rewriting the pull request's history.

## Completion

- Replaced only the completed 07 plan's "Verification resources and evidence ledger" with the `5fa9845` implementation SHA, report-sourced suite counts, docs and production build results, actual entry/connections/shell chunk names and static-closure inspection, the help/keys repair, and per-scenario manual status. Every other section is unchanged.
- `npm run test:server -- src/plugins/documentation.test.ts` passed 5/5 against the unedited test.
- `npm run docs:build` and `npm run build:web -- --manifest --sourcemap` passed; the emitted graph still shows Connections and Shell as dynamic entries with the recorded chunk names. Connection feature CSS and components remain outside the eager entry.
- `$janissary/scripts/run.mjs check-diff` selected no source checks for the Markdown-only change, and `git diff --check` passed.
- Removed the only remaining backlog entry and restored `product/backlog/pull-request.md` to its comment-and-heading skeleton.
