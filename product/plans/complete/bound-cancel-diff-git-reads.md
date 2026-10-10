# Bound and cancel diff Git reads

Complexity: 7/10

## Goal

Ensure a stalled diff refresh cannot block later refreshes indefinitely and that obsolete Git child processes stop when the tab changes roots or closes.

## Approach

Give each recompute a deadline and an owned abort signal. Thread cancellation through the change-set reader, context expansion, and every Git subprocess. Preserve the standing payload during refresh, existing revision checks, and queued recomputes. Treat a current read deadline as a recoverable error while suppressing results from disposed or superseded reads.

## Implementation steps

1. Add AbortSignal support to Git execution, change-set collection, untracked-file batches, and context expansion. Preserve the distinction between cancellation, timeout, repository absence, and ordinary Git failures.
2. Give each DiffSession recompute a named deadline and AbortController. Abort on root changes, replacement reads, and disposal; publish deadline errors only for the current read and retain revision-based result guards.
3. Add focused coverage for child-process abortion, a deadline followed by a successful refresh, and a root change during a stalled read. Keep existing diff parsing, context, activation, rename, and concurrency coverage passing.
4. Update the diff-tab spec to describe deadline recovery and root-change or close cancellation.

## Tests

- Add focused tests in `src/plugins/diff/change-set-cancellation.test.ts` and `src/plugins/diff/context-cancellation.test.ts` for cancellation propagation, aborted untracked batches, and context expansion.
- Extend `src/plugins/diff/session-context.test.ts` for deadline recovery, root replacement, and disposal cancellation.
- Run `./scripts/run.mjs check-diff` after each implementation step and after the spec and backlog edits.

## Out of scope

- Changing diff output, polling cadence, untracked-file concurrency, or ordinary Git error messages.
- Changing the diff tab's payload contract or adding user-facing controls.
