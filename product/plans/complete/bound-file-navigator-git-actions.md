# Bound file-navigator Git actions

**Complexity: 6/10** — one shared Git process helper replaces duplicated `execFile` calls in pull and commit, retaining their existing rollback flows while adding a deadline, cancellation, and prompt suppression.

## Goal

User-armed Git pull and commit actions always settle within a bounded time and cannot hang waiting for an interactive terminal prompt.

## Approach

Add `runGit(args, cwd, options)` under `src/git/`. It wraps `execFile` with a default timeout matching the remote file-operation long-request deadline, `SIGTERM` on timeout, optional `AbortSignal`, and inherited environment plus `GIT_TERMINAL_PROMPT=0`. Route every Git process in `pull.ts` and `commit.ts` through it. Existing error handling remains responsible for unstaging after a failed commit and aborting failed rebases; timeouts reject through those same paths.

## Implementation steps

1. Add the shared runner and unit tests for arguments, environment, timeout, signal, and rejection.
2. Route pull and all commit/rebase/stash operations through the runner.
3. Update pull and commit tests to assert the common runner options and preserve rollback coverage.
4. Remove the matching backlog item and promote this plan to complete.

## Tests

- Runner tests pin default and overridden timeout, abort-signal forwarding, terminal-prompt suppression, and error propagation.
- Existing `pullRoot` and `commitRoot` tests continue to cover command order, failures, and rollback behavior.
- Run `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- Migrating `SyncCommandRunner` to the shared helper.
- Changing Git error reporting, credential helpers, or the remote request deadline.
