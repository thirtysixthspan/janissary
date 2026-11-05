# Model provider timeout reason

**Complexity: 2/10** — one shared error classifier and focused regression coverage restore the provider timeout contract.

## Goal

Report the exact `timed out after 30 s` reason when a process-backed model provider reaches its `execFile` deadline, while preserving caller cancellation as a separate failure.

## Approach

Node marks an `execFile` timeout error with `killed: true` and a signal, while aborting through the supplied `AbortSignal` produces an `AbortError` with code `ABORT_ERR`. Extend the shared timeout classifier to recognize the process timeout shape only when it is not an abort. Keep existing `TimeoutError` and `ETIMEDOUT` handling for network and other timeout cases.

## Implementation steps

1. Update `isTimeout` in `src/models/providers/result.ts` to recognize a killed child-process error and exclude `AbortError` and `ABORT_ERR`.
2. Add Codex provider tests for the Node `execFile` timeout error shape and for caller abort classification. Retain the existing `ETIMEDOUT`, Anthropic network timeout, and refresh-summary wording tests.
3. Update `product/specs/harness.md` with the exact timeout wording used by the model refresh summary.

## Tests

- A provider command error with the Node timeout shape is reported as `failed: timed out after 30 s`.
- An `AbortError` / `ABORT_ERR` is not mistaken for a timeout.
- Existing `ETIMEDOUT`, network `TimeoutError`, and `codex failed: timed out after 30 s.` summary coverage remains green.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Changing the timeout duration, aborting refresh behavior, provider parsing, or catalog merge behavior.
- Implementing the catalog manager or Models tab UI.
