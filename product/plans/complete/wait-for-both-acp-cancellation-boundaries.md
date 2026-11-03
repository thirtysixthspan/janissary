# Wait for both ACP cancellation boundaries

**Complexity: 6/10** — separate the provider's terminal signal from cancellation release, then require both it and the cancellation notification write before releasing the turn. Preserve the close path's ability to settle waiters without waiting on a stuck write.

## Goal

An ACP turn remains reserved until its provider turn has drained and the native cancellation notification write has completed successfully. A failed notification after provider drain must not publish a successful terminal callback.

## Approach

Give each provider turn an explicit drain signal that resolves when its terminal callback arrives, independently of whether that callback can yet be published. During cancellation, await both the notification write and the drain signal before clearing `notificationPending` and flushing the terminal callback. Keep release-on-close separate so session closure can unblock cancellation waiters even if the notification write never settles. Let notification rejections propagate unchanged.

## Implementation steps

1. Update `src/acp/prompt-control.ts` so provider terminal arrival resolves the drain signal, cancellation waits for both independent boundaries, and `release()` can still settle cancellation waiters without waiting for an unresolved notification.
2. Extend `src/acp/prompt-control.test.ts` with a provider-first test that verifies callbacks and successor admission stay blocked until notification success, and a notification-rejection-after-provider-drain test that verifies no successful terminal callback is published.
3. Update `product/specs/acp.md` to state that cancellation keeps the request reserved until both the notification write and original provider turn finish, and that failed notification writes do not settle as successful cancellation.

## Tests

- `src/acp/prompt-control.test.ts`: provider drain first, including blocked callback and admission until notification completion; notification rejection after provider drain; existing notification-first, close/release, and rejection behavior.
- Existing `src/acp/index.test.ts` local cancellation tests and `src/remote/acp-session.test.ts` drain/reuse tests continue to verify that the next prompt is admitted only after the original turn is safe to release.

## Out of scope

- Changes to local or remote transport protocols and their adapters.
- Cancellation timeouts, forced provider termination, or changes to manager-level cancellation policy.
- PR description edits or changes to other backlog entries.
