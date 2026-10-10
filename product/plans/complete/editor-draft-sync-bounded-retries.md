# Retry failed editor draft synchronization

Complexity: 4/10

## Goal

Recover transient failures when sending an editor's current draft while its transport remains connected, without letting persistent failures retry indefinitely or coupling draft sync to disk saving.

## Approach

Add a small capped retry budget to `DraftSync`. Use its existing timer for retry backoff and preserve the pending-attempt identity as the single-flight and stale-transport guard. Retries send the latest desired text. A new edit or accepted send resets the budget; disconnection and detach cancel scheduled work. Keep the existing debounce for edits and reconnect behavior.

## Implementation steps

1. Add bounded retry state and a named retry delay/cap to `web/src/editor/draft-sync.ts`, keeping retries on the existing timer and resetting or cancelling them at the appropriate lifecycle transitions.
2. Extend `web/src/editor/draft-sync.test.ts` for connected failure followed by success, exhausted retries, replacing text during backoff, and detach during backoff. Preserve existing reconnect, replacement-transport, and late-acknowledgement behavior.
3. Update the editor-tab spec and existing editor user documentation to describe recovery after transient send failures while connected.
4. Remove only this item from `product/backlog/technical-debt.md` and promote this plan to complete.

## Tests

- Cover retry success without another edit, the finite retry cap, latest-text delivery after a new edit during backoff, and timer cancellation on detach.
- Run `./scripts/run.mjs check-diff` after each implementation, test, spec, documentation, and backlog step.

## Out of scope

- Persisting drafts, changing the server's idempotent draft update, or changing disk-save behavior.
- Retrying while disconnected, changing the normal typing debounce, or reporting retry state in the editor UI.
