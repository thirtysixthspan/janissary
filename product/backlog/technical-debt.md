# technical-debt

## ready

## development


* Reduce the cognitive complexity of `applyReplayProtocol()` in `src/file-navigator/replay-protocol.ts` (line 35), reported at 18 against the allowed 15 in a file scoring 46.06 FTA across 73 lines. The function runs one replay pass over clipboard/undo steps and folds three concerns inline — conflict detection against preflight, a per-item apply loop gated on the conflict policy, and stack reconciliation that re-pushes remaining steps onto the from-stack — each nesting conditionals inside the shared loop, so lifting the conflict collection or the stack reconciliation into a local helper brings the tangle down without touching exports. The file is a quiet corner (one commit in six months), so nothing is on fire. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `applyReplayProtocol()` in `src/file-navigator/replay-protocol.ts`. Severity: **low**.

## deferred

## declined

* Protect user edits made after a copy-paste before undo deletes its destination in `src/file-navigator/moves.ts`: `undoCopyPaste` records only absolute source and destination paths and unconditionally removes each destination, so editing or replacing a copied file before pressing undo silently deletes the newer content. Record enough identity or content metadata with each copy history entry to detect divergence and surface a conflict instead of removing a changed destination. Severity: **high**. — deferred: complexity 8/10, requires recursive destination identity tracking plus new undo conflict semantics across server history and client conflict handling.

* Stop the sandbox-confinement tests from passing vacuously off darwin in `src/sandbox/index.test.ts`: seventeen cases open with a bare `if (!sandboxAvailable()) return;`, and `sandboxAvailable()` requires `process.platform === 'darwin'` plus `/usr/bin/sandbox-exec`, so on the `ubuntu-latest` runners every job in `.github/workflows/ci.yml` uses, all of them return before their first assertion and are reported as *passing* rather than skipped. Every assertion about the Seatbelt profile the security model rests on — the `-D` param bindings, the secret-deny paths, the credential scrub, the `TMPDIR` override, the offline variant — therefore only ever runs on a developer's Mac, and CI would stay green if the confined path were deleted outright. Convert them to `describe.skipIf(!sandboxAvailable())` (or `it.skipIf`) so a run that cannot exercise confinement reports skips instead of green passes. Severity: **high**. declined: this application is currently limited to running on mac os x.
