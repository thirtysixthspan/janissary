# Pin the close reason in the remote edit settlement test

**Complexity: 1/10** — test-only change: 0 production lines, 0 production files, 0 requirements (p=1.58)

## Goal

The remote `editFile` settlement test claims close, connection end, and timeout each resolve as failure values with their named reasons, but the close case only asserts `{ ok: false }`. Pin the closed-navigator reason so a wrong or empty reason reaching the agent fails the test.

## Approach

In `src/file-navigator/remote/port.test.ts`, assert the close branch of `resolves an edit as a failure value on close, connection end, and timeout` with `toEqual({ ok: false, reason: CLOSED_REASON })`, importing the shared `CLOSED_REASON` constant from `src/file-navigator/remote/port-requests.ts` so the test tracks the constant rather than a duplicated string. Discrepancy found while implementing: the test's close branch fired the channel listener's `onClose`, which is the connection ending and settles with `ENDED_REASON`, not `CLOSED_REASON`. Only `dispose()` (closing the navigator) settles with `CLOSED_REASON`. Rather than weaken the assertion, the close branch now closes the navigator with `dispose()` and pins `CLOSED_REASON`, and a separate branch fires the channel `onClose` and pins `ENDED_REASON`. No production change is needed.

## Implementation steps

1. Add `CLOSED_REASON` and `ENDED_REASON` to the existing `./port-requests.js` import in the test.
2. Drive the close case through `port.dispose()` and assert `toEqual({ ok: false, reason: CLOSED_REASON })`.
3. Add a channel-close case that fires the listener's `onClose` and asserts `toEqual({ ok: false, reason: ENDED_REASON })`.

## Tests

- Closing the navigator pins the exact failure value `The remote file navigator is closed.`
- A channel close pins `The remote connection ended.`
- The error-reply connection-end and timeout cases are unchanged and stay green.

## Out of scope

- Any change to how the port settles requests.
- Spec or documentation changes; user-visible behavior is unchanged.
