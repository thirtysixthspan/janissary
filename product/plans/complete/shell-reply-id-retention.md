# Limit shell reply-id retention

**Complexity: 3/10** — one client-owned `Set` replaces duplicate per-reply tracking across two shell hooks, while terminal marker state keeps its existing attachment lifecycle.

## Goal

Keep one additional reply-id entry for each background reply during the lifetime of the shell tab, including across terminal reattachments. A reply delivered before its dispatch receipt must still suppress a late marker, and retained replies must not write again into a newly attached terminal.

## Approach

Create the stable reply-id tracker in `ShellTab`, whose lifetime outlasts terminal attachments. Pass that same `Set` to `useBackgroundReplies` and `useShellReplyWriters`. Background subscription deduplication and the writer's late-receipt check then share the same entry. Keep `ReplyMarkers.entries` scoped to one terminal attachment and remove its `written` set.

This retains the existing behavior for same-id receipts, refusals, unknown replies, and marker resets. It removes only the second growing set of IDs, which currently belongs to `ReplyMarkers`.

## Implementation steps

1. Add a stable reply-id `Set` at the shell tab level and pass it through the terminal hook chain to both reply hooks.
2. Use the shared set for background replay suppression, reply settlement, and late receipt checks; make terminal marker state contain only active entries and reset those entries on attachment as it does today.
3. Update the hook tests for an early reply followed by its receipt, duplicate replay after terminal reattachment, and monitor replies without a second retained set.
4. Update the shell tab spec to state that a reply already delivered before terminal reattachment is not written into the new terminal. Check existing help and user documentation; no wording change is planned because those pages already describe each reply as appearing once and do not describe reattachment replay.

## Tests

- In `useBackgroundReplies.test.ts`, verify shared-set deduplication across a replaying subscription and preserve line, monitor fallback, and settled-record delivery.
- In `useShellReplyWriters.test.ts`, verify an early reply suppresses a later receipt even after marker state resets; keep same-id, refusal, and reset coverage; verify monitor replies add only to the shared tracker and do not create a second set.
- Run `$janissary/scripts/run.mjs check-diff` after each change and at completion.

## Out of scope

- Changing server-side reply retention or replay behavior.
- Changing ACP dispatch receipts, reply placement, marker appearance, or terminal output.
- Changing public help or user documentation that already describes settled replies as appearing once.
