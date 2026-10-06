# technical-debt

## ready

## development



## deferred



* Run search matching in a terminable worker so one expensive expression cannot stall the server. — deferred: complexity 8/10, introduces the first worker execution boundary with source and compiled loading, cancellation, deadline recovery, and matching protocol changes.

Existing Debt: The search plugin bounds file sizes, concurrent reads, and delivered rows but executes user-supplied regular expressions synchronously on the server thread, leaving matching outside any enforceable execution budget. Severity: 7/10

Existing Risk: 8/10 - A valid expression with excessive backtracking against a project file can block socket replies, terminal output, and scheduled work for the entire session, while cancellation and plugin timeout callbacks cannot run.

Proposal Risk: 2/10 - A matching deadline can reject a legitimate expensive search and worker startup adds latency, but termination confines the stalled computation to that search and allows the next query to run.

Proposal: In `src/plugins/search/compile-matcher.ts`, `compileMatcher` accepts any compilable expression that does not match the empty string; `fileMatches` and `matchFile` in `src/plugins/search/search-files.ts` then call its synchronous `test` and `locate` methods from `detect` and `deliver` in `src/plugins/search/scan.ts`. An expression such as `(a+)+$` against a long line ending in a nonmatching character can keep one call busy despite the 2 MiB file limit. `src/plugins/guard.ts` races promises against a timer and cannot interrupt this work, and `SearchSession.run` in `src/plugins/search/session.ts` returns while the scan continues. Add a lazy matching-worker adapter and worker entry beside these search modules, passing plain query modes, text, operation, and request identity across the boundary; keep filesystem reads and host capabilities in the existing scan. Route both detection and row extraction, including matcher construction, through the worker and enforce a named per-job deadline from the parent thread. Have scan cancellation and disposal terminate the worker, settle its pending jobs, and ignore late replies; surface an expired deadline through the existing scan-error result while keeping subsequent searches usable. Preserve ordering, context, regex semantics, and the 250-row cap covered by `src/plugins/search/compile-matcher.test.ts`, `src/plugins/search/search-files.test.ts`, `src/plugins/search/scan.test.ts`, and `src/plugins/search/activate.test.ts`. Those tests do not cover a matcher that monopolizes the event loop: add deterministic worker-lifecycle tests for expiry, cancellation, and late replies, plus an isolated worker case proving the parent stays responsive during expensive matching and a later query succeeds. Document the deadline outcome in `product/specs/search-tab.md`.


## declined

* Protect user edits made after a copy-paste before undo deletes its destination in `src/file-navigator/moves.ts`: `undoCopyPaste` records only absolute source and destination paths and unconditionally removes each destination, so editing or replacing a copied file before pressing undo silently deletes the newer content. Record enough identity or content metadata with each copy history entry to detect divergence and surface a conflict instead of removing a changed destination. Severity: **high**. — deferred: complexity 8/10, requires recursive destination identity tracking plus new undo conflict semantics across server history and client conflict handling.

* Stop the sandbox-confinement tests from passing vacuously off darwin in `src/sandbox/index.test.ts`: seventeen cases open with a bare `if (!sandboxAvailable()) return;`, and `sandboxAvailable()` requires `process.platform === 'darwin'` plus `/usr/bin/sandbox-exec`, so on the `ubuntu-latest` runners every job in `.github/workflows/ci.yml` uses, all of them return before their first assertion and are reported as *passing* rather than skipped. Every assertion about the Seatbelt profile the security model rests on — the `-D` param bindings, the secret-deny paths, the credential scrub, the `TMPDIR` override, the offline variant — therefore only ever runs on a developer's Mac, and CI would stay green if the confined path were deleted outright. Convert them to `describe.skipIf(!sandboxAvailable())` (or `it.skipIf`) so a run that cannot exercise confinement reports skips instead of green passes. Severity: **high**. declined: this application is currently limited to running on mac os x.
