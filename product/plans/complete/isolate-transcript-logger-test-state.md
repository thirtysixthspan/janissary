# Isolate TranscriptLogger test state

**Complexity: 2/10** — test-fixture lifecycle only; no production behavior changes.

## Goal

Prevent transcript logger tests from leaving subscribed listeners that write to temporary directories after those directories have been removed.

## Approach

Give every logger constructed by the test file a fixture-local project directory and unsubscribe it before removing that directory. The bus-event tests must not rely on the stale static path left by earlier I/O tests.

## Implementation steps

1. Track and unsubscribe each logger in the I/O tests before deleting its fixture directory.
2. Give bus-event tests a live temporary project directory, track their loggers, and unsubscribe them during cleanup.
3. Keep the existing append and bus assertions, adding a regression assertion that emission after cleanup does not produce a listener error.

## Tests

- Run the focused `src/transcript/logger.test.ts` test and the diff-scoped checks.
- Confirm fixture cleanup occurs after every created logger has unsubscribed.

## Spec and documentation

No spec or public documentation change is needed because runtime behavior is unchanged.

## Out of scope

- Changing `TranscriptLogger` production state or its API.
- Changing the message bus error-reporting behavior.
